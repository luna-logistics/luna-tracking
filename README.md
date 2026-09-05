# Luna Tracking Logistics

Freight forwarding platform for Belgium ↔ Congo shipments. Marketing site + tracking + client area + admin.

Same technical foundation as Homie Book (React + Vite + TypeScript + Tailwind + Supabase, deployed on Cloudflare Pages) but a **separate business, separate codebase, separate Supabase project, separate domain**.

## Layout

```
app/frontend/          — Vite React app (this scaffold)
  src/
    components/        — reusable UI (Navbar, Footer, SEO, brand primitives)
    contexts/          — AuthContext (Supabase session)
    lib/               — utils, supabase client, cities/tracking API, URL registry
    locales/           — fr.json (default), en.json
    pages/             — one file per route
    prerender.tsx      — static-HTML generation for public pages
  scripts/             — build gates (check-i18n, generate-sitemap, check-sitemap)
  supabase/migrations/ — SQL migrations (destination_cities lives here)
  public/              — static assets (favicons, robots.txt, _redirects, _headers, brand images)
```

## Getting started (local)

1. Install pnpm: <https://pnpm.io/installation>
2. In `app/frontend`:
   ```bash
   pnpm install
   cp .env.local.example .env.local
   # Fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from your Supabase project
   pnpm dev
   ```
3. Add brand images to `app/frontend/public/brand/`:
   - `logo-on-white.jpeg` (on-light-background variant)
   - `logo-on-navy.jpeg` (on-dark-background variant)
   - Optional `og-default.jpg` (1200×630 share preview)

## Manual steps required before first deploy

See the handoff report in `docs/HANDOFF.md` for the full checklist (Supabase project creation, DNS, Cloudflare Pages).

## Build gates

`pnpm build` runs, in order:
1. `check-i18n` — fr.json / en.json key parity + URL registry sanity
2. `tsc --noEmit` — type check
3. `vite build` — bundle + prerender the 8 static routes
4. `generate-sitemap` — emit `dist/sitemap.xml` from the URL registry
5. `check-sitemap` — every emitted URL must exist on disk and not be redirected
