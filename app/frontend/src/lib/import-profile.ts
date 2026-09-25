/**
 * Import profiles — remember how to read one CSV source (e.g. the Eloshon
 * Scraper's Lidl export) so the next manual import needs no re-work.
 *
 * Pure functions only (no React / Supabase): `applyImportProfile` rewrites
 * a raw CSV row BEFORE the existing validateRow → eligibility pipeline, so
 * the admin import keeps a single code path. DB access lives in
 * `import-profiles-db.ts`.
 */
import type { ProductType } from './normalized-product';

export type ImportRules = {
  /** Remove "- 4.95 € (25.09.2026)" appended by the scraper to descriptions. */
  strip_description_price_suffix?: boolean;
  /** CSV price = description price × 1000 (e.g. 1990 vs 1.99) → use the description price. */
  fix_price_x1000?: boolean;
  /** Remove the scraper's random 6-char slug suffix ("miel-de-fleurs-9gcetk"). */
  strip_slug_suffix?: boolean;
  /** Prices above this are refused as implausible (null = no cap). */
  max_price?: number | null;
};

export const DEFAULT_RULES: Required<ImportRules> = {
  strip_description_price_suffix: true,
  fix_price_x1000: true,
  strip_slug_suffix: true,
  max_price: 5000,
};

export type ImportProfile = {
  id: string;
  slug: string;
  name: string;
  header_signature: string;
  store_id: string | null;
  rules: ImportRules;
};

export type CategoryMapping = {
  id: string;
  profile_id: string;
  source_category: string;
  action: 'map' | 'skip';
  category_id: string | null;
  product_type: ProductType | null;
};

/** Column set fingerprint: order- and case-insensitive. */
export function headerSignature(headers: string[]): string {
  return Array.from(new Set(headers.map((h) => h.trim().toLowerCase()).filter(Boolean))).sort().join('|');
}

const SEP = ' > ';

/** "A > B > C" → ["A > B > C", "A > B", "A"] (most specific first). */
export function categoryPrefixes(sourceCategory: string): string[] {
  const parts = sourceCategory.split(SEP).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) out.push(parts.slice(0, i).join(SEP));
  return out;
}

/** Longest mapping whose path equals the row's category or is an ancestor of it. */
export function findMapping(sourceCategory: string | null | undefined, mappings: CategoryMapping[]): CategoryMapping | null {
  const sc = sourceCategory?.trim();
  if (!sc) return null;
  const byPath = new Map(mappings.map((m) => [m.source_category.trim(), m]));
  for (const prefix of categoryPrefixes(sc)) {
    const m = byPath.get(prefix);
    if (m) return m;
  }
  return null;
}

const PRICE_SUFFIX = /\s*-\s*(\d+(?:[.,]\d+)?)\s*€?\s*\(\d{2}\.\d{2}\.\d{4}\)\s*$/;

