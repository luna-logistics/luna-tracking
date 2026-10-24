/**
 * Products already on Luna without a description, and how to fill them from
 * the store page they were imported from (Edge Function
 * `product-description`, which only reads; the admin page writes).
 * The pure parts are unit-tested in missing-descriptions.test.ts.
 */
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/products';

/** Which missing language(s) the admin looks for. */
export type DescriptionScope = 'any' | 'fr' | 'en' | 'both';

export const missingLangs = (p: Pick<Product, 'description_fr' | 'description_en'>) => ({
  fr: !p.description_fr?.trim(),
  en: !p.description_en?.trim(),
});

export function isMissing(p: Pick<Product, 'description_fr' | 'description_en'>, scope: DescriptionScope): boolean {
  const m = missingLangs(p);
  switch (scope) {
    case 'fr': return m.fr;
    case 'en': return m.en;
    case 'both': return m.fr && m.en;
    default: return m.fr || m.en;
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Products matching the scope and the search text (name, slug, barcode). */
export function findMissingDescriptions<P extends Pick<Product, 'description_fr' | 'description_en' | 'name_fr' | 'name_en' | 'slug_fr' | 'barcode'>>(
  products: P[], scope: DescriptionScope, query = '',
): P[] {
  const q = fold(query.trim());
  return products.filter((p) => isMissing(p, scope)
    && (!q || [p.name_fr, p.name_en, p.slug_fr, p.barcode ?? ''].some((f) => fold(f).includes(q))));
}

export type SourceDescription = {
  id: string;
  status: 'found' | 'no_source' | 'not_found' | 'blocked' | 'error';
  description?: string;
  lang?: string | null;
  url?: string;
  detail?: string;
};

/** Ask the Edge Function for the store descriptions of up to 10 products. */
export async function fetchSourceDescriptions(ids: string[]): Promise<SourceDescription[]> {
  const { data, error } = await supabase.functions.invoke<{ results: SourceDescription[] }>('product-description', { body: { ids } });
  if (error) throw error;
  return data?.results ?? [];
}

export type DescriptionField = 'description_fr' | 'description_en';
export type DescriptionPlan = {
  /** Fields written as found (page already in that language). */
  patch: Partial<Record<DescriptionField, string>>;
  /** Fields to fill with a DeepL translation of the text. */
  translate: Array<{ field: DescriptionField; target: 'fr' | 'en' }>;
  /** Language passed to DeepL (undefined = let DeepL detect it). */
  source?: 'fr' | 'en';
};

/**
 * What to write for one product once its store text is known: only empty
 * fields, the text as is in its own language, a translation for the other
 * one (when `translateOther`). A page that does not state its language is
 * taken as French (Luna imports the stores' /fr/ pages).
 */
export function planDescription(
  p: Pick<Product, 'description_fr' | 'description_en'>,
  text: string,
  lang: string | null | undefined,
  translateOther = true,
): DescriptionPlan {
  const m = missingLangs(p);
  const l = (lang ?? 'fr').toLowerCase();
  const plan: DescriptionPlan = { patch: {}, translate: [], source: l === 'fr' || l === 'en' ? l : undefined };
  for (const [field, target] of [['description_fr', 'fr'], ['description_en', 'en']] as const) {
    if (!m[target]) continue;
    if (l === target) plan.patch[field] = text;
    else if (translateOther || target === 'fr') plan.translate.push({ field, target });
  }
  return plan;
}
