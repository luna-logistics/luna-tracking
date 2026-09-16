# Luna scraper — autonomous usage (no Claude Code needed)

Run everything from `app/frontend/`.

## Install (once)
```bash
pnpm install
pnpm add -D playwright            # already in package.json; installs the lib
npx playwright install chromium   # downloads the browser (~200 MB)
```
Check: `pnpm test:scraper` should print `pass 54`.

## 1. Probe a shop (what/how, no scraping)
```bash
pnpm probe --origin "https://example.com"
```
Shows platform, discovery method, rendering (SSR/CSR), and product-field coverage on a sample page.

## 2. Scrape a shop (automatic discovery)
```bash
pnpm scrape --origin "https://example.com" --store my-store --product-type food \
  --category-slug cafe-the --limit 500 --max-pages 150 --max-depth 3 --workers 4
```
- `--store` must already exist in **Admin → Magasins** (unknown store = error, never auto-created). Omit it to scrape without a store (the CSV's `store_slug` stays blank; fill it before importing).
- Discovery order: sitemap → categories/listings → pagination → product URLs.
- Output (printed at the end):
  - CSV → `scraper-output/csv/<JOB_ID>.csv` (+ `-to-verify.csv`)
  - Report → `scraper-output/reports/<JOB_ID>.{json,txt}`
  - Job state → `scraper-output/jobs/<JOB_ID>/`

Scrape explicit product URLs instead of a whole shop:
```bash
pnpm scrape --store my-store --url "https://example.com/p/1" --url "https://example.com/p/2"
```

## 3. Browser fallback (CSR sites)
HTTP-first; Playwright renders only pages detected as CSR, capped by `--max-browser` (default 40).
```bash
pnpm scrape --origin "https://spa-shop.com" --store my-store            # auto-uses browser for CSR pages
pnpm scrape --origin "https://example.com" --store my-store --no-browser # HTTP only
```

## 4. Manual intervention (CAPTCHA / Cloudflare / login) — no bypass
```bash
pnpm scrape --origin "https://protected-shop.com" --store my-store --intervene
```
A **visible** browser (persistent profile at `scraper-output/.browser-profile/`) opens. On a challenge/login it prints:
```
INTERVENTION REQUISE
URL    : ...
RAISON : BOT_CHALLENGE / CAPTCHA / AUTH_REQUIRED …
```
Solve it **manually** in that browser window, then press **ENTER** to resume. The scraper never solves a CAPTCHA for you.

## 5. Interrupt & resume
Press **Ctrl+C** anytime — progress is saved. Then:
```bash
pnpm resume --job <JOB_ID>
```
Only the URLs not yet processed are fetched (no re-work).

## 6. Get the CSV into Luna
Open **Admin → Produits → Import CSV**, upload `scraper-output/csv/<JOB_ID>.csv`.
Preview shows eligibility (accepted / to-verify / excluded); only accepted rows import; fill `category_slug` if blank. Draft mode (hidden) is the default.

## Config (optional)
Defaults live in `scripts/scraper/config.mjs`. Override per-run with the flags above, or globally by creating `scraper-output/config.json`:
```json
{ "timeoutMs": 20000, "retries": 2, "rateLimitMs": 600, "workers": 4,
  "maxPages": 150, "maxProducts": 1000, "maxDepth": 3, "maxBrowser": 40 }
```
`scraper-output/` (jobs, CSV, reports, browser profile) is gitignored — never committed.
