/**
 * RawProduct → NormalizedProduct (the project's canonical shape).
 *
 * Identity priority (§6): GTIN/EAN → SKU → MPN → source id in URL → canonical
 * URL. Barcodes/SKUs are NEVER invented: barcode is set only from a real GTIN
 * that looks like an EAN/UPC (8/12/13/14 digits).
 *
 * product_type is a SOURCE DECLARATION, not an inference: the admin declares it
 * when configuring the source (opts.defaultProductType). If unknown, it stays
 * null and the eligibility filter returns "to_verify" — the scraper never
 * decides eligibility.
 */
import { parseWeight } from './weight.mjs';
import { absoluteUrl } from './url-utils.mjs';

const digits = (s) => String(s).replace(/[^\d]/g, '');

function gtinToBarcode(gtin) {
  if (!gtin) return null;
  const d = digits(gtin);
  return [8, 12, 13, 14].includes(d.length) ? d : null;
}

/** source_product_id from the most reliable identifier available. */
function sourceProductId(raw) {
  if (raw.gtin) { const d = digits(raw.gtin); if (d) return d; }
  if (raw.sku) return String(raw.sku).trim();
  if (raw.mpn) return String(raw.mpn).trim();
  const url = raw.canonicalUrl || raw.sourceUrl;
  if (url) {
    // last meaningful path segment or an explicit ?p=/?id= token
    try {
      const u = new URL(url);
      const idParam = u.searchParams.get('id') || u.searchParams.get('p') || u.searchParams.get('productId');
      if (idParam) return idParam;
      // Use the last MEANINGFUL path segment (skip generic index.* / empty),
      // so sites like /catalogue/<slug>/index.html don't collapse to "index.html".
      const segs = u.pathname.split('/').filter(Boolean);
      while (segs.length && /^index\.(html?|php|aspx?)$/i.test(segs[segs.length - 1])) segs.pop();
      const seg = segs.pop();
      if (seg) return decodeURIComponent(seg);
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * @param {import('./types.mjs').RawProduct} raw
 * @param {{ storeSlug?:string, lang?:'fr'|'en', defaultProductType?:string|null, categorySlug?:string|null }} [opts]
 * @returns {import('./types.mjs').NormalizedProduct}
 */
export function toNormalizedProduct(raw, opts = {}) {
  const lang = opts.lang || 'fr';
  const name = raw.name || '';
  const desc = raw.description || null;
  const w = parseWeight(raw.weightText);
  const image = raw.images && raw.images.length
    ? absoluteUrl(raw.images[0], raw.sourceUrl || raw.canonicalUrl || undefined)
    : null;
  const category = raw.category || (raw.breadcrumb && raw.breadcrumb.length ? raw.breadcrumb.join(' > ') : null);

  // Store the volume/textual contenance when we could not derive a mass, so the
  // information is not lost (kept in `raw`, and volume noted in storage-ish).
  const normalized = {
    store_slug: opts.storeSlug || null,
    source_url: raw.canonicalUrl || raw.sourceUrl || null,
    source_product_id: sourceProductId(raw),
    source_category: category,
    product_type: opts.defaultProductType ?? null,
    name_fr: lang === 'fr' ? name : name, // single-language source: mirror; translation is a separate step
    name_en: lang === 'en' ? name : name,
    description_fr: lang === 'fr' ? desc : desc,
    description_en: lang === 'en' ? desc : desc,
    storage_info: null,
    is_alcoholic: undefined, // let the eligibility filter detect from name/keywords
    price: raw.price ?? null,
    weight_kg: w.weight_kg,
    barcode: gtinToBarcode(raw.gtin),
    hs_code: null,
    image_url: image,
    category_slug: opts.categorySlug ?? null,
    raw: {
      brand: raw.brand || null,
      currency: raw.currency || null,
      list_price: raw.listPrice ?? null,
      availability: raw.availability || null,
      weight_text: w.text,
      volume_l: w.volume_l,
      pack_count: w.count,
      breadcrumb: raw.breadcrumb || [],
      sku: raw.sku || null,
      mpn: raw.mpn || null,
      gtin: raw.gtin || null,
      extractor: raw.strategy,
      confidence: raw.confidence,
    },
  };
  return normalized;
}
