/**
 * Makes Luna understand the columns of a scraped CSV before the import
 * preview validates it. Pure functions, unit-tested in import-columns.test.ts.
 *
 * Two kinds of files reach the import:
 *   * the Eloshon Scraper app export — Luna's own column names (slug_fr,
 *     name_fr, price…) plus, since 2026-10-24, brand / availability / rating /
 *     review_count / net_content / technical_specs;
 *   * the Eloshon browser-extension export and other tools — labelled
 *     columns ("Nom", "Prix", "Prix barré", "Marque", "Collection", "Image",
 *     "Lien", "Référence", "Caractéristiques techniques", "Variantes"…), in
 *     French, English, Dutch or German.
 * Labelled columns are renamed to Luna's names; values are cleaned the same
 * way for both ("1538 EUR" → 1538, HTML descriptions → text, first image of a
 * list, technical specs as a description when the page had none).
 *
 * The store is taken from the product link when the scraper wrote none or a
 * wrong one ("Mediamarket", "COL", "LIDL" on colruyt.be pages): the site the
 * product comes from is the reliable signal. Rows that are not products
 * (a MediaMarkt "Fiche technique du produit" PDF link, a "Newsletter" tile)
 * are dropped and counted.
 */
import { parseWeightKg } from './product-enrich';
import { resolveStore } from './import-csv';
import type { Store } from './products';

type StoreRef = Pick<Store, 'id' | 'slug' | 'name'>;

/** Columns Luna reads under their own name (left untouched). */
const LUNA_COLUMNS = new Set([
  'slug', 'slug_fr', 'slug_en', 'name_fr', 'name_en', 'description_fr', 'description_en',
  'price', 'list_price', 'category_slug', 'barcode', 'hs_code', 'weight_kg', 'image_url',
  'store_slug', 'source_url', 'source_product_id', 'source_category', 'product_type',
  'storage_info', 'is_alcoholic', 'color', 'variants', 'weight_estimated',
  'brand', 'availability', 'rating', 'review_count', 'net_content', 'technical_specs',
  'meta_title_fr', 'meta_title_en', 'meta_description_fr', 'meta_description_en',
]);

/** Labels (accent-free, lower case, words separated by one space) → Luna column. */
const ALIASES: Array<[string, string[]]> = [
  ['name_fr', ['nom', 'name', 'titre', 'title', 'nom du produit', 'product name', 'produit', 'product', 'naam',
    'productnaam', 'titel', 'bezeichnung', 'produktname', 'libelle', 'designation', 'product title']],
  ['description_fr', ['description', 'desc', 'descriptif', 'description longue', 'long description', 'body html',
    'body', 'beschrijving', 'omschrijving', 'beschreibung', 'produktbeschreibung']],
  ['price', ['prix', 'price', 'prijs', 'preis', 'prix de vente', 'sale price', 'prix actuel', 'current price', 'prix ttc',
    'prix promo', 'tarif', 'variant price', 'verkoopprijs', 'prix de base']],
  ['list_price', ['prix barre', 'list price', 'compare at price', 'variant compare at price', 'ancien prix',
    'original price', 'prix conseille', 'was price', 'reduction', 'prix avant reduction', 'adviesprijs', 'streichpreis']],
  ['brand', ['marque', 'brand', 'brands', 'merk', 'marke', 'vendor', 'fabricant', 'manufacturer', 'hersteller']],
  ['barcode', ['ean', 'ean13', 'ean 13', 'gtin', 'gtin13', 'gtin 13', 'code barre', 'code barres', 'barcode', 'upc',
    'code ean', 'streepjescode']],
  ['image_url', ['image', 'images', 'image url', 'image src', 'photo', 'photos', 'picture', 'img', 'image principale',
    'main image', 'visuel', 'afbeelding', 'bild', 'foto']],
  ['source_url', ['lien', 'url', 'link', 'product url', 'url produit', 'lien produit', 'href', 'product link']],
  ['source_product_id', ['reference', 'ref', 'sku', 'id', 'product id', 'id produit', 'code article', 'artikelnummer',
    'artikel', 'variant sku', 'item number']],
  ['source_category', ['collection', 'collections', 'categorie', 'category', 'categories', 'rayon', 'breadcrumb',
    'fil d ariane', 'type de produit', 'categorie source', 'categorie produit', 'kategorie', 'categorie s']],
  ['variants', ['variantes', 'variants', 'varianten', 'options', 'declinaisons', 'tailles', 'sizes']],
  ['technical_specs', ['caracteristiques techniques', 'caracteristiques', 'fiche technique', 'specifications',
    'specs', 'technical specs', 'technical specifications', 'kenmerken', 'specificaties', 'technische daten', 'attributs',
    'attributes']],
  ['color', ['couleur', 'color', 'colour', 'kleur', 'farbe']],
  ['weight_kg', ['poids', 'poids kg', 'weight', 'weight kg', 'gewicht']],
  ['net_content', ['contenance', 'contenu', 'contenu net', 'net content', 'volume', 'inhoud', 'inhalt']],
  ['availability', ['disponibilite', 'availability', 'stock', 'en stock', 'beschikbaarheid', 'verfugbarkeit']],
  ['store_slug', ['magasin', 'store', 'boutique', 'shop', 'winkel', 'enseigne']],
  ['rating', ['note', 'rating', 'note des clients']],
  ['review_count', ['nombre d avis', 'avis', 'reviews', 'review count']],
];
const ALIAS_TO_COLUMN = new Map<string, string>();
for (const [col, labels] of ALIASES) for (const l of labels) ALIAS_TO_COLUMN.set(l, col);

