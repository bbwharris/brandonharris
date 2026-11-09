# Connection Info

A small Cloudflare Worker that reports the visitor's network path: IP address,
ISP/AS organization, Cloudflare PoP, country, HTTP/TLS versions, WARP state,
browser, and OS.

The page is served at `https://info.brandon-harris.com/connection-info`.

## Security

- GET/HEAD only; all other methods return 405.
- Same-origin API; no CORS headers are emitted.
- Cross-site and disallowed-origin requests return 403.
- API responses use Cloudflare's Rate Limiting binding (30 requests per 60
  seconds per client IP, approximate per Cloudflare location).
- Inputs are limited and sanitized before being returned.
- The API returns only normalized fields; raw headers and the Cloudflare `cf`
  object are never exposed.
- All responses include a strict CSP, `X-Frame-Options: DENY`, `nosniff`,
  no-referrer, permissions policy, HSTS, and no-store on HTML/JSON.
- The page uses external CSS/JS and DOM `textContent`; it does not render
  user-controlled values with `innerHTML`.
- `workers_dev` is disabled; the worker is exposed only through the custom
  domain.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

## Deploy

```bash
npm run deploy
```

The `wrangler.toml` route creates the `info.brandon-harris.com` custom domain.
