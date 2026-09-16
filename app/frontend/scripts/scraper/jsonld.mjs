/**
 * JSON-LD extraction — the priority strategy. E-commerce sites very often
 * expose a schema.org Product as JSON-LD, which is far more reliable than CSS
 * selectors. Pure functions on an HTML string; zero dependencies.
 *
 * Handles: multiple <script type="application/ld+json"> blocks, @graph, arrays
 * of nodes, Product (and sub-types), offers as object OR array (+ AggregateOffer
 * with lowPrice), brand as object OR string, image as string OR array OR
 * ImageObject, sku / mpn / gtin(8|12|13|14)/gtin, category, availability.
 */

/** Extract and JSON.parse every ld+json block; tolerant of trailing junk. */
export function parseJsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let txt = m[1].trim();
    if (!txt) continue;
    // Some CMSs wrap JSON in CDATA or add HTML comments.
    txt = txt.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    try {
      out.push(JSON.parse(txt));
    } catch {
      // Try to recover the first well-formed top-level JSON value.
      const recovered = tryRecover(txt);
      if (recovered !== undefined) out.push(recovered);
    }
  }
  return out;
}

function tryRecover(txt) {
  const start = txt.search(/[[{]/);
  if (start < 0) return undefined;
  for (let end = txt.length; end > start + 1; end--) {
    const slice = txt.slice(start, end);
    if (!/[\]}]$/.test(slice.trim())) continue;
    try { return JSON.parse(slice); } catch { /* keep shrinking */ }
  }
  return undefined;
}

/** Flatten JSON-LD roots into a flat list of nodes (unwraps @graph + arrays). */
export function collectNodes(roots) {
  const nodes = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (Array.isArray(n['@graph'])) n['@graph'].forEach(visit);
    nodes.push(n);
  };
  roots.forEach(visit);
  return nodes;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function typeMatches(node, wanted) {
  const t = node['@type'];
  const types = asArray(t).map((x) => String(x).toLowerCase());
  return types.some((x) => wanted.includes(x));
}

/** Is this node a Product (or a product-ish subtype)? */
export function isProductNode(node) {
  return typeMatches(node, ['product', 'productmodel', 'individualproduct', 'vehicle', 'book', 'foodproduct']);
}

function pickImages(image) {
  const imgs = [];
  for (const i of asArray(image)) {
    if (typeof i === 'string') imgs.push(i);
    else if (i && typeof i === 'object') {
      if (typeof i.url === 'string') imgs.push(i.url);
      else if (typeof i.contentUrl === 'string') imgs.push(i.contentUrl);
    }
  }
  return imgs;
}

function pickBrand(brand) {
  for (const b of asArray(brand)) {
    if (typeof b === 'string') return b;
    if (b && typeof b === 'object' && typeof b.name === 'string') return b.name;
  }
  return null;
}

function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Extract price/listPrice/currency/availability from offers (object|array|AggregateOffer). */
function pickOffers(offers) {
  const res = { price: null, listPrice: null, currency: null, availability: null };
  const list = asArray(offers);
  const prices = [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    // AggregateOffer
    const p = num(o.price ?? o.lowPrice ?? o.highPrice);
    if (p != null) prices.push(p);
    if (res.currency == null && typeof o.priceCurrency === 'string') res.currency = o.priceCurrency;
    if (res.availability == null && o.availability) res.availability = String(o.availability).split('/').pop();
    // PriceSpecification nesting
    const spec = o.priceSpecification;
    for (const s of asArray(spec)) {
      const sp = num(s?.price);
      if (sp != null) prices.push(sp);
      if (res.currency == null && typeof s?.priceCurrency === 'string') res.currency = s.priceCurrency;
    }
  }
  if (prices.length) {
    res.price = Math.min(...prices);                 // current/promo = lowest
    if (prices.length > 1) res.listPrice = Math.max(...prices);
  }
  return res;
}

function pickGtin(node) {
  const keys = ['gtin13', 'gtin14', 'gtin12', 'gtin8', 'gtin', 'ean', 'barcode'];
  for (const k of keys) {
    const v = node[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function pickCategory(node) {
  const c = node.category;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof c.name === 'string') return c.name;
  return null;
}

/**
 * Build a RawProduct-ish object from JSON-LD nodes. Returns null if no Product
 * node is present. Also pulls a BreadcrumbList when available.
 * @returns {import('./types.mjs').RawProduct | null}
 */
export function extractProductFromJsonLd(html) {
  const nodes = collectNodes(parseJsonLdBlocks(html));
  const product = nodes.find(isProductNode);
  if (!product) return null;

  const offers = pickOffers(product.offers);
  const breadcrumb = extractBreadcrumb(nodes);

  const desc = typeof product.description === 'string' ? product.description : null;
  const name = typeof product.name === 'string' ? product.name
    : (typeof product.title === 'string' ? product.title : null);

  return {
    name: name ? name.trim() : null,
    description: desc ? desc.trim() : null,
    price: offers.price,
    listPrice: offers.listPrice,
    currency: offers.currency,
    availability: offers.availability,
    gtin: pickGtin(product),
    sku: product.sku != null ? String(product.sku).trim() : null,
    mpn: product.mpn != null ? String(product.mpn).trim() : null,
    brand: pickBrand(product.brand),
    images: pickImages(product.image),
    category: pickCategory(product),
    breadcrumb,
    weightText: pickWeightText(product),
    sourceUrl: null,
    canonicalUrl: typeof product.url === 'string' ? product.url : null,
    strategy: 'generic-jsonld',
    confidence: 0.9,
  };
}

function pickWeightText(node) {
  const w = node.weight ?? node.size;
  if (typeof w === 'string') return w;
  if (w && typeof w === 'object') {
    const val = w.value ?? w.name;
    const unit = w.unitText ?? w.unitCode ?? '';
    if (val != null) return `${val} ${unit}`.trim();
  }
  return null;
}

function extractBreadcrumb(nodes) {
  const bc = nodes.find((n) => typeMatches(n, ['breadcrumblist']));
  if (!bc || !Array.isArray(bc.itemListElement)) return [];
  return bc.itemListElement
    .map((el) => {
      const item = el?.item;
      const name = el?.name ?? (item && typeof item === 'object' ? item.name : null);
      return typeof name === 'string' ? name.trim() : null;
    })
    .filter(Boolean);
}
