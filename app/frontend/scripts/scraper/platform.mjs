/**
 * Platform detection + platform-native structured data.
 *
 * When a known platform is detected we prefer its public structured endpoint
 * over DOM parsing — but the engine NEVER depends on a platform: detection is
 * an optimisation, and generic extractors remain the default.
 */

/** Detect platform from HTML markers. Returns a slug or null. */
export function detectPlatform(html, headers = {}) {
  const h = html || '';
  const server = (headers['x-powered-by'] || headers['server'] || '').toLowerCase();
  if (/cdn\.shopify\.com|shopify\.(com|dev)|window\.Shopify|"shopify"/i.test(h) || server.includes('shopify')) return 'shopify';
  if (/woocommerce|wp-content\/plugins\/woocommerce|wc-ajax/i.test(h)) return 'woocommerce';
  if (/Magento|mage\/|static\/version\d+|"magento"/i.test(h) || /magento/i.test(server)) return 'magento';
  if (/PrestaShop|prestashop/i.test(h)) return 'prestashop';
  if (/BigCommerce|bigcommerce/i.test(h)) return 'bigcommerce';
  return null;
}

/**
 * Shopify adapter: map a product from the public `<handle>.js` / `products.json`
 * JSON (structured, no DOM parse). `productJson` is the parsed object from
 * `${productUrl}.json` (one product) or a variant of the products list.
 * @returns {import('./types.mjs').RawProduct|null}
 */
export function shopifyProductToRaw(productJson, sourceUrl) {
  const p = productJson?.product || productJson;
  if (!p || typeof p !== 'object' || !p.title) return null;
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const prices = variants.map((v) => parseFloat(v.price)).filter((n) => Number.isFinite(n));
  const listPrices = variants.map((v) => parseFloat(v.compare_at_price)).filter((n) => Number.isFinite(n));
  const firstVariant = variants[0] || {};
  const images = Array.isArray(p.images)
    ? p.images.map((i) => (typeof i === 'string' ? i : i.src)).filter(Boolean)
    : (p.image?.src ? [p.image.src] : []);
  return {
    name: String(p.title).trim(),
    description: p.body_html ? String(p.body_html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null,
    price: prices.length ? Math.min(...prices) : null,
    listPrice: listPrices.length ? Math.max(...listPrices) : null,
    currency: null,
    availability: variants.some((v) => v.available) ? 'InStock' : (variants.length ? 'OutOfStock' : null),
    gtin: firstVariant.barcode ? String(firstVariant.barcode).trim() : null,
    sku: firstVariant.sku ? String(firstVariant.sku).trim() : null,
    mpn: null,
    brand: p.vendor || null,
    images,
    category: p.product_type || null,
    breadcrumb: p.product_type ? [p.product_type] : [],
    weightText: firstVariant.title && firstVariant.title !== 'Default Title' ? firstVariant.title : null,
    sourceUrl,
    canonicalUrl: sourceUrl,
    strategy: 'adapter-shopify',
    confidence: 0.95,
  };
}

/** Given a Shopify product page URL, the structured JSON lives at `${url}.json`. */
export function shopifyJsonUrl(productUrl) {
  try {
    const u = new URL(productUrl);
    u.search = ''; u.hash = '';
    return `${u.origin}${u.pathname.replace(/\/$/, '')}.json`;
  } catch { return null; }
}