/** Price the scraper wrote at the end of the description, if any. */
export function descriptionPrice(desc: string | null | undefined): number | null {
  const m = desc?.match(PRICE_SUFFIX);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** Strip the "- price (date)" suffix; a description that is then just the
 *  product name adds nothing and becomes empty. */
export function cleanDescription(desc: string | null | undefined, name: string): string {
  const d = (desc ?? '').replace(PRICE_SUFFIX, '').trim();
  return d.toLowerCase() === name.trim().toLowerCase() ? '' : d;
}

/** URL slug, max 80 chars, cut on a word boundary (never mid-word). */
export function slugify(s: string, max = 80): string {
  const full = s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (full.length <= max) return full;
  const cut = full.slice(0, max + 1);
  const at = cut.lastIndexOf('-');
  return (at > 0 ? cut.slice(0, at) : full.slice(0, max)).replace(/-+$/g, '');
}

/** "miel-de-fleurs-liquide-9gcetk" → "miel-de-fleurs-liquide". Only when the
 *  slug is the scraper's pattern: slugify(name) — possibly truncated, even
 *  mid-word — + "-" + 6 random chars. The clean slug is then rebuilt from the
 *  name. A real slug ending in a 6-letter word is never touched. */
export function stripSlugSuffix(slug: string, name: string): string {
  const s = slug.trim();
  const m = s.match(/^(.+)-[a-z0-9]{6}$/);
  const full = slugify(name, 200);
  if (!m || !full || !full.startsWith(m[1])) return s;
  return slugify(name);
}

export type ProfiledRow = {
  /** Row rewritten by the profile — feed this to validateRow. */
  raw: Record<string, string>;
  /** Why the row is skipped by a saved 'skip' mapping (null = not skipped). */
  skip: string | null;
  /** The row's source_category has no mapping and no category_slug. */
  unmapped: boolean;
  /** Blocking price problem that needs a human (null = fine). */
  priceProblem: string | null;
  /** English fields are a copy of the French ones. */
  untranslated: boolean;
  /** What the profile changed, for the preview. */
  notes: string[];
};

export function applyImportProfile(
  raw: Record<string, string>,
  profile: Pick<ImportProfile, 'rules'> | null,
  mappings: CategoryMapping[],
  ctx: { storeSlug: string | null; categorySlugById: Map<string, string> },
): ProfiledRow {
  const rules = { ...DEFAULT_RULES, ...(profile?.rules ?? {}) };
  const r: Record<string, string> = { ...raw };
  const notes: string[] = [];
  let skip: string | null = null;
  let priceProblem: string | null = null;

  if (profile && ctx.storeSlug) {
    if ((raw.store_slug ?? '').trim() !== ctx.storeSlug) r.store_slug = ctx.storeSlug;
  }

  const mapping = findMapping(raw.source_category, mappings);
  if (mapping?.action === 'skip') {
    skip = `catégorie ignorée par le profil (« ${mapping.source_category} »)`;
  } else if (mapping) {
    const catSlug = mapping.category_id ? ctx.categorySlugById.get(mapping.category_id) : undefined;
    if (!r.category_slug?.trim() && catSlug) r.category_slug = catSlug;
    if (!r.product_type?.trim() && mapping.product_type) r.product_type = mapping.product_type;
  }
  const unmapped = !skip && !r.category_slug?.trim();

  // Price: compare with the price the scraper wrote in the description.
  const descP = descriptionPrice(raw.description_fr) ?? descriptionPrice(raw.description_en);
  const csvP = raw.price?.trim() ? Number(raw.price) : NaN;
  if (descP != null && Number.isFinite(csvP)) {
    if (rules.fix_price_x1000 && Math.abs(csvP - descP * 1000) < 0.5 && descP > 0) {
      r.price = String(descP);
      notes.push(`prix corrigé ${csvP} → ${descP} (×1000)`);
    } else if (Math.abs(csvP - descP) > 0.005) {
      priceProblem = `prix incohérent : CSV ${csvP} € ≠ fiche ${descP} €`;
    }
  }
  const finalP = Number(r.price);
  if (!priceProblem && rules.max_price != null && Number.isFinite(finalP) && finalP > rules.max_price) {
    priceProblem = `prix improbable : ${finalP} € (> ${rules.max_price} €)`;
  }

  if (rules.strip_description_price_suffix) {
    for (const [dk, nk] of [['description_fr', 'name_fr'], ['description_en', 'name_en']] as const) {
      if (raw[dk] == null) continue;
      const cleaned = cleanDescription(raw[dk], raw[nk] ?? '');
      if (cleaned !== (raw[dk] ?? '').trim()) r[dk] = cleaned;
    }
    if (r.description_fr !== raw.description_fr) notes.push('description nettoyée');
  }

  if (rules.strip_slug_suffix) {
    for (const [k, nk] of [['slug_fr', 'name_fr'], ['slug_en', 'name_en']] as const) {
      if (raw[k]) r[k] = stripSlugSuffix(raw[k], raw[nk] ?? '');
    }
    if (r.slug_fr !== raw.slug_fr) notes.push('suffixe de slug retiré');
  }

  const untranslated = !!r.name_fr?.trim() && r.name_fr.trim() === (r.name_en ?? '').trim();
  return { raw: r, skip, unmapped, priceProblem, untranslated, notes };
}
