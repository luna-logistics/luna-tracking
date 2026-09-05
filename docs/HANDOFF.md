# Luna Tracking Logistics — scaffold handoff

Written 2026-09-04 at the end of the initial scaffold pass. Codebase location: `C:\luna-tracking-git\app\frontend`.

## What was kept vs cut vs adapted (relative to Homie Book)

**Kept (verbatim or lightly renamed):**
- Vite + React + TypeScript + Tailwind + Supabase-JS foundation
- shadcn UI primitives (Button, Input, Label, Card, Textarea, Select, Switch, Sonner toast)
- SEO component pattern (react-helmet-async, self-canonical default, direct-DOM noindex effect)
- HreflangTags pattern (registry-driven, x-default → FR)
- RouteErrorBoundary (blank-viewport safety net)
- Language switcher pattern (registry-driven, session-only visit language, explicit preference persistence)
- i18n two-value model (`i18n_visit_language` in sessionStorage + `i18n_language`/`i18n_lang_explicit` in localStorage) — recolored for FR/EN only
- URL registry pattern (single source of truth driving router + sitemap + hreflang + language switcher)
- Sitemap-integrity build gate pattern (registry ↔ _redirects cross-check — the "on disk" leg is deferred until prerender is restored, see follow-ups)
- `main.tsx` fallback-SEO-strip pattern that fixes the double-canonical leak on non-prerendered URLs

