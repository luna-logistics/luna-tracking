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
import { discoverFromSitemaps } from './sitemap.mjs';
import { parseRobots } from './robots.mjs';
import { extractProduct } from './extract.mjs';
import { toNormalizedProduct } from './normalize.mjs';
import { detectPlatform, shopifyJsonUrl, shopifyProductToRaw } from './platform.mjs';
import { renderPage } from './browser.mjs';
import { dedupKey, originOf } from './url-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELIGIBILITY_TS = path.resolve(__dirname, '..', '..', 'src/lib/product-eligibility.ts');

async function loadEligibility() {
  // product-eligibility.ts is erasable-only TypeScript → Node type-strips it.
  const mod = await import(pathToFileURL(ELIGIBILITY_TS).href);
  return mod.isLunaEligibleProduct;
}

/** Simple concurrency pool. */
async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
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
    discovered: 0, fetched: 0, detected: 0, normalized: 0,
    incomplete: 0, accepted: 0, excluded: 0, toVerify: 0,
    networkErrors: 0, parseErrors: 0, browserRequired: 0, duplicates: 0,
    sitemapsRead: [], notes: [], errors: [], startedAt: new Date(started).toISOString(),
  };

  // ── DISCOVERY ──────────────────────────────────────────────────────────
  let urls = [];
  if (config.urls && config.urls.length) {
    urls = config.urls;
    report.notes.push(`discovery: ${urls.length} URL(s) provided`);
  } else if (config.origin) {
    const origin = originOf(config.origin) || config.origin;
    const robotsRes = await fetcher.get(`${origin}/robots.txt`);
    const robots = robotsRes.ok ? parseRobots(robotsRes.body) : null;
    const disc = await discoverFromSitemaps(fetcher, origin, { max: limit, hint: robots?.sitemaps || [] });
    urls = disc.urls; report.sitemapsRead = disc.sitemapsRead; report.notes.push(...disc.notes);
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

  await pool(unique, async (url) => {
    const r = await fetcher.get(url);
    done++; if (config.onProgress) config.onProgress(done, unique.length);
    if (!r.ok) { report.networkErrors++; report.errors.push(`${url} → ${r.error || r.status}${r.blocked ? ' (blocked/challenge)' : ''}`); return; }
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
      const { product, needsBrowser } = extractProduct(r.body, r.url);
      raw = product;
      if (!raw && needsBrowser) {
        report.browserRequired++;
        if (config.useBrowser) {
          const rendered = await renderPage(url, { userAgent: fetcher.userAgent });
          if (rendered.html) { raw = extractProduct(rendered.html, r.url).product; }
          else if (!rendered.available) report.notes.push('browser fallback requested but Playwright not installed');
        }
      }
    }
    if (!raw) { report.parseErrors++; return; }
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
  }, concurrency);

  report.durationMs = Date.now() - started;
  report.fetchStats = fetcher.stats;
  return { products, report };
}

/** Human-readable SCRAPE REPORT block. */
export function formatReport(rep) {
  return [
    'SCRAPE REPORT',
    `store:              ${rep.store}`,
    `URLs discovered:    ${rep.discovered}`,
    `pages fetched:      ${rep.fetched}`,
    `products detected:  ${rep.detected}`,
    `products normalized:${rep.normalized}`,
    `  → accepted:       ${rep.accepted}`,
    `  → to verify:      ${rep.toVerify}`,
    `  → excluded:       ${rep.excluded}`,
    `incomplete:         ${rep.incomplete}`,
    `duplicates skipped: ${rep.duplicates}`,
    `network errors:     ${rep.networkErrors}`,
    `parse errors:       ${rep.parseErrors}`,
    `browser required:   ${rep.browserRequired}`,
    `sitemaps read:      ${rep.sitemapsRead.length}`,
    `duration:           ${(rep.durationMs / 1000).toFixed(1)}s`,
  ].join('\n');
}
