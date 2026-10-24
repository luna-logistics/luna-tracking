import { supabase } from '@/lib/supabase';
import { PRODUCT_TYPES } from '@/lib/normalized-product';

/**
 * Product types (table product_types, admin-only): the coarse family that
 * feeds the eligibility filter. The five historical types are always
 * there; the admin can add more (from the CSV import or the Types tab).
 */
export type ProductTypeDef = {
  slug: string;
  name_fr: string;
  name_en: string;
  /** Products of this type are accepted without a per-product review. */
  auto_accept: boolean;
  display_order: number;
};

/** The five types of the code, used until the table answers (and as its seed). */
export const BUILTIN_PRODUCT_TYPES: ProductTypeDef[] = [
  { slug: 'food', name_fr: 'Alimentaire', name_en: 'Food', auto_accept: false, display_order: 10 },
  { slug: 'hygiene', name_fr: 'Hygiène & beauté', name_en: 'Hygiene & beauty', auto_accept: false, display_order: 20 },
  { slug: 'household', name_fr: 'Entretien & maison', name_en: 'Household', auto_accept: false, display_order: 30 },
  { slug: 'clothing', name_fr: 'Vêtements', name_en: 'Clothing', auto_accept: false, display_order: 40 },
  { slug: 'other', name_fr: 'Autre', name_en: 'Other', auto_accept: false, display_order: 90 },
];

export const isBuiltinType = (slug: string) => (PRODUCT_TYPES as readonly string[]).includes(slug);

/** "Parfum & beauté" → "parfum-beaute" (the slug rules of the table). */
export function productTypeSlug(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export const productTypeLabel = (t: ProductTypeDef, lang: string) => (lang.startsWith('en') ? t.name_en : t.name_fr);

const sortTypes = (list: ProductTypeDef[]) =>
  [...list].sort((a, b) => a.display_order - b.display_order || a.name_fr.localeCompare(b.name_fr, 'fr'));

/** The types of the table; the five built-in ones when it cannot be read
 *  (migration not applied yet, network error) so the import keeps working. */
export async function fetchProductTypes(): Promise<ProductTypeDef[]> {
  try {
    const { data, error } = await supabase.from('product_types')
      .select('slug, name_fr, name_en, auto_accept, display_order').order('display_order').order('name_fr');
    if (error) throw error;
    return data?.length ? sortTypes(data as ProductTypeDef[]) : BUILTIN_PRODUCT_TYPES;
  } catch (err) {
    console.warn('[product-types] fetch failed:', err instanceof Error ? err.message : err);
    return BUILTIN_PRODUCT_TYPES;
  }
}

/** Create a type. The slug comes from the French name; an existing slug is an error. */
export async function createProductType(p: { name_fr: string; name_en: string; auto_accept: boolean }): Promise<ProductTypeDef> {
  const slug = productTypeSlug(p.name_fr);
  if (!slug) throw new Error('slug');
  const { data, error } = await supabase.from('product_types')
    .insert({ slug, name_fr: p.name_fr.trim(), name_en: p.name_en.trim() || p.name_fr.trim(), auto_accept: p.auto_accept })
    .select('slug, name_fr, name_en, auto_accept, display_order').single();
  if (error) throw error;
  return data as ProductTypeDef;
}

export async function updateProductType(slug: string, patch: Partial<Pick<ProductTypeDef, 'name_fr' | 'name_en' | 'auto_accept'>>) {
  const { error } = await supabase.from('product_types').update(patch).eq('slug', slug);
  if (error) throw error;
}

/** Only a type no mapping uses can be deleted (FK on delete restrict). */
export async function deleteProductType(slug: string) {
  const { error } = await supabase.from('product_types').delete().eq('slug', slug);
  if (error) throw error;
}

/** Add or replace one type in a sorted list. */
export const withProductType = (list: ProductTypeDef[], t: ProductTypeDef) => sortTypes([...list.filter((x) => x.slug !== t.slug), t]);
