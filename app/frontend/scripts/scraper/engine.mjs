/**
 * Scraping engine orchestrator:
 *
 *   DISCOVERY → FETCH → EXTRACTION → NORMALISATION → DEDUP → ELIGIBILITY → REPORT
 *
 * It NEVER writes to the DB and NEVER decides eligibility itself: it calls the
 * project's own `isLunaEligibleProduct` (the authority) and produces
 * NormalizedProduct[] + a report. A caller turns accepted rows into the
 * admin-import CSV. A broken page never aborts the run.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Fetcher } from './http-fetcher.mjs';
import { extractProduct } from './extract.mjs';
import { toNormalizedProduct } from './normalize.mjs';
import { detectPlatform, shopifyJsonUrl, shopifyProductToRaw } from './platform.mjs';
import { BrowserSession, browserAvailable } from './browser.mjs';
import { dedupKey, originOf } from './url-utils.mjs';
import { classifyResponse, STATUS } from './detect.mjs';
import { discoverProducts } from './discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELIGIBILITY_TS = path.resolve(__dirname, '..', '..', 'src/lib/product-eligibility.ts');

async function loadEligibility() {
  // product-eligibility.ts is erasable-only TypeScript → Node type-strips it.
  const mod = await import(pathToFileURL(ELIGIBILITY_TS).href);
  return mod.isLunaEligibleProduct;
}

/** Concurrency pool with a cooperative stop flag (for clean early-stop on block). */
async function pool(items, worker, concurrency, shouldStop) {
  let i = 0;
  let processed = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      if (shouldStop && shouldStop()) return;
      const idx = i++;
      await worker(items[idx], idx);
      processed++;
    }
  });
  await Promise.all(runners);
  return processed;
}

/**
 * @param {{
 *   store: { slug: string },
 *   origin?: string, urls?: string[],
 *   limit?: number, concurrency?: number,
 *   defaultProductType?: string|null, categorySlug?: string|null, lang?: 'fr'|'en',
 *   useBrowser?: boolean, fetcher?: Fetcher, onProgress?: (n:number,total:number)=>void
 * }} config
 */
