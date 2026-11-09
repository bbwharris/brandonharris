import { describe, expect, it } from 'vitest';
import { buildConnectionInfo, parseUserAgent, safeIp, safeText } from '../src/connection';
import { handleRequest, type Env } from '../src/index';

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

function requestWithCf(
  url: string,
  cf: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  const request = new Request(url, { headers });
  Object.defineProperty(request, 'cf', { value: cf });
  return request;
}

function testEnv(overrides: Partial<Env> = {}): Env {
  const assets = {
    fetch: async () => new Response('<!doctype html><title>Connection Info</title>', {
      headers: { 'Content-Type': 'text/html' },
    }),
  } as unknown as Fetcher;

  const rateLimit = {
    limit: async () => ({ success: true }),
  } as unknown as RateLimit;

  return {
    ASSETS: assets,
    CONNECTION_RATE_LIMIT: rateLimit,
    ...overrides,
  };
}

describe('connection info sanitization', () => {
  it('strips control characters and truncates text', () => {
    expect(safeText('  hello\u0000world  ')).toBe('hello world');
    expect(safeText(undefined)).toBe('Unknown');
    expect(safeText('x'.repeat(200), 'Unknown', 10)).toHaveLength(10);
  });

  it('accepts IP addresses and rejects injected values', () => {
    expect(safeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(safeIp('2001:db8::1')).toBe('2001:db8::1');
    expect(safeIp('203.0.113.7<script>')).toBe('Unknown');
    expect(safeIp(undefined)).toBe('Unknown');
  });

  it('parses browser and OS without trusting the user agent', () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({ browser: 'Chrome', os: 'macOS' });
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: 'Safari', os: 'iOS' });
    expect(parseUserAgent(EDGE_WINDOWS)).toEqual({ browser: 'Edge', os: 'Windows 10/11' });
  });
});

describe('buildConnectionInfo', () => {
  it('returns only the expected fields and normalized values', () => {
    const request = requestWithCf(
      'https://info.brandon-harris.com/api/connection-info',
      {
        asOrganization: 'Example ISP',
        colo: 'AUS',
        country: 'US',
        httpProtocol: 'HTTP/2',
        tlsVersion: 'TLSv1.3',
        warp: 'off',
      },
      {
        'CF-Connecting-IP': '203.0.113.7',
        'CF-Ray': '8f00f00f00f00f00-AUS',
        'User-Agent': CHROME_MAC,
      },
    );

    const info = buildConnectionInfo(request);

    expect(info).toMatchObject({
      ip: '203.0.113.7',
      isp: 'Example ISP',
      pop: 'AUS',
      country: 'US',
      http: 'HTTP/2',
      tls: 'TLSv1.3',
      warp: 'off',
      browser: 'Chrome',
      os: 'macOS',
      cfRay: '8f00f00f00f00f00-AUS',
    });
    expect(info).not.toHaveProperty('userAgent');
    expect(info).not.toHaveProperty('proxy');
  });
});

describe('handleRequest', () => {
  it('returns connection info with security headers', async () => {
    const request = requestWithCf(
      'https://info.brandon-harris.com/api/connection-info',
      { asOrganization: 'Example ISP', colo: 'AUS', country: 'US', httpProtocol: 'HTTP/2', tlsVersion: 'TLSv1.3' },
      { 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': CHROME_MAC },
    );

    const response = await handleRequest(request, testEnv());
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(body.ip).toBe('203.0.113.7');
  });

  it('rejects cross-site and disallowed-origin requests', async () => {
    const crossSite = await handleRequest(new Request('https://info.brandon-harris.com/api/connection-info', {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    }), testEnv());

    const badOrigin = await handleRequest(new Request('https://info.brandon-harris.com/api/connection-info', {
      headers: { Origin: 'https://evil.example' },
    }), testEnv());

    expect(crossSite.status).toBe(403);
    expect(badOrigin.status).toBe(403);
  });

  it('rate limits API requests', async () => {
    const rateLimit = {
      limit: async () => ({ success: false }),
    } as unknown as RateLimit;

    const response = await handleRequest(
      new Request('https://info.brandon-harris.com/api/connection-info'),
      testEnv({ CONNECTION_RATE_LIMIT: rateLimit }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('only allows GET and HEAD', async () => {
    const response = await handleRequest(new Request('https://info.brandon-harris.com/api/connection-info', {
      method: 'POST',
    }), testEnv());

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('redirects the root to the canonical page', async () => {
    const response = await handleRequest(new Request('https://info.brandon-harris.com/'), testEnv());

    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('/connection-info');
  });

  it('redirects workers.dev requests to the custom domain', async () => {
    const response = await handleRequest(
      new Request('https://connection-info.bbwharris.workers.dev/connection-info'),
      testEnv(),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('https://info.brandon-harris.com/connection-info');
  });

  it('serves the page and strips the body for HEAD', async () => {
    const page = await handleRequest(new Request('https://info.brandon-harris.com/connection-info'), testEnv());
    const head = await handleRequest(new Request('https://info.brandon-harris.com/connection-info', {
      method: 'HEAD',
    }), testEnv());

    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
