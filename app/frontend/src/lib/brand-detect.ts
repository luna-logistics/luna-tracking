/**
 * Brand detection from product names — the scrapers rarely return a brand, so
 * the admin can fill it in bulk: (1) match the brands we already have inside
 * product names, (2) suggest new brands from words that start many unbranded
 * product names. Pure functions, no I/O (unit-tested).
 */
import type { Brand, Product } from '@/lib/products';

/** Lowercase, accent-free, apostrophes dropped, other punctuation → space.
 *  "Jack Daniel's" → "jack daniels", "ORAL-B" → "oral b", "L'Oréal" → "loreal". */
export function normalizeBrandText(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type BrandKey = { brand: Brand; key: string; words: number };

/** One key per distinct normalised brand name (FR/EN names and the slug), the
 *  first brand wins on duplicates (e.g. "GILLETTE" vs "Gillette"). */
function brandKeys(brands: Brand[]): BrandKey[] {
  const seen = new Set<string>();
  const out: BrandKey[] = [];
  for (const brand of brands) {
    for (const raw of [brand.name_fr, brand.name_en, brand.slug.replace(/-/g, ' ')]) {
      const key = normalizeBrandText(raw ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ brand, key, words: key.split(' ').length });
    }
  }
  // Longest names first so "head shoulders" beats a shorter brand inside it.
  return out.sort((a, b) => b.key.length - a.key.length);
}

/** Find the brand whose name appears as whole word(s) in `text`. Very short
 *  names (≤ 2 letters: "FA", "OB") only count when they START the text, to
 *  avoid matching a stray syllable. */
export function detectBrandInText(text: string, brands: Brand[]): Brand | null {
  const hay = ` ${normalizeBrandText(text)} `;
  if (hay.trim() === '') return null;
  const first = hay.trim().split(' ')[0];
  for (const { brand, key } of brandKeys(brands)) {
    if (key.length <= 2) {
      if (first === key) return brand;
      continue;
    }
    if (hay.includes(` ${key} `)) return brand;
  }
  return null;
}

/** Resolve an explicit brand string (e.g. the scraper's `brand` column). */
export function matchBrandName(name: string | null | undefined, brands: Brand[]): Brand | null {
  const key = normalizeBrandText(name ?? '');
  if (!key) return null;
  return brandKeys(brands).find((k) => k.key === key)?.brand ?? null;
}

export type BrandMatch = { brand: Brand; productIds: string[] };

/** Existing brands found in the names of products that have no brand yet. */
export function detectExistingBrands(products: Product[], brands: Brand[]): BrandMatch[] {
  const byBrand = new Map<string, BrandMatch>();
  for (const p of products) {
    if (p.brand_id) continue;
    const b = detectBrandInText(p.name_fr, brands) ?? detectBrandInText(p.name_en, brands);
    if (!b) continue;
    const m = byBrand.get(b.id) ?? { brand: b, productIds: [] };
    m.productIds.push(p.id);
    byBrand.set(b.id, m);
  }
  return [...byBrand.values()].sort((a, b) => b.productIds.length - a.productIds.length);
}

export type BrandSuggestion = { token: string; label: string; productIds: string[]; samples: string[] };

/** Generic words that open product names but are not brands. */
const GENERIC = new Set([
  'lingettes', 'lingette', 'gel', 'gels', 'dentifrice', 'brosse', 'brosses', 'savon', 'shampoing', 'shampooing',
  'deodorant', 'deo', 'spray', 'creme', 'lait', 'lotion', 'huile', 'serviette', 'serviettes', 'tampons', 'tampon',
  'protege', 'slips', 'mouchoirs', 'mouchoir', 'papier', 'rasoir', 'rasoirs', 'lames', 'recharge', 'recharges',
  'bain', 'douche', 'soin', 'soins', 'pack', 'lot', 'set', 'duo', 'trio', 'coffret', 'eau', 'jus', 'bouteille',
  'whisky', 'whiskey', 'vodka', 'rhum', 'gin', 'biere', 'vin', 'cola', 'boisson', 'boissons', 'the', 'cafe', 'sucre',
  'farine', 'riz', 'pates', 'huiles', 'sauce', 'conserve', 'conserves', 'lessive', 'liquide', 'poudre', 'nettoyant',
  'bio', 'maxi', 'mini', 'extra', 'ultra', 'pour', 'avec', 'sans', 'des', 'les', 'une', 'aux', 'and', 'for', 'with',
  'men', 'homme', 'hommes', 'femme', 'femmes', 'kids', 'baby', 'bebe', 'fresh', 'soft', 'natural', 'original', 'classic', 'active', 'total', 'new', 'derma', 'petit', 'grand', 'marie',
  'shower', 'toothpaste', 'toothbrush', 'soap', 'shampoo', 'deodorant', 'cream', 'lotion', 'wipes', 'pads', 'tissues',
]);

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Store names put the brand first, in capitals: "BERT & BERT Men's Beard…",
 *  "SUSHI FRESH Donburi…". Returns that leading run of all-caps words. */
