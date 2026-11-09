# brandon-harris.com

Personal site for Brandon Harris, built with Hugo and PaperMod, plus the
incident-simulator Cloudflare Worker under `workers/`.

## Requirements

- Hugo 0.169.0 extended (see `.hugoversion`)
- Node.js 22.12+ for the worker and its React UI

## Site

```bash
# Local server with drafts
hugo server -D

# Production build
hugo --gc --minify
```

The build writes to `public/`. Cloudflare Pages builds with
`.cloudflare/pages.toml` and the same pinned Hugo version.

Content lives in `content/`:

- `posts/` — curated external writing
- `projects/` — project landing pages
- `archive/` — historical posts preserved at their original URLs
- `about.md` — profile page

## Worker

```bash
cd workers/incident-simulator
npm ci
npm run typecheck
npm test
npm run dev
```

The UI is built from `workers/incident-simulator/ui` and served by the worker.
Deploy with `npm run deploy` after authenticating Wrangler.

## Theme

PaperMod is vendored under `themes/PaperMod/`. Update it by copying a release
from <https://github.com/adityatelange/hugo-PaperMod> and running the Hugo build
before committing. The copies under `layouts/_default/` and
`layouts/partials/templates/` only update the theme's language API calls for
Hugo 0.169; remove them once upstream PaperMod includes the same changes.
