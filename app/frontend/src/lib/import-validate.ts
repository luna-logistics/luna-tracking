/**
 * Structural check of one CSV row before import (after the import profile
 * and the admin's per-row fixes have been applied). Returns error CODES, not
 * sentences: the preview translates them (admin.imp_issue_*), groups rows by
 * code and offers one bulk fix per group.
 *
 * Missing slugs and English names are filled rather than refused — the slug
 * comes from the name, name_en from name_fr (the admin's DeepL button
 * translates later, as for the rest of the catalogue).
 *
 * What the admin can complete in bulk later never blocks a row: a missing or
 * unknown category is guessed from the store's category path, else the row
 * goes to the "to sort" category (fallbackCategorySlug); an unknown store
 * imports the product without a store. Only a name and a price are required.
 */
import { isLunaEligibleProduct, type CustomProductType, type EligibilityResult } from './product-eligibility';
import { normalizeCsvRow } from './store-import';
import { parseDecimal, slugify } from './import-profile';
import { resolveStore } from './import-csv';
import { detectCategoryFromSource } from './category-detect';
import type { ProductCategory, Store } from './products';

export type ImportIssueCode =
  | 'missing_name'
  | 'missing_price'
  | 'bad_price'
  | 'negative_price'
  | 'bad_weight'
  | 'missing_category'
  | 'unknown_category'
  | 'price_mismatch'
  | 'price_implausible';

/** `value` = the offending cell; `csv`/`ref` = the two prices of a price problem. */
export type ImportIssue = { code: ImportIssueCode; value?: string; csv?: number; ref?: number };

export type ImportRowData = {
  slug_fr: string; slug_en: string;
  name_fr: string; name_en: string;
  description_fr: string | null; description_en: string | null;
  price: number; category_id: string;
  brand_id?: string;
  barcode: string | null; hs_code: string | null; weight_kg: number | null; image_url: string | null;
  is_active: boolean;
  meta_title_fr: string | null; meta_title_en: string | null;
  meta_description_fr: string | null; meta_description_en: string | null;
};

export type ValidatedRow = {
  errors: ImportIssue[];
  eligibility: EligibilityResult;
  storeId: string | null;
  /** store_slug was given but matches no Luna store → imported without a store (stores are never auto-created). */
  storeUnknown: boolean;
  /** Values filled in for the admin (shown as notes). */
  filled: Array<'slug_fr' | 'slug_en' | 'name_en' | 'category_guessed' | 'category_fallback'>;
  data?: ImportRowData;
};

export function validateImportRow(
  raw: Record<string, string>,
  categories: Pick<ProductCategory, 'id' | 'slug'>[],
  stores: Pick<Store, 'id' | 'slug' | 'name'>[],
  /** Product types the admin created (product_types table). */
  customTypes: readonly CustomProductType[] = [],
  /** Category of the rows Luna cannot place ("À classer"); null = such rows are errors. */
  fallbackCategorySlug: string | null = null,
): ValidatedRow {
  const errors: ImportIssue[] = [];
  const filled: ValidatedRow['filled'] = [];
  const eligibility = isLunaEligibleProduct(normalizeCsvRow(raw), customTypes);

  const storeSlug = raw.store_slug?.trim();
  const store = resolveStore(storeSlug, stores);
  const storeId = store?.id ?? null;
  const storeUnknown = !!storeSlug && !store;

  const nameFr = (raw.name_fr ?? '').trim();
  let nameEn = (raw.name_en ?? '').trim();
  if (!nameFr) errors.push({ code: 'missing_name' });
  if (nameFr && !nameEn) { nameEn = nameFr; filled.push('name_en'); }

  // Back-compat: a legacy single `slug` column serves both languages. A slug
  // with capitals/accents/spaces is cleaned instead of refused.
  const cleanSlug = (v: string | undefined) => { const t = (v ?? '').trim(); return /^[a-z0-9-]*$/.test(t) ? t : slugify(t); };
  let slugFr = cleanSlug(raw.slug_fr ?? raw.slug);
  let slugEn = cleanSlug(raw.slug_en ?? raw.slug);
  if (!slugFr && nameFr) { slugFr = slugify(nameFr); filled.push('slug_fr'); }
  if (!slugEn && (nameEn || slugFr)) { slugEn = (nameEn && nameEn !== nameFr ? slugify(nameEn) : '') || slugFr; filled.push('slug_en'); }

  const price = parseDecimal(raw.price);
  if (price === null) errors.push({ code: 'missing_price' });
  else if (Number.isNaN(price)) errors.push({ code: 'bad_price', value: raw.price });
  else if (price < 0) errors.push({ code: 'negative_price', value: raw.price });

  const weight = parseDecimal(raw.weight_kg);
  if (weight !== null && Number.isNaN(weight)) errors.push({ code: 'bad_weight', value: raw.weight_kg });

  const catSlug = raw.category_slug?.trim() ?? '';
  let cat = catSlug ? categories.find((c) => c.slug === catSlug) : undefined;
  if (!cat) {
    const guessed = detectCategoryFromSource(raw.source_category, nameFr, new Set(categories.map((c) => c.slug)));
    const fallback = fallbackCategorySlug ? categories.find((c) => c.slug === fallbackCategorySlug) : undefined;
    cat = guessed ? categories.find((c) => c.slug === guessed) : fallback;
    if (cat) filled.push(guessed ? 'category_guessed' : 'category_fallback');
    else if (!catSlug) errors.push({ code: 'missing_category' });
    else errors.push({ code: 'unknown_category', value: catSlug });
  }

  const base = { eligibility, storeId, storeUnknown, filled };
  if (errors.length) return { ...base, errors };
  return {
    ...base,
    errors: [],
    data: {
      slug_fr: slugFr, slug_en: slugEn,
      name_fr: nameFr, name_en: nameEn,
      description_fr: raw.description_fr?.trim() || null,
      description_en: raw.description_en?.trim() || null,
      price: price as number,
      category_id: cat!.id,
      barcode: raw.barcode?.trim() || null,
      hs_code: raw.hs_code?.trim() || null,
      weight_kg: weight,
      image_url: raw.image_url?.trim() || null,
      is_active: true,
      meta_title_fr: raw.meta_title_fr?.trim() || null,
      meta_title_en: raw.meta_title_en?.trim() || null,
      meta_description_fr: raw.meta_description_fr?.trim() || null,
      meta_description_en: raw.meta_description_en?.trim() || null,
    },
  };
}