/** "Caractéristiques techniques" → "caracteristiques techniques". */
export const foldLabel = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Header → Luna column (null = not a column Luna knows). */
export function lunaColumnFor(header: string): string | null {
  const h = header.trim().toLowerCase();
  if (LUNA_COLUMNS.has(h)) return h;
  return ALIAS_TO_COLUMN.get(foldLabel(header)) ?? null;
}

// ─── Values ────────────────────────────────────────────────────────────────

/** "1538 EUR" → "1538" · "À partir de 12,99 €" → "12,99" · "15.99" unchanged. */
export function cleanPrice(v: string | undefined): string {
  const s = (v ?? '').trim();
  if (!s || !/[^\d\s.,-]/.test(s)) return s;
  return s.match(/-?\d[\d\s .,]*/)?.[0].replace(/[\s ]+$/, '').trim() ?? s;
}

/** First http(s) URL of a cell that may list several images. */
export function firstUrl(v: string | undefined): string {
  const s = (v ?? '').trim();
  return s.match(/https?:\/\/[^\s,|;"'<>]+/i)?.[0] ?? s;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', eacute: 'é', egrave: 'è', agrave: 'à' };

/** HTML description → plain text (the shop shows descriptions as text). */
export function htmlToText(v: string | undefined): string {
  const s = v ?? '';
  if (!/<[a-z!/]/i.test(s) && !/&[a-z#0-9]+;/i.test(s)) return s.trim();
  return s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Technical specs ({"Écran":"6,1\""} JSON, or "Écran : 6,1 ; Poids : 170 g") → "Écran : 6,1 · Poids : 170 g". */
export function specsToText(v: string | undefined, max = 12): string {
  const s = (v ?? '').trim();
  if (!s) return '';
  let pairs: Array<[string, string]> = [];
  if (s.startsWith('{')) {
    try {
      pairs = Object.entries(JSON.parse(s) as Record<string, unknown>)
        .filter(([, x]) => x != null && typeof x !== 'object' && String(x).trim())
        .map(([k, x]) => [k.split(' · ').pop()!.trim(), String(x).trim()]);
    } catch { /* not JSON: read as text below */ }
  }
  if (!pairs.length) {
    pairs = s.split(/\s*[;\n]\s*/).map((p) => p.split(/\s*:\s*/)).filter((p) => p.length >= 2 && p[0] && p[1])
      .map((p) => [p[0], p.slice(1).join(' : ')] as [string, string]);
  }
  return pairs.slice(0, max).map(([k, x]) => `${k} : ${x}`).join(' · ').slice(0, 900);
}

/** Language of a product page from its URL ("/nl/…", "/fr-BE/…"), null when not stated. */
export function urlLanguage(url: string | undefined): string | null {
  try {
    const seg = new URL(url ?? '').pathname.split('/').find(Boolean) ?? '';
    const m = seg.match(/^(fr|nl|en|de|es|it)(?:[-_][a-z]{2})?$/i);
    return m ? m[1].toLowerCase() : null;
  } catch { return null; }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Store of a product page from its host: "www.mediamarkt.be" → mediamarkt,
 *  "www.iciparisxl.be" → ICI Paris XL, "ecgproductsearchmw.colruytgroup.com" → Colruyt. */
export function storeFromUrl(url: string | undefined, stores: StoreRef[]): StoreRef | null {
  let host: string;
  try { host = new URL(url ?? '').hostname.toLowerCase(); } catch { return null; }
  const labels = host.split('.').slice(0, -1).filter((l) => l !== 'www' && l.length >= 3);
  for (const label of labels) {
    const f = fold(label);
    const hit = stores.find((s) => fold(s.slug) === f || fold(s.name) === f)
      ?? stores.find((s) => { const k = fold(s.slug); return k.length >= 4 && f.startsWith(k); });
    if (hit) return hit;
  }
  return null;
}

/** Names of things a listing scraper picks up that are not products. */
const NOT_A_PRODUCT = /^(fiche technique( du produit)?|product (data )?sheet|datasheet|productfiche|technische fiche|mode d emploi|notice|manuel|newsletter|nieuwsbrief|inscription newsletter|carte cadeau|gift card)$/;

/** Why a row is not a product (null = it is one). */
export function notAProductReason(row: Record<string, string>): 'not_a_product' | 'empty' | null {
  const name = foldLabel(row.name_fr ?? '');
  const url = (row.source_url ?? '').trim();
  if (!name && !url && !(row.price ?? '').trim()) return 'empty';
  if (NOT_A_PRODUCT.test(name)) return 'not_a_product';
  if (/\.pdf(\?|$)/i.test(url)) return 'not_a_product';
  return null;
}

// ─── File ──────────────────────────────────────────────────────────────────

export type ColumnRecognition = {
  headers: string[];
  rows: Record<string, string>[];
  /** Labelled columns renamed to Luna's names ("Prix" → price). */
  renamed: Array<{ from: string; to: string }>;
  /** Columns kept under their name but not used by the import. */
  unused: string[];
  /** Rows dropped: links that are not products, empty lines. */
  dropped: { not_a_product: number; empty: number };
  /** Rows whose store was taken from the product link. */
  storeFromLink: number;
  /** Rows whose description was built from the technical specs. */
  specsAsDescription: number;
  /** Language of most product pages when it is not French (e.g. 'nl'). */
  foreignLanguage: string | null;
};

const READ_COLUMNS = new Set([...LUNA_COLUMNS]);
['list_price', 'availability', 'rating', 'review_count', 'variants', 'weight_estimated', 'color'].forEach((c) => READ_COLUMNS.delete(c));

/**
 * Rename + clean the rows of a parsed CSV. `stores` = Luna's stores (to read
 * the store from the product link). Never invents a store: a link to a site
 * Luna has no store for keeps the file's store_slug.
 */
export function recognizeColumns(headers: string[], rows: Record<string, string>[], stores: StoreRef[]): ColumnRecognition {
  const target = new Map<string, string>();
  const taken = new Set<string>();
  // Luna's own names first, then the labels (the first label claiming a column wins).
  for (const h of headers) { const c = lunaColumnFor(h); if (c && c === h.trim().toLowerCase()) { target.set(h, c); taken.add(c); } }
  const renamed: ColumnRecognition['renamed'] = [];
  for (const h of headers) {
    if (target.has(h)) continue;
    const c = lunaColumnFor(h);
    if (c && !taken.has(c)) { target.set(h, c); taken.add(c); renamed.push({ from: h, to: c }); }
  }
  const outHeaders = headers.map((h) => target.get(h) ?? h);
  const unused = outHeaders.filter((h) => !READ_COLUMNS.has(h));

  const dropped = { not_a_product: 0, empty: 0 };
  let storeFromLink = 0, specsAsDescription = 0;
  const langs = new Map<string, number>();
  const out: Record<string, string>[] = [];
  for (const src of rows) {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) r[target.get(k) ?? k] = v ?? '';
    for (const k of ['name_fr', 'name_en']) if (r[k]) r[k] = r[k].replace(/\s+/g, ' ').trim();
    const why = notAProductReason(r);
    if (why) { dropped[why]++; continue; }

    if (r.price) r.price = cleanPrice(r.price);
    if (r.list_price) r.list_price = cleanPrice(r.list_price);
    if (r.image_url) r.image_url = firstUrl(r.image_url);
    if (r.source_url) r.source_url = firstUrl(r.source_url);
    if (r.barcode) { const d = r.barcode.replace(/[\s-]/g, ''); if (/^\d{8,14}$/.test(d)) r.barcode = d; }
    for (const k of ['description_fr', 'description_en']) if (r[k]) r[k] = htmlToText(r[k]);
    if (!r.description_fr?.trim() && r.technical_specs?.trim()) {
      const specs = specsToText(r.technical_specs);
      if (specs) { r.description_fr = specs; specsAsDescription++; }
    }
    if (!r.weight_kg?.trim() && r.net_content?.trim()) {
      const kg = parseWeightKg(r.net_content);
      if (kg != null) r.weight_kg = String(kg);
    }
    // The site of the product link decides the store when it is a Luna store.
    const linked = storeFromUrl(r.source_url, stores);
    if (linked && resolveStore(r.store_slug, stores)?.id !== linked.id) { r.store_slug = linked.slug; storeFromLink++; }

    const lang = urlLanguage(r.source_url);
    if (lang) langs.set(lang, (langs.get(lang) ?? 0) + 1);
    out.push(r);
  }
  const top = [...langs.entries()].sort((a, b) => b[1] - a[1])[0];
  const foreignLanguage = top && top[0] !== 'fr' && top[1] > out.length / 2 ? top[0] : null;
  return { headers: outHeaders, rows: out, renamed, unused, dropped, storeFromLink, specsAsDescription, foreignLanguage };
}
