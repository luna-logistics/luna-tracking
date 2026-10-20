/**
 * Meta (Facebook / Instagram) product catalogue feed — CSV built from the
 * live `products` table. Plain .mjs so the Cloudflare worker (worker.js) and
 * the unit tests share the exact same code.
 *
 * What Meta needs per row: id, title, description, availability, condition,
 * price ("12.50 EUR"), link, image_link, brand. `id` is the product UUID —
 * the same value the pixel sends as content_ids (AddToCart), which is what
 * makes dynamic ads / retargeting match.
 *
 * Left OUT on purpose (Meta commerce policies reject them, and a rejection
 * can flag the whole catalogue): alcohol and the "Intimité" category
 * (condoms, lubricants), plus anything without a photo or a positive price.
 */

export const SITE_ORIGIN = 'https://lunatrackinglogistics.com';
const EXCLUDED_CATEGORY_SLUGS = new Set(['alcohol', 'intimate']);
export const FEED_COLUMNS = [
  'id', 'title', 'description', 'availability', 'condition', 'price',
  'link', 'image_link', 'brand', 'product_type', 'item_group_id',
];

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const csvCell = (v) => `"${clean(v).replace(/"/g, '""')}"`;
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

/**
 * @param {Array<object>} products   rows of `products`
 * @param {Array<object>} brands     rows of `brands`
 * @param {Array<object>} categories rows of `product_categories`
 * @param {{lang?: 'fr'|'en', origin?: string}} [opts]
 * @returns {{csv: string, included: number, skipped: Record<string, number>}}
 */
export function buildMetaFeed(products, brands, categories, opts = {}) {
  const lang = opts.lang === 'en' ? 'en' : 'fr';
  const origin = opts.origin || SITE_ORIGIN;
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const pick = (fr, en) => clean(lang === 'en' ? (en || fr) : (fr || en));
  const base = lang === 'en' ? '/en/shop-and-ship/' : '/achat-envoi/';
  const tail = lang === 'en'
    ? 'Bought in Belgium and delivered in the DRC.'
    : 'Acheté en Belgique et livré en RDC.';

  const skipped = { inactive: 0, alcohol: 0, restricted_category: 0, no_image: 0, no_price: 0, no_slug: 0 };
  const rows = [FEED_COLUMNS.map(csvCell).join(',')];
  let included = 0;

  for (const p of products) {
    const cat = catById.get(p.category_id);
    if (p.is_active === false) { skipped.inactive++; continue; }
    if (p.is_alcoholic || (cat && cat.slug === 'alcohol')) { skipped.alcohol++; continue; }
    if (cat && EXCLUDED_CATEGORY_SLUGS.has(cat.slug)) { skipped.restricted_category++; continue; }
    if (!clean(p.image_url)) { skipped.no_image++; continue; }
    const price = Number(p.price);
    if (!Number.isFinite(price) || price <= 0) { skipped.no_price++; continue; }
    const slug = clean(lang === 'en' ? (p.slug_en || p.slug_fr) : (p.slug_fr || p.slug_en));
    if (!slug) { skipped.no_slug++; continue; }

    const title = cut(pick(p.name_fr, p.name_en), 150);
    const desc = pick(p.description_fr, p.description_en);
    const description = cut(desc ? `${desc} ${tail}` : `${title}. ${tail}`, 5000);
    const brand = brandById.get(p.brand_id);
    const parent = cat && cat.parent_id ? catById.get(cat.parent_id) : null;
    const catName = cat ? pick(cat.name_fr, cat.name_en) : '';
    const productType = parent ? `${pick(parent.name_fr, parent.name_en)} > ${catName}` : catName;

    rows.push([
      p.id,
      title,
      description,
      'in stock',
      'new',
      `${price.toFixed(2)} EUR`,
      `${origin}${base}${slug}`,
      clean(p.image_url),
      brand ? pick(brand.name_fr, brand.name_en) : '',
      productType,
      '',
    ].map(csvCell).join(','));
    included++;
  }
  return { csv: rows.join('\r\n') + '\r\n', included, skipped };
}
