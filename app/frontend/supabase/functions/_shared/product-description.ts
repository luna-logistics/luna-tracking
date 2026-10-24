/**
 * Read a product description from the HTML of a store's product page.
 * Pure (no Deno / DOM API): used by the `product-description` Edge Function
 * and unit-tested from the frontend (src/lib/missing-descriptions.test.ts).
 *
 * Same priority as Luna's scraper (scripts/scraper/extract.mjs): JSON-LD
 * Product.description, then microdata, then the page's meta description.
 * Store boilerplate ("Découvrez le produit … chez Delhaize", "Toujours au
 * meilleur prix") is refused: the same sentence on hundreds of pages is not a
 * description and hurts SEO.
 */

export type FoundDescription = {
  text: string;
  /** Language of the page ("fr", "nl"…), null when the page does not say. */
  lang: string | null;
  source: 'jsonld' | 'microdata' | 'meta';
};

const GENERIC = [
  /toujours au meilleur prix/i,
  /voir toutes les informations sur les produits/i,
  /ajoutez directement [àa] votre liste/i,
  /always the best price/i,
  /d[ée]couvrez le produit .{0,200} chez \w+/i,
  /consultez les valeurs nutritionnelles/i,
  /^(achetez|commandez|buy|shop) .{0,80} (en ligne|online)/i,
  /livraison (gratuite|offerte)|free (delivery|shipping)/i,
  /^besoin d[e'’]/i,
  /retrouvez votre .{0,200}(au meilleur prix|chez )/i,
];

const MIN_LENGTH = 40;
const MAX_LENGTH = 4000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };

/** HTML → plain text (the shop shows descriptions as text). */
export function htmlToPlainText(s: string): string {
  return s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A text worth saving as the description of `name`. */
export function isUsableDescription(text: string, name = ''): boolean {
  const t = text.trim();
  if (t.length < MIN_LENGTH) return false;
  if (GENERIC.some((rx) => rx.test(t))) return false;
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return !name || fold(t) !== fold(name);
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const txt = m[1].trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
    try { out.push(JSON.parse(txt)); } catch { /* malformed block: skip */ }
  }
  return out;
}

function productNodes(roots: unknown[]): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    const o = n as Record<string, unknown>;
    if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(visit);
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map((x) => String(x).toLowerCase());
    if (types.some((x) => ['product', 'productgroup', 'productmodel', 'individualproduct'].includes(x))) nodes.push(o);
  };
  roots.forEach(visit);
  return nodes;
}

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([\s\S]*?)["']/i)?.[1] ?? null;
}

/** Language of the page: <html lang>, else the first path segment of the URL. */
export function pageLanguage(html: string, url: string): string | null {
  const attr = html.match(/<html[^>]*\slang=["']([a-z]{2})/i)?.[1];
  if (attr) return attr.toLowerCase();
  try {
    const seg = new URL(url).pathname.split('/').find(Boolean) ?? '';
    return seg.match(/^(fr|nl|en|de|es|it)(?:[-_][a-z]{2})?$/i)?.[1].toLowerCase() ?? null;
  } catch { return null; }
}

/** The best description of the page, or null when it has none worth keeping. */
export function extractDescription(html: string, url: string, name = ''): FoundDescription | null {
  const lang = pageLanguage(html, url);
  const candidates: Array<[FoundDescription['source'], string | null]> = [];
  for (const node of productNodes(jsonLdBlocks(html))) {
    if (typeof node.description === 'string') candidates.push(['jsonld', node.description]);
  }
  // Microdata only as an attribute: an element's text is often a customer
  // review's description (itemprop=review > itemprop=description).
  candidates.push(['microdata', html.match(/<meta[^>]*itemprop=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null]);
  candidates.push(['meta', metaContent(html, 'property', 'og:description') ?? metaContent(html, 'name', 'description')]);
  for (const [source, raw] of candidates) {
    if (!raw) continue;
    const text = htmlToPlainText(raw).slice(0, MAX_LENGTH).trim();
    if (isUsableDescription(text, name)) return { text, lang, source };
  }
  return null;
}

/** A response that is a bot wall, not the product page (reported, never bypassed). */
export function looksBlocked(status: number, html: string): boolean {
  if ([401, 403, 405, 429, 503].includes(status)) return true;
  return /cf-chl|challenge-platform|captcha|access denied|are you a robot|px-captcha|_Incapsula_/i.test(html.slice(0, 20000));
}