export function leadingCapsWords(name: string): string[] {
  const out: string[] = [];
  for (const w of name.trim().split(/\s+/)) {
    const letters = w.replace(/[^\p{L}]/gu, '');
    if (w === '&' && out.length) { out.push(w); continue; }
    if (!letters || letters !== letters.toUpperCase() || /^\d/.test(w)) break;
    out.push(w);
  }
  while (out.length && out[out.length - 1] === '&') out.pop();
  return out;
}

function brandLabel(words: string[]): string {
  return words.map((w) => (w.replace(/[^\p{L}]/gu, '').length <= 3 ? w : titleCase(w))).join(' ');
}

/** New-brand candidates among unbranded products that match no known brand:
 *  1. names starting with capital words → the capitals common to every
 *     product of that first word ("GILLETTE BLUE…", "GILLETTE FUSION…" →
 *     "Gillette"), proposed even for a single product;
 *  2. otherwise a first word shared by ≥ `minCount` names. */
export function suggestNewBrands(products: Product[], brands: Brand[], minCount = 3): BrandSuggestion[] {
  const known = new Set(brandKeys(brands).map((k) => k.key));
  const caps = new Map<string, { words: string[]; ids: string[]; samples: string[] }>();
  const plain = new Map<string, { label: string; ids: string[]; samples: string[] }>();
  for (const p of products) {
    if (p.brand_id || detectBrandInText(p.name_fr, brands)) continue;
    const lead = leadingCapsWords(p.name_fr);
    const firstKey = normalizeBrandText(lead[0] ?? '');
    if (lead.length && firstKey.length >= 2 && !GENERIC.has(firstKey) && !known.has(firstKey)) {
      const g = caps.get(firstKey);
      if (!g) caps.set(firstKey, { words: lead, ids: [p.id], samples: [p.name_fr] });
      else {
        let i = 0;
        while (i < g.words.length && i < lead.length && normalizeBrandText(g.words[i]) === normalizeBrandText(lead[i])) i++;
        g.words = g.words.slice(0, Math.max(i, 1));
        g.ids.push(p.id);
        if (g.samples.length < 3) g.samples.push(p.name_fr);
      }
      continue;
    }
    const firstRaw = p.name_fr.trim().split(/\s+/)[0] ?? '';
    const token = normalizeBrandText(firstRaw);
    if (token.length < 3 || /^\d/.test(token) || GENERIC.has(token) || known.has(token)) continue;
    const g = plain.get(token) ?? { label: titleCase(firstRaw.replace(/[^\p{L}\p{N}'&-]/gu, '')), ids: [], samples: [] };
    g.ids.push(p.id);
    if (g.samples.length < 3) g.samples.push(p.name_fr);
    plain.set(token, g);
  }
  const fromCaps = [...caps.values()].map((g) => {
    const label = brandLabel(g.words);
    return { token: normalizeBrandText(label), label, productIds: g.ids, samples: g.samples };
  });
  const fromPlain = [...plain.entries()]
    .filter(([, g]) => g.ids.length >= minCount)
    .map(([token, g]) => ({ token, label: g.label, productIds: g.ids, samples: g.samples }));
  return [...fromCaps, ...fromPlain].sort((a, b) => b.productIds.length - a.productIds.length);
}

export function brandSlug(name: string): string {
  return normalizeBrandText(name).replace(/ /g, '-');
}
