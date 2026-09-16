/**
 * Emit NormalizedProduct[] as a CSV whose columns match the admin CSV import
 * (see store-import.ts / AdminProducts CsvImport). This is the bridge to the
 * EXISTING pipeline: the operator loads the file in Admin → Produits → Import
 * CSV, which runs the same eligibility filter + preview + draft import.
 *
 * The scraper cannot decide the Luna category (§9) — `category_slug` is left
 * for the operator to fill (or set via the run's --category-slug), and slugs
 * are derived from the name. Nothing is written to the DB here.
 */

const COLUMNS = [
  'slug_fr', 'slug_en', 'name_fr', 'name_en', 'description_fr', 'description_en',
  'price', 'category_slug', 'barcode', 'hs_code', 'weight_kg', 'image_url',
  'store_slug', 'source_url', 'source_product_id', 'source_category',
  'product_type', 'storage_info', 'is_alcoholic',
];

export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'produit';
}

function shortId(np) {
  const basis = np.source_product_id || np.source_url || np.name_fr || Math.random().toString();
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = (h * 31 + basis.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** @param {import('./types.mjs').NormalizedProduct[]} products */
export function toImportCsv(products, opts = {}) {
  const rows = [COLUMNS.join(',')];
  for (const p of products) {
    const base = slugify(p.name_fr || p.name_en);
    const id = shortId(p);
    const slug = `${base}-${id}`;
    const rec = {
      slug_fr: slug,
      slug_en: slug,
      name_fr: p.name_fr || '',
      name_en: p.name_en || '',
      description_fr: p.description_fr || '',
      description_en: p.description_en || '',
      price: p.price ?? '',
      category_slug: p.category_slug || opts.categorySlug || '',
      barcode: p.barcode || '',
      hs_code: p.hs_code || '',
      weight_kg: p.weight_kg ?? '',
      image_url: p.image_url || '',
      store_slug: p.store_slug || opts.storeSlug || '',
      source_url: p.source_url || '',
      source_product_id: p.source_product_id || '',
      source_category: p.source_category || '',
      product_type: p.product_type || '',
      storage_info: p.storage_info || '',
      is_alcoholic: p.is_alcoholic ? 'true' : '',
    };
    rows.push(COLUMNS.map((c) => esc(rec[c])).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}

export { COLUMNS };