export async function runScrape(config) {
  if (!config?.store?.slug) throw new Error('runScrape: a valid existing store is required (store.slug)');
  const started = Date.now();
  const fetcher = config.fetcher || new Fetcher({ minDelayMs: 600 });
  const limit = config.limit ?? 1000;
  const concurrency = Math.min(config.concurrency ?? 4, 8);
  const isEligible = await loadEligibility();

  const report = {
    store: config.store.slug,
    status: STATUS.OK, // final source status
    discovered: 0, fetched: 0, detected: 0, normalized: 0,
    incomplete: 0, accepted: 0, excluded: 0, toVerify: 0,
    networkErrors: 0, parseErrors: 0, browserRequired: 0, duplicates: 0,
    notAProductPage: 0,
    byStatus: {}, // counts per detected status code
    blocked: null, // { code, reason, url } when the source was stopped
    remaining: 0, resumeUrls: [], // for resuming later
    sitemapsRead: [], notes: [], errors: [], startedAt: new Date(started).toISOString(),
  };
  const bump = (code) => { report.byStatus[code] = (report.byStatus[code] || 0) + 1; };

  // ── DISCOVERY ──────────────────────────────────────────────────────────
  let urls = [];
  if (config.urls && config.urls.length) {
    urls = config.urls;
    report.notes.push(`discovery: ${urls.length} URL(s) provided`);
  } else if (config.origin) {
    // Automatic discovery: sitemap → categories/listings → pagination → products.
    const disc = await discoverProducts(fetcher, config.origin, {
      maxProducts: limit, maxPages: config.maxPages, maxDepth: config.maxDepth,
    });
    urls = disc.urls;
    report.discovery = disc.report;
    report.notes.push(`discovery: ${disc.report.method} — ${disc.report.pagesCrawled} pages crawled, ${disc.report.productUrls} product URLs`, ...disc.report.notes);
    if (disc.report.stopped) { report.status = disc.report.stopped.code; report.blocked = disc.report.stopped; }
  } else {
    throw new Error('runScrape: provide config.urls or config.origin');
  }

  // Dedup discovery by canonical key, cap at limit.
  const seenKeys = new Set();
  const unique = [];
  for (const u of urls) {
    const k = dedupKey(u);
    if (seenKeys.has(k)) { report.duplicates++; continue; }
    seenKeys.add(k); unique.push(u);
    if (unique.length >= limit) break;
  }
  report.discovered = unique.length;

  // ── FETCH → EXTRACT → NORMALISE → ELIGIBILITY ──────────────────────────
  const products = [];
  const outKeys = new Set();
  let done = 0;
  let stop = null; // set to { code, reason, url } on a terminal block → stop source cleanly
  // Circuit breaker: if requests keep failing (connection resets, repeated
  // challenges) and nothing succeeds, stop instead of hammering the source.
  const breaker = Math.max(3, config.breaker ?? 6);
  let consecFail = 0; let lastFailCode = null;

  // Browser fallback: HTTP-first. Use Playwright only for CSR pages, capped.
  // Auto-on when Playwright is installed unless explicitly disabled. A session
  // can be injected (config.browserSession) for testing.
  const injectedSession = config.browserSession || null;
  const wantBrowser = config.useBrowser !== false && (!!injectedSession || await browserAvailable());
  const maxBrowser = config.maxBrowser ?? 40;
  let browserUsed = 0;
  let session = null;
  report.playwrightAvailable = !!injectedSession || await browserAvailable();

  const processed = await pool(unique, async (url) => {
    const r = await fetcher.get(url);
    done++; if (config.onProgress) config.onProgress(done, unique.length);

    // Classify BEFORE trusting the body as a product. A challenge/captcha page
    // is never treated as content; a terminal block stops the whole source.
    const { product: preProduct, needsBrowser: nb } = r.ok ? extractProduct(r.body, r.url) : { product: null, needsBrowser: false };
    const resp = classifyResponse({ status: r.status, url: r.url, requestedUrl: r.requestedUrl || url, body: r.body, error: r.error, headers: r.headers, needsBrowser: nb });
    bump(resp.code);

    if (resp.terminal) {
      // Stop safely: keep what we have, do not hammer the source.
      if (!stop) stop = { code: resp.code, reason: resp.reason, url, retryAfter: resp.retryAfter };
      return;
    }
    if (resp.code === STATUS.NETWORK_ERROR) {
      report.networkErrors++;
      lastFailCode = STATUS.NETWORK_ERROR;
      if (report.errors.length < 50) report.errors.push(`${url} → ${resp.reason}`);
      // Circuit breaker: many consecutive failures with zero successes → stop.
      if (++consecFail >= breaker && report.fetched === 0 && !stop) {
        stop = { code: lastFailCode, reason: `circuit breaker: ${consecFail} consecutive failures, source unreachable or blocking`, url, retryAfter: null };
      }
      return;
    }
    consecFail = 0; // a real page came back → reset the breaker
    report.fetched++;

    let raw = null;
    // Platform-native structured data first (optimisation, not a dependency).
    if (detectPlatform(r.body) === 'shopify') {
      const jsonUrl = shopifyJsonUrl(r.url);
      if (jsonUrl) {
        const jr = await fetcher.get(jsonUrl, { accept: 'application/json' });
        if (jr.ok && jr.kind === 'json') { try { raw = shopifyProductToRaw(JSON.parse(jr.body), r.url); } catch { /* fall through */ } }
      }
    }
    if (!raw) {
      raw = preProduct;
      if (!raw && (nb || resp.code === STATUS.JAVASCRIPT_REQUIRED)) {
        report.browserRequired++;
        if (wantBrowser && browserUsed < maxBrowser && !stop) {
          browserUsed++;
          if (!session) session = injectedSession || new BrowserSession({ userAgent: fetcher.userAgent });
          const rendered = await session.render(url);
          if (rendered.block && rendered.block.terminal) {
            // Protection detected under the browser too → stop cleanly, no bypass.
            if (!stop) stop = { code: rendered.block.code, reason: `${rendered.block.reason} (under browser)`, url, retryAfter: rendered.block.retryAfter };
            return;
          }
          if (rendered.html) raw = extractProduct(rendered.html, r.url).product;
        } else if (!report.playwrightAvailable && !report._pwNoted) {
          report._pwNoted = true;
          report.notes.push('some pages require JavaScript; install Playwright to render them (pnpm add -D playwright && npx playwright install chromium)');
        }
      }
    }
    if (!raw) {
      if (resp.code === STATUS.OK) report.notAProductPage++;
      else report.parseErrors++;
      return;
    }
    report.detected++;

    const np = toNormalizedProduct(raw, {
      storeSlug: config.store.slug, lang: config.lang || 'fr',
      defaultProductType: config.defaultProductType ?? null, categorySlug: config.categorySlug ?? null,
    });

    // Dedup by strongest identity (source_product_id) then URL key.
    const idKey = np.source_product_id ? `id:${np.source_product_id}` : `url:${dedupKey(np.source_url || url)}`;
    if (outKeys.has(idKey)) { report.duplicates++; return; }
    outKeys.add(idKey);

    if (!np.name_fr || np.price == null) report.incomplete++;
    report.normalized++;

    const verdict = isEligible(np);
    np.__eligibility = verdict; // attach for the caller/preview (not a DB field)
    if (verdict.status === 'accepted') report.accepted++;
    else if (verdict.status === 'excluded') report.excluded++;
    else report.toVerify++;

    products.push(np);
  }, concurrency, () => stop !== null);

  if (session && session !== injectedSession) { await session.close(); }
  report.browserUsed = browserUsed;

  if (stop) {
    report.status = stop.code;
    report.blocked = stop;
    report.remaining = Math.max(0, unique.length - processed);
    // Resume list = URLs not yet processed (cap the stored list to keep the report small).
    report.resumeUrls = unique.slice(processed, processed + 2000);
    report.notes.push(`source stopped safely: ${stop.code} (${stop.reason}). No bypass attempted.`);
    if (stop.retryAfter) report.notes.push(`server asked to retry after ~${stop.retryAfter}s`);
  }

  report.durationMs = Date.now() - started;
  report.fetchStats = fetcher.stats;
  return { products, report };
}

