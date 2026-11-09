import { buildConnectionInfo, safeIp } from './connection';

export interface Env {
  ASSETS: Fetcher;
  CONNECTION_RATE_LIMIT: RateLimit;
}

const ALLOWED_ORIGINS: Record<string, true> = {
  'https://info.brandon-harris.com': true,
  'https://brandon-harris.com': true,
  'https://www.brandon-harris.com': true,
};

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
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

function secure(response: Response, cacheControl = 'no-store'): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  headers.set('Cache-Control', cacheControl);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return secure(Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  }));
}

function redirectResponse(location: string): Response {
  return secure(new Response(null, {
    status: 308,
    headers: { Location: location },
  }));
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;

  return ALLOWED_ORIGINS[origin] === true || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (url.hostname.endsWith('.workers.dev')) {
    const targetPath = pathname === '/' ? '/connection-info' : `${pathname}${url.search}`;
    return redirectResponse(`https://info.brandon-harris.com${targetPath}`);
  }

  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (!isAllowedOrigin(request)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (pathname === '/') {
    return redirectResponse('/connection-info');
  }

  if (pathname === '/connection-info/') {
    return redirectResponse('/connection-info');
  }

  if (pathname === '/connection-info') {
    const assetRequest = new Request(new URL('/index.html', url), request);
    return secure(await env.ASSETS.fetch(assetRequest));
  }

  if (pathname === '/api/connection-info') {
    const ip = safeIp(request.headers.get('CF-Connecting-IP'));

    if (env.CONNECTION_RATE_LIMIT) {
      const outcome = await env.CONNECTION_RATE_LIMIT.limit({ key: ip });

      if (!outcome.success) {
        return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': '60' });
      }
    }

    return jsonResponse(buildConnectionInfo(request));
  }

  if (pathname === '/health') {
    return jsonResponse({ status: 'ok' });
  }

  const asset = await env.ASSETS.fetch(request);
  const cacheControl = pathname.endsWith('.css') || pathname.endsWith('.js')
    ? 'public, max-age=300'
    : 'no-store';

  return secure(asset, cacheControl);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const method = request.method;

  if (method !== 'GET' && method !== 'HEAD') {
    return secure(new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    }));
  }

  const response = await route(request, env);

  if (method === 'HEAD') {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('connection-info request failed', error);
      return jsonResponse({ error: 'Internal error' }, 500);
    }
  },
};
