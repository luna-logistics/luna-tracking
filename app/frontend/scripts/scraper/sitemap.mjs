/**
 * Sitemap discovery. Handles sitemap.xml, sitemap index (nested), gzipped
 * sitemaps (.gz, native decompression via the fetcher), and multiple product
 * sitemaps. When product-specific sitemaps exist, they are preferred over
 * generic ones so we discover product URLs without crawling the whole site.
 */

/** Extract <loc> values from a sitemap/urlset/sitemapindex XML string. */
export function parseLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const v = m[1].trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    if (v) locs.push(v);
  }
  return locs;
}

export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

const looksProduct = (u) => /product|produit|artikel|-p-|\/p\//i.test(u);

/**
 * Discover candidate product URLs from a site's sitemaps.
 * @param {import('./http-fetcher.mjs').Fetcher} fetcher
 * @param {string} origin  e.g. https://example.com
 * @param {{ max?:number, maxSitemaps?:number, hint?:string[] }} [opts]
 * @returns {Promise<{ urls:string[], sitemapsRead:string[], notes:string[] }>}
 */
export async function discoverFromSitemaps(fetcher, origin, opts = {}) {
  const max = opts.max ?? 5000;
  const maxSitemaps = opts.maxSitemaps ?? 40;
  const notes = [];
  const seen = new Set();
  const sitemapsRead = [];
  const productUrls = [];
  const otherUrls = [];

  // Candidate entry points: robots-declared sitemaps + conventional locations.
  const entry = [...(opts.hint || []), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];
  /** @type {string[]} */
  const queue = [];
  for (const e of entry) if (!seen.has(e)) { seen.add(e); queue.push(e); }

  let productSitemapSeen = false;
  while (queue.length && sitemapsRead.length < maxSitemaps && productUrls.length < max) {
    const sm = queue.shift();
    const r = await fetcher.getText(sm);
    if (!r.ok || !r.body || !/<(urlset|sitemapindex)[\s>]/i.test(r.body)) {
      if (r.status && r.status !== 404) notes.push(`sitemap ${sm} → HTTP ${r.status}`);
      continue;
    }
    sitemapsRead.push(sm);
    const locs = parseLocs(r.body);
    if (isSitemapIndex(r.body)) {
      // Prefer product child sitemaps first.
      const products = locs.filter(looksProduct);
      const rest = locs.filter((l) => !looksProduct(l));
      if (products.length) { productSitemapSeen = true; notes.push(`found ${products.length} product sitemap(s)`); }
      for (const l of [...products, ...rest]) if (!seen.has(l)) { seen.add(l); queue.push(l); }
    } else {
      const fromProductSm = productSitemapSeen && looksProduct(sm);
      for (const l of locs) {
        if (looksProduct(l) || fromProductSm) productUrls.push(l);
        else otherUrls.push(l);
        if (productUrls.length >= max) break;
      }
    }
  }

  const urls = (productUrls.length ? productUrls : otherUrls).slice(0, max);
  if (!productUrls.length && otherUrls.length) notes.push('no product-specific sitemap; returning generic URLs (filter/probe recommended)');
  return { urls, sitemapsRead, notes };
}