/** Human-readable SCRAPE REPORT block. */
export function formatReport(rep) {
  const lines = [
    'SCRAPE REPORT',
    `store:              ${rep.store}`,
    `status:             ${rep.status}`,
    `URLs discovered:    ${rep.discovered}`,
    `pages fetched:      ${rep.fetched}`,
    `products detected:  ${rep.detected}`,
    `products normalized:${rep.normalized}`,
    `  → accepted:       ${rep.accepted}`,
    `  → to verify:      ${rep.toVerify}`,
    `  → excluded:       ${rep.excluded}`,
    `incomplete:         ${rep.incomplete}`,
    `not-a-product page: ${rep.notAProductPage}`,
    `duplicates skipped: ${rep.duplicates}`,
    `network errors:     ${rep.networkErrors}`,
    `parse errors:       ${rep.parseErrors}`,
    `browser required:   ${rep.browserRequired}`,
    `browser used:       ${rep.browserUsed || 0}${rep.playwrightAvailable ? '' : ' (Playwright not installed)'}`,
    `sitemaps read:      ${rep.sitemapsRead.length}`,
    `duration:           ${(rep.durationMs / 1000).toFixed(1)}s`,
  ];
  if (rep.blocked) {
    lines.push(
      '--- SOURCE STOPPED (no bypass attempted) ---',
      `reason:             ${rep.blocked.code} — ${rep.blocked.reason}`,
      `products recovered: ${rep.normalized}`,
      `products remaining: ${rep.remaining}`,
      'action:             scrape stopped safely (resumable)',
    );
  }
  const codes = Object.keys(rep.byStatus || {});
  if (codes.length) lines.push(`status breakdown:   ${codes.map((c) => `${c}=${rep.byStatus[c]}`).join('  ')}`);
  return lines.join('\n');
}
