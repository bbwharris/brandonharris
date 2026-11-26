import type { Env } from './env';

export const CANONICAL_ORIGIN = 'https://agents.brandon-harris.com';

export const ALLOWED_ORIGINS: Record<string, true> = {
  'https://brandon-harris.com': true,
  'https://www.brandon-harris.com': true,
  'https://agents.brandon-harris.com': true,
};

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' wss://agents.brandon-harris.com ws://localhost:8787 ws://127.0.0.1:8787",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  if (ALLOWED_ORIGINS[origin] || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }

  return null;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = getAllowedOrigin(request);
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

export function withSecurityHeaders(
  response: Response,
  cacheControl = 'no-store',
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  headers.set('Cache-Control', cacheControl);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function redirectResponse(location: string): Response {
  return withSecurityHeaders(
    new Response(null, {
      status: 308,
      headers: { Location: location },
    }),
  );
}

function safeRateLimitKey(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) {
    return 'unknown';
  }
  return ip;
}

export type RouteAgentFn = (request: Request, env: Env) => Promise<Response | null>;

export async function handleWorkerFetch(
  request: Request,
  env: Env,
  routeAgent: RouteAgentFn,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Redirect workers.dev requests to the canonical custom domain
  if (url.hostname.endsWith('.workers.dev')) {
    const targetPath = pathname === '/' || pathname === '/incident'
      ? '/incident/'
      : `${pathname}${url.search}`;
    return redirectResponse(`${CANONICAL_ORIGIN}${targetPath}`);
  }

  const origin = request.headers.get('Origin');
  if (origin && !getAllowedOrigin(request)) {
    return withSecurityHeaders(new Response('Forbidden', { status: 403 }));
  }

  if (request.method === 'OPTIONS') {
    return withSecurityHeaders(
      new Response(null, { status: 204 }),
      'no-store',
      {
        ...corsHeaders(request),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    );
  }

  // Canonicalize root and /incident paths to /incident/
  if (pathname === '/' || pathname === '/incident') {
    return redirectResponse('/incident/');
  }

  const isAgentPath = pathname.startsWith('/agents/') || pathname.startsWith('/incident/agents/');

  if (isAgentPath) {
    if (env.INCIDENT_RATE_LIMIT) {
      const outcome = await env.INCIDENT_RATE_LIMIT.limit({ key: safeRateLimitKey(request) });
      if (!outcome.success) {
        return withSecurityHeaders(
          Response.json({ error: 'Too many requests' }, { status: 429 }),
          'no-store',
          { 'Retry-After': '60', ...corsHeaders(request) },
        );
      }
    }

    const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
    const response = await routeAgent(request, env);

    if (response) {
      if (isWebSocket) {
        return response;
      }

      return withSecurityHeaders(response, 'no-store', corsHeaders(request));
    }
  }

  if (env.ASSETS) {
    if (pathname === '/incident/') {
      const indexRequest = new Request(new URL('/incident/index.html', url), request);
      return withSecurityHeaders(await env.ASSETS.fetch(indexRequest), 'no-store');
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status === 404 && pathname.startsWith('/incident/') && !pathname.includes('.')) {
      const indexRequest = new Request(new URL('/incident/index.html', url), request);
      return withSecurityHeaders(await env.ASSETS.fetch(indexRequest), 'no-store');
    }

    const cacheControl = pathname.startsWith('/incident/assets/')
      ? 'public, max-age=31536000, immutable'
      : pathname.endsWith('.js') || pathname.endsWith('.css') || pathname.endsWith('.svg') || pathname.endsWith('.png')
        ? 'public, max-age=300'
        : 'no-store';

    return withSecurityHeaders(assetResponse, cacheControl);
  }

  return withSecurityHeaders(
    new Response('Incident Response Simulator API Server\n\nUse WebSocket to connect to /agents/incident-agent/session', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}