**Cut (Homie Book beauty-marketplace specific):**
- Every provider / booking / marketplace / zone / loyalty / promo / pack / intake / assistant / converter / accounting / invoice / blog / geo-import / DeepL / IndexNow / merchant / verification / attribution page and component
- Capacitor / Android shell and the entire mobile-app build path
- Prerender data-fetching layer (Homie Book pulls SEO/service/provider/blog rows from Supabase at build time — Luna's meta ships from the locale files for now)
- Vite prerender plugin (`vite-prerender-plugin`) — attempted, tripped on a plugin-internal `TypeError: e.match is not a function` during post-render HTML processing. Flagged as a critical follow-up (see below) rather than shipped broken. Until it lands, crawlers see the SPA shell on public URLs and per-page SEO tags arrive only after JS hydration.
- Homie Book brand colors (amber-500 palette) and stone-50 ground — replaced with Luna navy/cyan
- Google Analytics + GA4 consent-mode dance in index.html (add later once we have a decision on analytics)
- Self-hosted Lora + Inter fonts (system stack for now; flag as follow-up)
- The 90+ locale keys tied to beauty concepts

**Adapted:**
- i18n reduced from 4 locales (fr/en/nl/es) to 2 (fr/en). URL registry, hreflang, sitemap, LanguageSwitcher all re-derived from `SUPPORTED_LANGS = ['fr', 'en']`.
- Router structure: two top-level branches only (`/*` FR + `/en/*` EN), no `/nl/*` or `/es/*`.
- `_redirects`: kept the trailing-slash 301 pattern and the SPA fallback rule; removed Homie Book's beauty-specific route rewrites.
- `_headers`: kept the noindex-on-private-surfaces pattern, updated for Luna's route names.

## How SEO invariants are enforced

1. **Every URL has a 1:1 FR/EN pair.** The URL registry (`src/lib/url/routes.ts`) is the single source of truth. `check-i18n.mjs` fails the build if a bilingual route is missing either slug.
2. **No trailing slashes.** `_redirects` line `/*/  /:splat  301` — enforced at the edge, not by convention.
3. **Self-canonical everywhere.** `SEO.tsx` defaults `canonical` to `window.location.origin + pathname` (never the dirty full URL with query/hash). Every page mounts `<SEO>`.
4. **hreflang always cross-references the pair.** `HreflangTags.tsx` asks the registry: it emits `fr`, `en` (if bilingual), and `x-default → FR`. FR-only routes get no `en` alternate.
5. **Dynamic sitemap from the registry.** `generate-sitemap.mjs` reads `allIndexableUrls()`, walks `dist/` to confirm each URL has a prerendered file, emits `sitemap.xml`. `check-sitemap.mjs` cross-checks emitted URLs against `dist/_redirects` — a URL that redirects fails the build.
6. **Unique meta per page per locale.** Each page's `<SEO>` reads its title/description from its own locale keys — no shared defaults, so a page can't inherit another page's meta.
7. **Semantic HTML.** Every page has a single `<h1>`. `<html lang>` is set both via Helmet AND a direct-DOM effect in `SEO.tsx` (Helmet doesn't reliably update `<html lang>` on SPA language flips).
8. **⚠ SPA-only public rendering — DEFERRED chantier.** The `vite-prerender-plugin` port errored during build. Rather than ship a half-broken prerender, the plugin is removed and public pages are pure SPA for now: crawlers see the empty shell + Helmet-injected tags after JS runs. Google handles this (JS rendering) but slower to index and lower priority. Restoring prerender is the #1 SEO follow-up before we chase rankings.
9. **Fallback-SEO strip.** `main.tsx` scrubs the home's canonical/description/og/hreflang tags from any non-prerendered URL BEFORE mount so react-helmet-async writes fresh instead of appending duplicates — the same double-canonical class-of-bug that hurt Homie Book in August. In the current SPA-only state this is a no-op (every URL serves the same index.html and there ARE no fallback tags to strip because we haven't baked any), but the code is in place ready for when prerender comes back.

## Congo destination cities — approach

Seeded 6 cities in the initial migration (`supabase/migrations/20260904000000_destination_cities.sql`), chosen for population + trade-route relevance for Belgium↔DRC freight:

| City | Status at launch | Why |
|------|------------------|-----|
| **Kinshasa** | `active` | Capital, primary import destination, only city Luna serves at launch |
| Matadi | `coming_soon` | Main Atlantic seaport — usually the actual arrival point for maritime freight to Kinshasa |
| Lubumbashi | `coming_soon` | Katanga mining hub, DRC's second city |
| Mbuji-Mayi | `coming_soon` | Kasai region, third-largest |
| Kisangani | `coming_soon` | Congo river hub, eastern trade |
| Goma | `coming_soon` | North Kivu, Great Lakes corridor |

**UI handling in the quote form (`/tarifs`):**
- All 6 cities appear in the destination `<Select>`
- Non-active cities are marked `disabled` and get an inline `— Bientôt disponible / Coming soon` suffix
- They render greyed-out and cannot be picked, but the customer sees Luna's roadmap at a glance

**Admin (`/admin/destinations`):**
- Full table of all cities with a per-row Switch to toggle `active ⇄ coming_soon`
- Optimistic update, reverts on network error
- Any signed-in user can toggle at this stage — real role-gating waits until we have a `profiles.role` column

Cities are managed by status only, never hard-deleted, so we keep the quoting history intact.

## Manual steps required — TO DO before deploy

1. **Create a Supabase project**
   - Go to <https://supabase.com/dashboard/new/project>
   - Name it `luna-tracking-logistics` (or your naming preference)
   - Region: `eu-west-3` (Paris) or `eu-central-1` (Frankfurt) — physically nearest to Belgium
   - Save the project reference, URL, anon key, service_role key
   - **Do NOT reuse the Homie Book project (`poipjvzuaiyllyvopveu`) — this is a separate business + separate data.**

2. **Apply the schema migration**
   - In Supabase dashboard → SQL editor → paste the content of `app/frontend/supabase/migrations/20260904000000_destination_cities.sql` → Run
   - Verify: 6 rows in `destination_cities`, RLS enabled, Kinshasa `active`, others `coming_soon`

3. **Local env**
   - `cd app/frontend && cp .env.local.example .env.local`
   - Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase → Project Settings → API
   - `pnpm install && pnpm dev` — verify `/tarifs` shows the destination dropdown with Kinshasa selectable

4. **Brand assets**
   - Drop `logo-on-white.jpeg` and `logo-on-navy.jpeg` into `app/frontend/public/brand/`
   - Generate favicons at <https://realfavicongenerator.net/> from the on-white logo → drop the outputs (`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `site.webmanifest`) into `app/frontend/public/`
   - Optional: 1200×630 share preview at `public/brand/og-default.jpg`

5. **Git**
   - `cd C:\luna-tracking-git && git init && git add . && git commit -m "initial scaffold"`
   - Create the GitHub repo `lunatrackinglogistics` (or preferred name) and push

6. **Cloudflare Pages project**
   - Cloudflare dashboard → Pages → Create → Connect to Git → pick the Luna repo
   - Framework preset: **Vite** (or None)
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Build output directory: `dist`
   - Root directory: `app/frontend`
   - Env vars (Settings → Environment variables → add for Production):
     - `NODE_VERSION=20`
     - `VITE_SUPABASE_URL=<from Supabase>`
     - `VITE_SUPABASE_ANON_KEY=<from Supabase>`

7. **DNS**
   - Point `lunatrackinglogistics.com` and `www.lunatrackinglogistics.com` at Cloudflare Pages (Custom domains tab)
   - Add a redirect rule (Cloudflare dashboard, Rules → Redirect Rules) `www.lunatrackinglogistics.com/* → https://lunatrackinglogistics.com/$1` (301) if www is added as a custom domain
   - Verify HTTPS is auto-provisioned by Cloudflare

8. **First indexing pass** (after DNS propagates + first successful deploy)
   - Add and verify the domain in Google Search Console
   - Submit `https://lunatrackinglogistics.com/sitemap.xml`
   - Optional: repeat for Bing Webmaster Tools

## Known follow-up chantiers (deferred, flagged, NOT built)

- **⚠ Static prerender for public pages** (biggest one). The `vite-prerender-plugin` port raised `TypeError: e.match is not a function` inside the plugin's post-render HTML injection step. Removed from the build so the rest of the scaffold ships clean. Options for the follow-up: (a) debug the plugin (source-map was unresolvable, worth trying with a fresh minimal `prerender.tsx` first), (b) switch to `vite-plugin-react-pages` / `vike` / an SSG pattern, or (c) run our own `renderToString` script post-`vite build` that writes per-route `dist/{path}/index.html` and let Cloudflare Pages serve them (no plugin needed). Options (c) is closest to what Homie Book does. Whichever path — the URL registry, hreflang, sitemap generator, and `main.tsx` fallback-strip are ALREADY wired for it to slot back in.
- **FileMaker Data API integration** for the real tracking backend — `src/lib/tracking.ts` is a typed stub; return type is stable so the UI does not change when the real implementation lands.
- **Quote form email delivery** — the form on `/tarifs` currently shows a confirmation card only; a future chantier writes to a Supabase table and sends via Resend.
- **Role-based admin gating** — any signed-in user can currently reach `/admin`. Future chantier: `profiles.role` column + RLS + a `RoleGuard` component.
- **Delivery-agent PWA / QR-code parcel tracking / Stripe payments** — deliberately not built per initial scope; placeholder-free (no dead code) so their chantiers start clean.
- **Google Analytics + cookie banner** — cut for now. Add once we decide on the analytics stack.
- **Brand fonts** — using system stack. If Luna's brand book specifies Inter / Poppins / etc., swap in via `@font-face` + `--font-heading` / `--font-body` in `src/index.css`.
- **Blog / knowledge base for SEO** — not scoped in this pass; the URL registry accepts a new key + a lazy page when we're ready.

## File map — where the important pieces live

| Concern | File(s) |
|---------|---------|
| Brand palette | `tailwind.config.ts` (extend.colors.luna.*), `src/index.css` (CSS vars) |
| URL registry | `src/lib/url/routes.ts` + `src/lib/url/routes.data.mjs` (ESM mirror for Node scripts) |
| i18n init | `src/i18n.ts` |
| Locale strings | `src/locales/fr.json` + `src/locales/en.json` |
| Supabase client | `src/lib/supabase.ts` |
| Auth context | `src/contexts/AuthContext.tsx` |
| SEO tags | `src/components/SEO.tsx` + `src/components/HreflangTags.tsx` |
| Router | `src/App.tsx` |
| Prerender | `src/prerender.tsx` (called by vite-prerender-plugin) |
| Sitemap | `scripts/generate-sitemap.mjs` + `scripts/check-sitemap.mjs` |
| i18n gate | `scripts/check-i18n.mjs` |
| Destination cities schema | `supabase/migrations/20260904000000_destination_cities.sql` |
| Cloudflare routing | `public/_redirects` + `public/_headers` |

---

## Addendum 2026-09-05 — Achat & Envoi + Réexpédition

Two new business lines added, both following the FR/EN parity + URL registry + Luna brand + Supabase pattern established in the initial scaffold. No hardcoded product data — everything comes from Supabase.

### What was built

**Achat & Envoi (Shop & Ship)** — `/achat-envoi` (FR) + `/en/shop-and-ship` (EN)
- Public catalog: category filter, product grid, cart sidebar (session-scoped), inline checkout (delivery details in Congo — reuses `destination_cities` for the recipient city dropdown with the same coming-soon greying).
- Product detail: `/achat-envoi/{slug}` — English slug shared across both locales, with `Product` JSON-LD (schema.org, offers, availability).
- Payment: stub `src/lib/payment.ts` returns a `deferred` status with a bilingual message; the order is written to Supabase as `pending_payment` first so Luna's team can follow up manually. Contract typed so a real gateway (Stripe / Mollie / Bancontact) drops in later without touching the checkout UI — same shape as the FileMaker tracking stub.
- Client area: `/compte/commandes` now shows real orders (status badge, items summary, total) instead of the placeholder.

**Réexpédition (International forwarding)** — `/reexpedition` (FR) + `/en/international-forwarding` (EN)
- Explainer page: hero, 3-step how-it-works with numbered IconCircles, US→Kinshasa + China→Matadi example scenarios, lead-capture form.
- Form writes to `forwarding_requests` (anon insert allowed by RLS — no login needed for a quote request).

**Admin surfaces (FR-only by convention)**
- `/admin/produits` — tabbed shell:
  - **List**: search (name/slug/barcode) + category filter, per-row active toggle, edit, delete.
  - **Add/Edit**: full product form with **barcode-scanner UX** — the barcode input auto-focuses on mount, on save the form resets and refocuses the barcode field, and a "Scanné : {barcode}" flash confirms the scan. USB/Bluetooth scanners that type as a keyboard work directly.
  - **CSV import** (PapaParse): row-by-row validation (required fields, numeric price/weight, `category_slug` exists, slug format), preview table with OK/Error labels + per-row error reasons, bulk insert only valid rows, summary of imported/skipped.
  - **Categories**: inline add/edit + delete (delete blocked when a product references the category — FK RESTRICT).
- `/admin/commandes` — orders list with status badge, expandable items breakdown, **Advance** button (linear workflow `pending_payment → paid → purchasing → purchased → shipped → delivered`) and **Cancel** (blocked on terminal `delivered`).
- `/admin/demandes-reexpedition` — leads list with inline status Select (`new → contacted → quoted → closed`).

**Data model** (see `supabase/migrations/20260905000000_shop_ship_and_forwarding.sql`)
- `product_categories` — slug + name_fr + name_en + display_order.
- `products` — English slug (URL identity), bilingual name/description, price, category FK, optional barcode (unique when set, format-validated), optional HS code, weight_kg, image_url, is_active.
- `orders` — user_id FK, `items` jsonb snapshot (frozen at checkout so a later product-price change never rewrites what the customer paid for), enum `status`, recipient_name/phone/address, `recipient_city_id` FK to `destination_cities` (reuses the coming-soon gating).
- `forwarding_requests` — anon-writable lead capture with enum `status`.
- RLS: catalog public read, self-scoped order read, anon forwarding insert. Admin gating still "any signed-in user" — hardening to a `profiles.role` column is a future chantier.

**Seed** (in the migration): 3 categories (Staples, Canned goods, Hygiene) × 10 realistic Belgian grocery products. Each product has bilingual name + description, price in €, real EAN-13-format barcode (5410xxxxxxxxx Belgian GS1 range), realistic HS tariff code (e.g. rice = 1006.30, sardines = 1604.13, soap = 3401.11), and weight. `image_url` is null everywhere — the UI shows a ShoppingCart icon placeholder per spec.

**SEO**
- Registry-driven — added `shopAndShip` + `forwarding` + 3 admin routes to `src/lib/url/routes.ts`.
- Product detail pages get self-canonical + `productUrl(slug, lang)` helper — the language switcher swaps the parent path while preserving the slug (registry's `matchUrl` handles this via `matchProductUrl`).
- Sitemap generator (`scripts/generate-sitemap.mjs`) now fetches active product slugs from Supabase at build time via the REST API, emits `/achat-envoi/{slug}` + `/en/shop-and-ship/{slug}` for each. Degrades gracefully (WARN, empty product URLs, static-only sitemap) if Supabase unreachable — build never fails on a network hiccup.
- `check-i18n` gate now enforces 323 keys × 2 locales + 18 routes. `check-sitemap` still passes.

**Nav updates**
- Public Navbar: added "Achat & Envoi" and "Réexpédition" links (6 primary links total).
- Admin sidebar: added Products, Orders, Forwarding entries with lucide icons.

### Decisions made worth confirming

1. **Payment gateway not wired** — checkout creates the order in Supabase then shows the deferred-payment message. Which gateway to pick (Mollie for BE-focused / Stripe for global / Bancontact-only) is your call before we build.
2. **Admin role gating** — for now, ANY authenticated user can reach `/admin/*` and modify products/orders/leads. Fine while the team is 1–2 people; needs a `profiles.role` column + RoleGuard before opening signup to real customers.
3. **Product images** — spec said use a placeholder icon, not real images. The `image_url` field exists in the schema and CSV import supports it, but no UI upload yet. Follow-up: image upload to Supabase Storage bucket + generation of variant sizes.
4. **Seed products** — I chose 10 realistic Belgian grocery items across staples/canned/hygiene. Confirm you want these to ship live or if we should clear the seed before real catalog data. The seed uses `on conflict do nothing` so re-running the migration is safe.
5. **Anon forwarding requests** — the RLS policy allows anon insert on `forwarding_requests` (no login needed). Add reCAPTCHA/Turnstile if spam becomes an issue.
6. **Order status workflow is linear** (`pending_payment → paid → purchasing → purchased → shipped → delivered` with `cancelled` as escape hatch). No branching; the "Advance" button jumps one step forward. Simplifies UX; if you need per-transition permissions later, `nextStatus()` in `src/lib/orders.ts` is where to change it.

### Manual steps required

1. **Run the new migration** on your Supabase project (SQL editor):
   ```
   app/frontend/supabase/migrations/20260905000000_shop_ship_and_forwarding.sql
   ```
   Verify: 4 new tables, 3 seeded categories, 10 seeded products, RLS enabled on all.
2. **Rebuild + redeploy**:
   ```bash
   cd C:\luna-tracking-git\app\frontend
   pnpm build
   npx wrangler deploy
   ```
3. Optional CSV template for bulk import — the admin CSV import expects these columns:
   `slug, name_fr, name_en, description_fr, description_en, price, category_slug, barcode, hs_code, weight_kg, image_url`

### Follow-up chantiers (not built, flagged)

- Payment gateway integration (Mollie / Stripe / Bancontact — your pick).
- Product image upload UI + Supabase Storage bucket + resize pipeline.
- Admin role gating (`profiles.role` + RoleGuard).
- Order-status email notifications (Resend / Postmark) — e.g. auto-email the customer when status flips to `shipped`.
- Anti-spam on the forwarding form (Turnstile).
- Product-detail JSON-LD is basic — add breadcrumbs schema when the catalog grows deeper.
