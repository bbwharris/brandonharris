# AGENTS.md - Agent Instructions for brandonharris

This is a Hugo static site for brandon-harris.com, a personal website/blog.

## Build Commands

```bash
# Development server with live reload
hugo server -D

# Build for production (used by Cloudflare Pages)
hugo --gc --minify

# Build with draft content
hugo --buildDrafts

# Clean build (remove public/ and rebuild)
rm -rf public/ && hugo --gc --minify
```

## Hugo Version

This site uses Hugo **0.120.0** (specified in `.hugoversion`).

## Project Structure

```
/Users/bbwharris/Documents/src/brandonharris/
├── config.toml          # Hugo site configuration
├── content/             # All site content (Markdown)
│   ├── _index.md        # Homepage
│   ├── about.md         # About page
│   ├── posts/           # Blog posts
│   └── archive/         # Historical posts (2009-2016)
├── static/              # Static assets (images, CSS, JS)
│   ├── images/
│   ├── stylesheets/
│   └── javascripts/
├── themes/PaperMod/     # Hugo theme (do not modify)
└── .cloudflare/         # Cloudflare Pages config
```

## Content Guidelines

### Frontmatter Format (YAML)

All content files use YAML frontmatter:

```yaml
---
title: "Post Title"
description: "Brief description for SEO"
author: "Brandon Harris"
date: 2024-01-15T12:00:00Z
draft: false
aliases:
  - old-url-path
---
```

### Content Types

- **Pages**: Static pages like `about.md`
- **Posts**: Blog content in `content/posts/`
- **Archive**: Historical content in `content/archive/`

### Markdown Style

- Use ATX-style headers (`#` not underlines)
- No trailing whitespace
- Blank line after headers
- Code blocks specify language for syntax highlighting
- Images use relative paths from `/images/`

## Code Style

### TOML Configuration

- Use snake_case for keys
- Group related settings in sections
- Quote all string values
- 4-space indentation for nested structures

### CSS (static/stylesheets/)

- Use lowercase with hyphens for class names
- Organize by component/section
- Minimize custom CSS (theme handles most styling)

### JavaScript (static/javascripts/)

- ES5 compatible (no modern syntax)
- jQuery is available (loaded globally)
- Place custom scripts in `static/javascripts/`

## Theme: PaperMod

- **Location**: `themes/PaperMod/`
- **Do not modify theme files directly**
- Override theme layouts by copying to `layouts/` root if needed
- Theme updates come from upstream (check theme repo)

## Common Tasks

### Add a new blog post

1. Create file: `content/posts/my-post.md`
2. Add YAML frontmatter with title, description, date
3. Write content in Markdown
4. Test locally: `hugo server -D`

### Add a static asset

1. Place images in `static/images/`
2. Reference with relative path: `/images/my-image.png`
3. Verify with local server

### Update site configuration

1. Edit `config.toml`
2. Key sections: `[params]`, `[menu]`, `[markup]`
3. Restart dev server to see changes

## Deployment

- **Platform**: Cloudflare Pages
- **Build command**: `hugo --gc --minify`
- **Output directory**: `public/`
- **Environment**: Production builds use `HUGO_ENV=production`

## Validation

Hugo has no formal test suite. Validate by:

```bash
# Check for build errors
hugo --gc --minify

# Verify all pages render
hugo server && curl -s http://localhost:1313 | head

# Check for broken links (requires external tool)
# hugo server && linkchecker http://localhost:1313
```

## Git Workflow

- Commit content changes with descriptive messages
- Build output (`public/`) is gitignored
- Theme updates require separate attention
- Preview builds on PR branches via Cloudflare Pages

## Security Notes

- No secrets in repository
- Site is static HTML/CSS/JS only
- Cloudflare handles CDN and security
- Contact forms use external services (none currently)
