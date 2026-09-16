/**
 * Fallback extractors used when JSON-LD is absent or incomplete:
 *   - OpenGraph + product:* meta tags
 *   - schema.org microdata (itemprop=...)
 *   - <title> / <link rel=canonical>
 *   - embedded JSON blobs (__NEXT_DATA__, __NUXT__, preloaded state, Shopify)
 *
 * Regex-based (no DOM dependency). These are intentionally conservative: they
 * fill gaps left by JSON-LD rather than replace it.
 */

function metaContent(html, attr, value) {
  // matches <meta property="og:title" content="..."> in any attribute order
  const re = new RegExp(
    `<meta[^>]*(?:${attr})=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([\s\S]*?)["']/i)?.[1]?.trim() || null;
}

function num(v) {
  if (v == null) return null;
  const c = String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(c);
  return Number.isFinite(n) ? n : null;
}

/** OpenGraph + product meta. */
export function extractFromMeta(html) {
  const title = metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title');
  const desc = metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description');
  const image = metaContent(html, 'property', 'og:image') || metaContent(html, 'name', 'twitter:image');
  const price = num(
    metaContent(html, 'property', 'product:price:amount') ||
    metaContent(html, 'property', 'og:price:amount') ||
    metaContent(html, 'itemprop', 'price'),
  );
  const currency =
    metaContent(html, 'property', 'product:price:currency') ||
    metaContent(html, 'property', 'og:price:currency') || null;
  const availability = metaContent(html, 'property', 'product:availability');
  const brand = metaContent(html, 'property', 'product:brand') || metaContent(html, 'property', 'og:brand');
  return {
    name: title || null,
    description: desc || null,
    price,
    currency,
    availability: availability ? String(availability).split('/').pop() : null,
    brand: brand || null,
    images: image ? [image] : [],
    strategy: 'generic-meta',
    confidence: title ? 0.5 : 0.2,
  };
}

/** schema.org microdata via itemprop attributes (best-effort). */
export function extractFromMicrodata(html) {
  const prop = (name) => {
    const re = new RegExp(`itemprop=["']${name}["'][^>]*?(?:content=["']([^"']+)["']|>\\s*([^<]{1,200}))`, 'i');
    const m = html.match(re);
    return (m && (m[1] || m[2]) || '').trim() || null;
  };
  const name = prop('name');
  const price = num(prop('price'));
  const gtin = prop('gtin13') || prop('gtin') || prop('gtin8') || prop('ean');
  const sku = prop('sku');
  const brand = prop('brand');
  if (!name && price == null && !gtin && !sku) return null;
  return {
    name, price, gtin, sku, brand,
    description: prop('description'),
    currency: prop('priceCurrency'),
    availability: prop('availability') ? String(prop('availability')).split('/').pop() : null,
    images: [], strategy: 'generic-microdata', confidence: 0.4,
  };
}

export function titleOf(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;
}

export function canonicalOf(html) {
  const tag = html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)?.[0];
  return tag ? (tag.match(/href=["']([^"']+)["']/i)?.[1] || null) : null;
}

/** Detect embedded JSON state blobs that often carry product data on SPA/SSR sites. */
export function extractEmbeddedJson(html) {
  const blobs = [];
  const patterns = [
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
    /<script[^>]*id=["']__APOLLO_STATE__["'][^>]*>([\s\S]*?)<\/script>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      try { blobs.push(JSON.parse(m[1].trim())); } catch { /* ignore malformed */ }
    }
  }
  return blobs;
}

/**
 * Heuristic: does the initial HTML look like it needs a browser to render
 * product data? (SPA shell with an empty root and no JSON-LD / product meta.)
 */
export function needsBrowser(html) {
  const hasJsonLd = /application\/ld\+json/i.test(html);
  const hasProductMeta = /property=["']product:price:amount["']/i.test(html) || /property=["']og:type["'][^>]*content=["']product["']/i.test(html);
  const hasEmbedded = /__NEXT_DATA__|__NUXT__|__PRELOADED_STATE__|__INITIAL_STATE__/.test(html);
  const emptyRoot = /<div[^>]*id=["'](root|app|__next)["'][^>]*>\s*<\/div>/i.test(html);
  const tinyBody = (html.match(/<body[\s\S]*<\/body>/i)?.[0]?.length || html.length) < 1500;
  if (hasJsonLd || hasProductMeta || hasEmbedded) return false;
  return emptyRoot || tinyBody;
}
