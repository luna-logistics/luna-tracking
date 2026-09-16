/**
 * Extraction orchestrator. Tries strategies in priority order and MERGES them
 * so a strong source (JSON-LD) provides the core and weaker sources (meta,
 * microdata, <title>) only fill gaps:
 *
 *   1. JSON-LD Product        (best)
 *   2. microdata (itemprop)
 *   3. OpenGraph / product meta
 *   4. <title> / canonical     (last resort)
 *
 * Returns a RawProduct plus `needsBrowser` when the initial HTML looks like an
 * unrendered SPA shell. Never calls the network; operate on an HTML string.
 */
import { extractProductFromJsonLd } from './jsonld.mjs';
import { extractFromMeta, extractFromMicrodata, titleOf, canonicalOf, needsBrowser } from './html-meta.mjs';

const pick = (...vals) => { for (const v of vals) if (v != null && v !== '') return v; return null; };
const mergeImages = (...lists) => {
  const seen = new Set(); const out = [];
  for (const l of lists) for (const u of (l || [])) { if (u && !seen.has(u)) { seen.add(u); out.push(u); } }
  return out;
};

/**
 * @param {string} html
 * @param {string} sourceUrl  final URL of the page (for relative-image + fallback id)
 * @returns {{ product: import('./types.mjs').RawProduct|null, needsBrowser: boolean, strategies: string[] }}
 */
export function extractProduct(html, sourceUrl) {
  const strategies = [];
  const jsonld = extractProductFromJsonLd(html);
  if (jsonld) strategies.push('generic-jsonld');
  const micro = extractFromMicrodata(html);
  if (micro) strategies.push('generic-microdata');
  const meta = extractFromMeta(html);
  if (meta?.name) strategies.push('generic-meta');

  const canonical = canonicalOf(html);
  const anyName = jsonld?.name || micro?.name || meta?.name || titleOf(html);

  // If nothing at all resolved and the shell looks unrendered → defer to browser.
  const nb = needsBrowser(html);
  if (!anyName) return { product: null, needsBrowser: nb, strategies };

  const base = jsonld || {};
  /** @type {import('./types.mjs').RawProduct} */
  const product = {
    name: pick(base.name, micro?.name, meta?.name, titleOf(html)),
    description: pick(base.description, micro?.description, meta?.description),
    price: pick(base.price, micro?.price, meta?.price),
    listPrice: pick(base.listPrice),
    currency: pick(base.currency, micro?.currency, meta?.currency),
    availability: pick(base.availability, micro?.availability, meta?.availability),
    gtin: pick(base.gtin, micro?.gtin),
    sku: pick(base.sku, micro?.sku),
    mpn: pick(base.mpn),
    brand: pick(base.brand, micro?.brand, meta?.brand),
    images: mergeImages(base.images, meta?.images),
    category: pick(base.category),
    breadcrumb: base.breadcrumb || [],
    weightText: pick(base.weightText),
    sourceUrl,
    canonicalUrl: pick(base.canonicalUrl, canonical),
    strategy: strategies[0] || 'generic-html',
    confidence: jsonld ? 0.9 : micro ? 0.55 : meta?.name ? 0.4 : 0.2,
  };
  return { product, needsBrowser: false, strategies };
}
