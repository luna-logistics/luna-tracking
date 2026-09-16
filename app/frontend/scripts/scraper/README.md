# Luna generic product scraping engine

A **generic-by-default, specific-only-by-necessity** scraping engine. Every
source funnels through the SAME `NormalizedProduct` shape already used by the
project, then the SAME eligibility filter (`src/lib/product-eligibility.ts`,
the authority) and the SAME admin CSV import. The scraper **never** writes to
the DB, **never** decides eligibility itself, and **never** auto-creates a
store.

```
SOURCE → DISCOVERY → FETCH → EXTRACTION → NORMALISATION → VALIDATION
       → ELIGIBILITY (existing filter) → PREVIEW/IMPORT (existing admin CSV)
```

## Layout
```
scripts/scraper/
  types.mjs          NormalizedProduct/RawProduct typedefs + constants
  http-fetcher.mjs   HTTP layer (timeout, retry+backoff, gzip, UA, rate limit) — knows no product fields
  url-utils.mjs      URL normalisation + dedup key (strips tracking, keeps variant params)
  robots.mjs         robots.txt reader (sitemap hints + informational Disallow)
  sitemap.mjs        sitemap.xml / index / .gz, prefers product sitemaps
  jsonld.mjs         schema.org Product from JSON-LD (@graph, offers array, brand/image variants, gtin/sku)
  html-meta.mjs      OpenGraph/product meta, microdata, <title>/canonical, embedded JSON, needsBrowser()
  weight.mjs         "500 g"/"1 kg"/"6 x 33 cl"/"12 pièces" → weight_kg (mass only; volume kept, not converted)
  platform.mjs       platform detection + Shopify products.json adapter
  extract.mjs        strategy orchestrator (JSON-LD → microdata → meta → title), merges + confidence
  normalize.mjs      RawProduct → NormalizedProduct (identity: GTIN→SKU→MPN→URL; never invents codes)
  dedup: url-utils.dedupKey + engine identity key
  pagination.mjs     page=/p=/offset/rel=next with loop + repeat guards
  discover.mjs       AUTO discovery: sitemap → categories/listings → pagination → product URLs (product-oriented, guardrails)
  detect.mjs         centralised protection/anomaly classifier (challenge/captcha/rate-limit/…)
  browser.mjs        Playwright fallback (installed): BrowserSession, CSR-only, capped, protection-aware
  probe.mjs          source auto-analysis (SOURCE ANALYSIS report)
  engine.mjs         orchestrator (discovery→…→eligibility→SCRAPE REPORT)
  csv.mjs            NormalizedProduct[] → admin-import CSV
  __tests__/         node:test unit tests (deterministic, no network)
../scrape.mjs        CLI
```

## Extraction priority
1. JSON-LD `Product` (best) → 2. microdata → 3. OpenGraph/meta → 4. `<title>`/canonical.
Platform-native structured data (e.g. Shopify `*.json`) is used when detected.
Playwright is a **fallback only**, for pages whose data appears after JS render.

## CLI
```bash
# analyse a new shop before building anything specific
pnpm scrape probe https://example.com

# AUTO-DISCOVERY from a shop URL (sitemap → categories → pagination → products)
# store must already exist in Admin → Magasins
pnpm scrape run --store my-store --origin https://example.com \
  --product-type food --category-slug cafe-the --limit 500 \
  --max-pages 150 --max-depth 3 --out out.csv
# --no-browser disables the Playwright fallback (HTTP-only); it is auto-on for
# CSR pages otherwise (capped by --max-browser, default 40).

# run against explicit product URLs
pnpm scrape run --store my-store --url https://example.com/p/1 --url https://example.com/p/2 --out out.csv

# tests
pnpm test:scraper
```
The `run` command writes a CSV in the **admin-import format**; load it in
**Admin → Produits → Import CSV** (preview + draft import + `product_sources`).
`category_slug` is left for the operator (categories are never auto-created).

## Playwright
Installed (`playwright` devDep + Chromium). HTTP-first: the browser renders
only pages detected as CSR (empty SPA shell / JS-required), capped, and its
output goes through the same protection classifier — a challenge/captcha under
the browser stops the source (no bypass). Re-install the browser binary with
`npx playwright install chromium` if missing.

## Adding a new source
Ideally just: **a URL + an existing store** (+ `--product-type`). Add a small
adapter under a future `adapters/` folder ONLY when the generic engine truly
can't extract a given site. The engine stays generic; specifics are the
exception.

## Guarantees / non-goals
- No DB writes, no migrations, no eligibility logic here (filter is the authority).
- Unknown `store_slug` → controlled error (no auto-create).
- Barcodes/SKUs never invented; prices never invented; volumes not converted to kg.
- No captcha/auth/protection bypass; polite rate limiting; a blocked page is
  reported, not circumvented.
