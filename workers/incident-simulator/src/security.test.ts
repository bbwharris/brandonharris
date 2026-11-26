import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import { CANONICAL_ORIGIN, handleWorkerFetch } from './security';

function makeEnv(overrides: Partial<Env> = {}): Env {
  const assets = {
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === '/incident/index.html') {
        return new Response('<!doctype html><title>Incident Simulator</title>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.pathname.startsWith('/incident/assets/')) {
        return new Response('console.log("app")', {
          headers: { 'Content-Type': 'application/javascript' },
        });
      }
      return new Response('Not Found', { status: 404 });
    },
  } as unknown as Fetcher;

  const rateLimit = {
    limit: async () => ({ success: true }),
  } as unknown as RateLimit;

  return {
    IncidentAgent: {} as Env['IncidentAgent'],
    AI: { run: async () => ({ response: '' }) },
    ASSETS: assets,
    INCIDENT_RATE_LIMIT: rateLimit,
    ...overrides,
  };
}

describe('incident-simulator worker security & routing', () => {
  it('redirects workers.dev traffic to the canonical custom domain', async () => {
    const root = await handleWorkerFetch(
      new Request('https://incident-simulator.bbwharris.workers.dev/'),
      makeEnv(),
      async () => null,
    );
    const subpath = await handleWorkerFetch(
      new Request('https://incident-simulator.bbwharris.workers.dev/incident/?foo=1'),
      makeEnv(),
      async () => null,
    );

    expect(root.status).toBe(308);
    expect(root.headers.get('Location')).toBe(`${CANONICAL_ORIGIN}/incident/`);
    expect(subpath.status).toBe(308);
    expect(subpath.headers.get('Location')).toBe(`${CANONICAL_ORIGIN}/incident/?foo=1`);
  });

  it('redirects root and /incident to /incident/', async () => {
    const root = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/'),
      makeEnv(),
      async () => null,
    );
    const noSlash = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/incident'),
      makeEnv(),
      async () => null,
    );

    expect(root.status).toBe(308);
    expect(root.headers.get('Location')).toBe('/incident/');
    expect(noSlash.status).toBe(308);
    expect(noSlash.headers.get('Location')).toBe('/incident/');
  });

  it('rejects disallowed origins and answers CORS preflight for allowed origins', async () => {
    const blocked = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/agents/incident-agent/session', {
        headers: { Origin: 'https://evil.example' },
      }),
      makeEnv(),
      async () => null,
    );

    const preflight = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/agents/incident-agent/session', {
        method: 'OPTIONS',
        headers: { Origin: 'https://brandon-harris.com' },
      }),
      makeEnv(),
      async () => null,
    );

    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('X-Frame-Options')).toBe('DENY');
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://brandon-harris.com');
    expect(preflight.headers.get('Vary')).toBe('Origin');
  });

  it('rate limits agent requests by IP', async () => {
    const rateLimit = {
      limit: async () => ({ success: false }),
    } as unknown as RateLimit;

    const response = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/agents/incident-agent/abc/session', {
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      }),
      makeEnv({ INCIDENT_RATE_LIMIT: rateLimit }),
      async () => new Response('ok'),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('attaches security headers to HTML and immutable cache headers to hashed assets', async () => {
    const html = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/incident/'),
      makeEnv(),
      async () => null,
    );
    const asset = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/incident/assets/index-abc123.js'),
      makeEnv(),
      async () => null,
    );

    expect(html.status).toBe(200);
    expect(html.headers.get('Cache-Control')).toBe('no-store');
    expect(html.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(html.headers.get('X-Content-Type-Options')).toBe('nosniff');

    expect(asset.status).toBe(200);
    expect(asset.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('returns WebSocket upgrade responses directly without re-wrapping', async () => {
    const wsResponse = new Response('upgraded', { status: 200 });
    const result = await handleWorkerFetch(
      new Request('https://agents.brandon-harris.com/agents/incident-agent/abc/session', {
        headers: { Upgrade: 'websocket' },
      }),
      makeEnv(),
      async () => wsResponse,
    );

    expect(result).toBe(wsResponse);
  });
});
