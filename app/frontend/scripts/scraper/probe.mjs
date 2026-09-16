/**
 * Source probe — quickly analyse a new shop to decide HOW to scrape it before
 * building anything source-specific. Fetches robots.txt (info + sitemap
 * hints), the entry page (platform + rendering + JSON-LD signals), and ONE
 * sample product URL (from the sitemap when available) to measure field
 * coverage. Makes only a handful of spaced requests.
 */
import { Fetcher } from './http-fetcher.mjs';
import { parseRobots, isDisallowed } from './robots.mjs';
import { discoverFromSitemaps } from './sitemap.mjs';
import { detectPlatform } from './platform.mjs';
import { extractProduct } from './extract.mjs';
import { needsBrowser } from './html-meta.mjs';
import { originOf } from './url-utils.mjs';

const mark = (v) => (v ? '✓' : '✗');

/**
 * @param {string} entryUrl
 * @param {{ fetcher?:Fetcher, sampleUrl?:string }} [opts]
 */
export async function probeSource(entryUrl, opts = {}) {
  const fetcher = opts.fetcher || new Fetcher({ minDelayMs: 800 });
  const origin = originOf(entryUrl) || entryUrl;
  const domain = (() => { try { return new URL(entryUrl).hostname; } catch { return entryUrl; } })();

  // 1. robots (information + sitemap hints)
  const robotsRes = await fetcher.get(`${origin}/robots.txt`);
  const robots = robotsRes.ok ? parseRobots(robotsRes.body) : null;

  // 2. entry page
  const home = await fetcher.get(entryUrl);
  const platform = home.ok ? detectPlatform(home.body) : null;
  const homeHasJsonLd = /application\/ld\+json/i.test(home.body || '');
  const rendering = home.ok ? (needsBrowser(home.body) ? 'CSR (browser likely required)' : 'SSR/static (data in HTML)') : 'unknown';

  // 3. discover a sample product URL via sitemap
  let sampleUrl = opts.sampleUrl || null;
  let sitemapUrls = [];
  if (!sampleUrl) {
    const disc = await discoverFromSitemaps(fetcher, origin, { max: 50, hint: robots?.sitemaps || [] });
    sitemapUrls = disc.urls;
    sampleUrl = disc.urls[0] || null;
  }

  // 4. analyse the sample product page
  let coverage = null, sampleStrategies = [], sampleNeedsBrowser = null, sampleDisallowed = null;
  if (sampleUrl) {
    try { sampleDisallowed = robots ? isDisallowed(robots, new URL(sampleUrl).pathname) : false; } catch { sampleDisallowed = false; }
    const r = await fetcher.get(sampleUrl);
    if (r.ok) {
      const { product, needsBrowser: nb, strategies } = extractProduct(r.body, r.url);
      sampleStrategies = strategies; sampleNeedsBrowser = nb;
      if (product) {
        coverage = {
          name: !!product.name, price: product.price != null, ean: !!product.gtin,
          sku: !!product.sku, brand: !!product.brand, image: (product.images || []).length > 0,
          category: !!product.category || (product.breadcrumb || []).length > 0,
          weight: !!product.weightText, description: !!product.description,
        };
      }
    }
  }

  const recommended = platform === 'shopify' ? 'adapter-shopify'
    : (coverage && sampleStrategies.includes('generic-jsonld')) ? 'generic-jsonld'
    : (coverage && sampleStrategies.includes('generic-microdata')) ? 'generic-microdata'
    : (coverage && sampleStrategies.includes('generic-meta')) ? 'generic-meta'
    : sampleNeedsBrowser ? 'browser-playwright'
    : 'unknown';

  const confidence = coverage
    ? Math.round((Object.values(coverage).filter(Boolean).length / Object.keys(coverage).length) * 100) / 100
    : 0;

  return {
    domain, platform: platform || 'unknown',
    discovery_method: sitemapUrls.length ? 'sitemap' : (opts.sampleUrl ? 'provided-url' : 'none-found'),
    rendering, product_data: coverage ? 'detected' : 'not-detected',
    homeHasJsonLd, sitemap_product_urls: sitemapUrls.length,
    robots_sitemaps: robots?.sitemaps || [],
    sample_url: sampleUrl, sample_disallowed_for_bots: sampleDisallowed,
    coverage, recommended_extractor: recommended, confidence,
    fetch_stats: fetcher.stats,
  };
}

/** Render a probe result as the human-readable SOURCE ANALYSIS block. */
export function formatProbe(p) {
  const c = p.coverage || {};
  return [
    'SOURCE ANALYSIS',
    `domain:            ${p.domain}`,
    `platform:          ${p.platform}`,
    `discovery_method:  ${p.discovery_method}`,
    `rendering:         ${p.rendering}`,
    `product_data:      ${p.product_data}`,
    `sitemap products:  ${p.sitemap_product_urls}`,
    `sample_url:        ${p.sample_url || '(none)'}`,
    `robots note:       ${p.sample_disallowed_for_bots ? 'sample path Disallowed for * (informational)' : 'sample path not disallowed'}`,
    '--- field coverage (sample) ---',
    `name:        ${mark(c.name)}`,
    `price:       ${mark(c.price)}`,
    `EAN/GTIN:    ${mark(c.ean)}`,
    `sku:         ${mark(c.sku)}`,
    `brand:       ${mark(c.brand)}`,
    `category:    ${mark(c.category)}`,
    `image:       ${mark(c.image)}`,
    `weight:      ${mark(c.weight)}`,
    `description: ${mark(c.description)}`,
    '---',
    `recommended_extractor: ${p.recommended_extractor}`,
    `confidence:            ${p.confidence}`,
  ].join('\n');
}
