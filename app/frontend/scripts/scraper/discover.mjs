/**
 * Automatic product-URL discovery from a shop URL. Product-oriented crawl:
 *
 *   shop URL → sitemap/index → product URLs
 *            → (if insufficient) categories/listings → pagination → product URLs
 *            → dedup
 *
 * Reuses sitemap.mjs (sitemaps), pagination.mjs (rel=next), detect.mjs
 * (stop on protection), url-utils.mjs (dedup/host). Never crawls legal/account/
 * cart/checkout/login/support/blog. Hard guardrails prevent infinite crawls.
 */
import { classifyResponse } from './detect.mjs';
import { discoverFromSitemaps } from './sitemap.mjs';
import { relNext } from './pagination.mjs';
import { parseRobots } from './robots.mjs';
import { absoluteUrl, dedupKey, sameHost, originOf } from './url-utils.mjs';

// Binary/asset URLs — never fetch.
export const ASSET_RE = /\/cdn-cgi\/|\.(pdf|jpe?g|png|gif|webp|svg|css|js|zip|mp4|avif|ico|woff2?)(\?|$)/i;
// Non-catalogue sections — never crawl (keyword may be a segment prefix, e.g.
// "conditions-generales"). Checked AFTER product detection so a product slug
// that merely contains such a word (e.g. /product/contact-lens) is not dropped.
export const SECTION_RE = /\/(conditions?|mentions|legal|privacy|confidential|cookies?|rgpd|gdpr|account|mon-compte|compte|panier|cart|checkout|caisse|login|log-in|signin|sign-in|connexion|register|inscription|support|contact|help|aide|faq|blog|news|actualites|about|a-propos|wishlist|favoris|jobs|carrieres?|press|presse|newsletter|store-locator|magasins)([-/?]|$)/i;
// Combined (used for classification/tests).
export const SKIP_RE = new RegExp(`(${ASSET_RE.source})|(${SECTION_RE.source})`, 'i');
// A product detail page.
export const PRODUCT_RE = /(\/product\/|\/produit\/|\/products\/|\/produits\/[a-z0-9]|\/p\/|-p-\d|\/dp\/|\/item\/|\/artikel\/|\/pd\/)/i;
// A category/listing/collection page (crawl deeper).
export const LISTING_RE = /(\/category\/|\/categorie|\/categories\/|\/collection|\/collections\/|\/c\/|\/shop\b|\/boutique|\/catalog|\/rayon|\/assortiment|\/gamme)/i;
// A pagination link (same listing, next page).
export const PAGE_RE = /([?&](page|p|start|offset|from)=\d+)|(\/page\/\d+)/i;

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#\s]+)["']/gi;
  let m;
  while ((m = re.exec(html))) { const abs = absoluteUrl(m[1], baseUrl); if (abs) out.push(abs); }
  return out;
}

/**
 * @param {import('./http-fetcher.mjs').Fetcher} fetcher
 * @param {string} shopUrl
 * @param {{ maxProducts?:number, maxPages?:number, maxDepth?:number, sitemapMin?:number }} [opts]
 * @returns {Promise<{ urls:string[], report:object }>}
 */
export async function discoverProducts(fetcher, shopUrl, opts = {}) {
  const origin = originOf(shopUrl) || shopUrl;
  const maxProducts = opts.maxProducts ?? 500;
  const maxPages = opts.maxPages ?? 150;
  const maxDepth = opts.maxDepth ?? 3;
  const sitemapMin = opts.sitemapMin ?? 5;
  const report = { method: null, pagesCrawled: 0, listingsCrawled: 0, productUrls: 0, notes: [], stopped: null };
  const products = new Set();

  // ── 1) Sitemaps (preferred) ─────────────────────────────────────────────
  const robotsRes = await fetcher.get(`${origin}/robots.txt`);
  const robots = robotsRes.ok ? parseRobots(robotsRes.body) : null;
  const sm = await discoverFromSitemaps(fetcher, origin, { max: maxProducts, hint: robots?.sitemaps || [] });
  report.notes.push(...sm.notes);
  for (const u of sm.urls) { if (!SKIP_RE.test(u)) products.add(u); if (products.size >= maxProducts) break; }
  if (products.size >= sitemapMin) {
    report.method = 'sitemap';
    report.productUrls = products.size;
    return { urls: [...products].slice(0, maxProducts), report };
  }

  // ── 2) Crawl categories/listings → pagination → product URLs ────────────
  report.method = products.size ? 'sitemap+crawl' : 'crawl';
  const visited = new Set([dedupKey(shopUrl)]);
  const queue = [{ url: shopUrl, depth: 0 }];
  let noNewStreak = 0;

  while (queue.length && products.size < maxProducts && report.pagesCrawled < maxPages) {
    const { url, depth } = queue.shift();
    const r = await fetcher.get(url);
    report.pagesCrawled++;

    const resp = classifyResponse({ status: r.status, url: r.url, requestedUrl: url, body: r.body, error: r.error, headers: r.headers });
    if (resp.terminal) { report.stopped = { code: resp.code, reason: resp.reason, url }; break; }
    if (!r.ok || !r.body) continue;
    if (depth > 0) report.listingsCrawled++;

    const before = products.size;
    for (const link of extractLinks(r.body, r.url)) {
      if (!sameHost(link, origin) || ASSET_RE.test(link)) continue;
      const k = dedupKey(link);
      if (PRODUCT_RE.test(link)) {                    // product detected first (slug may contain a section word)
        products.add(link);
        if (products.size >= maxProducts) break;
        continue;
      }
      if (SECTION_RE.test(link)) continue;            // non-catalogue → never crawl
      if (!visited.has(k) && queue.length + report.pagesCrawled < maxPages) {
        if (PAGE_RE.test(link)) { visited.add(k); queue.push({ url: link, depth }); }           // pagination: same depth
        else if (depth < maxDepth && LISTING_RE.test(link)) { visited.add(k); queue.push({ url: link, depth: depth + 1 }); } // deeper category
      }
    }
    // rel="next" pagination (when not exposed as a normal <a>)
    const next = relNext(r.body);
    if (next) {
      const nabs = absoluteUrl(next, r.url); const nk = nabs && dedupKey(nabs);
      if (nabs && sameHost(nabs, origin) && !visited.has(nk)) { visited.add(nk); queue.push({ url: nabs, depth }); }
    }

    // Loop guard: too many pages yielding no new products → stop.
    if (products.size === before) { if (++noNewStreak >= 12) { report.notes.push('crawl stopped: no new products for 12 pages'); break; } }
    else noNewStreak = 0;
  }
  if (report.pagesCrawled >= maxPages) report.notes.push(`crawl hit maxPages=${maxPages}`);
  report.productUrls = products.size;
  return { urls: [...products].slice(0, maxProducts), report };
}
