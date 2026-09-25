import { supabase } from '@/lib/supabase';
import type { CategoryMapping, ImportProfile, ImportRules } from '@/lib/import-profile';
import type { ProductType } from '@/lib/normalized-product';

/** Admin-only (RLS). Import profiles + their category mappings. */

export async function fetchImportProfiles(): Promise<ImportProfile[]> {
  const { data, error } = await supabase.from('import_profiles').select('id, slug, name, header_signature, store_id, rules').order('name');
  if (error) { console.warn('[import-profiles] fetch failed:', error.message); return []; }
  return (data ?? []) as ImportProfile[];
}

export async function fetchCategoryMappings(profileId: string): Promise<CategoryMapping[]> {
  const { data, error } = await supabase.from('import_category_mappings')
    .select('id, profile_id, source_category, action, category_id, product_type')
    .eq('profile_id', profileId).order('source_category');
  if (error) { console.warn('[import-profiles] mappings fetch failed:', error.message); return []; }
  return (data ?? []) as CategoryMapping[];
}

export async function createImportProfile(p: {
  slug: string; name: string; header_signature: string; store_id: string | null; rules: ImportRules;
}): Promise<ImportProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('import_profiles')
    .insert({ ...p, created_by: user?.id ?? null })
    .select('id, slug, name, header_signature, store_id, rules').single();
  if (error) throw error;
  return data as ImportProfile;
}

export async function updateImportProfile(id: string, patch: Partial<Pick<ImportProfile, 'name' | 'store_id' | 'rules' | 'header_signature'>>) {
  const { error } = await supabase.from('import_profiles').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteImportProfile(id: string) {
  const { error } = await supabase.from('import_profiles').delete().eq('id', id);
  if (error) throw error;
}

/** Create or replace the mapping for one source_category path. */
export async function saveCategoryMapping(m: {
  profile_id: string; source_category: string; action: 'map' | 'skip';
  category_id: string | null; product_type: ProductType | null;
}): Promise<CategoryMapping> {
  const row = m.action === 'skip' ? { ...m, category_id: null, product_type: null } : m;
  const { data, error } = await supabase.from('import_category_mappings')
    .upsert(row, { onConflict: 'profile_id,source_category' })
    .select('id, profile_id, source_category, action, category_id, product_type').single();
  if (error) throw error;
  return data as CategoryMapping;
}

export async function deleteCategoryMapping(id: string) {
  const { error } = await supabase.from('import_category_mappings').delete().eq('id', id);
  if (error) throw error;
}

/** Re-import of a known store product: refresh what the store owns (price,
 *  photo, weight) — never the texts, slugs or visibility an admin may have
 *  edited since. */
export async function updateProductFromSource(id: string, p: { price: number; image_url: string | null; weight_kg: number | null }) {
  const patch: Record<string, unknown> = { price: p.price };
  if (p.image_url) patch.image_url = p.image_url;
  if (p.weight_kg != null) patch.weight_kg = p.weight_kg;
  const { error } = await supabase.from('products').update(patch).eq('id', id);
  if (error) throw error;
}

/** Existing product already imported from this store + source id (re-import
 *  = update, never a duplicate). */
export async function findProductBySource(storeId: string, sourceProductId: string): Promise<{ id: string; is_active: boolean } | null> {
  const { data, error } = await supabase.from('product_sources')
    .select('product_id, products!inner(is_active)')
    .eq('store_id', storeId).eq('source_product_id', sourceProductId).maybeSingle();
  if (error) { console.warn('[import] source lookup failed:', error.message); return null; }
  if (!data) return null;
  const prod = data.products as unknown as { is_active: boolean };
  return { id: data.product_id as string, is_active: prod.is_active };
}
