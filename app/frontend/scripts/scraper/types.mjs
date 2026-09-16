/**
 * Shared typedefs + constants for the scraping engine.
 *
 * The engine is store-agnostic: every source funnels through the SAME
 * NormalizedProduct shape already used by the project's CSV import and the
 * `isLunaEligibleProduct` filter (the authority on food eligibility). The
 * scraper NEVER decides eligibility itself and NEVER writes to the DB — it
 * produces NormalizedProduct[] and hands them to the existing pipeline
 * (filter → preview → import), or emits the admin-import CSV.
 *
 * Pure JS (JSDoc types) so it runs under Node with zero dependencies and can
 * import the project's product-eligibility.ts via Node's type-stripping.
 *
 * @typedef {Object} NormalizedProduct
 * @property {string=} store_slug
 * @property {string=} source_url
 * @property {string=} source_product_id
 * @property {string=} source_category
 * @property {string=} product_type
 * @property {string} name_fr
 * @property {string} name_en
 * @property {string|null=} description_fr
 * @property {string|null=} description_en
 * @property {string|null=} storage_info
 * @property {boolean=} is_alcoholic
 * @property {number|null=} price
 * @property {number|null=} weight_kg
 * @property {string|null=} barcode
 * @property {string|null=} hs_code
 * @property {string|null=} image_url
 * @property {string|null=} category_slug
 * @property {Record<string, unknown>=} raw
 *
 * @typedef {Object} RawProduct
 *  Intermediate, pre-normalisation shape produced by an extractor. Field names
 *  mirror common e-commerce/JSON-LD vocabulary; unknowns stay null.
 * @property {string|null} name
 * @property {string|null} description
 * @property {number|null} price
 * @property {number|null} listPrice   // "normal" price when a promo exists
 * @property {string|null} currency
 * @property {string|null} availability
 * @property {string|null} gtin        // EAN/UPC/GTIN-8/12/13/14
 * @property {string|null} sku
 * @property {string|null} mpn
 * @property {string|null} brand
 * @property {string[]}    images
 * @property {string|null} category
 * @property {string[]}    breadcrumb
 * @property {string|null} weightText  // raw contenance/weight text, e.g. "500 g"
 * @property {string|null} sourceUrl
 * @property {string|null} canonicalUrl
 * @property {string}      strategy    // which extractor produced this
 * @property {number}      confidence  // 0..1
 */

export const DEFAULT_USER_AGENT =
  'LunaTrackingBot/1.0 (+https://lunatrackinglogistics.com; catalogue import)';

/** Query params that never identify a product and are stripped for dedup. */
export const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid',
  '_ga', 'ref', 'ref_', 'referrer', 'source', 'igshid', 'yclid', 'dclid',
  's_kwcid', 'cmpid', 'campaign', 'spm',
];

export const EXTRACTOR = {
  JSONLD: 'generic-jsonld',
  JSON: 'generic-json',
  MICRODATA: 'generic-microdata',
  META: 'generic-meta',
  HTML: 'generic-html',
  SHOPIFY: 'adapter-shopify',
  BROWSER: 'browser-playwright',
};
