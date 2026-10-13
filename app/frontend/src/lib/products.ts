import { supabase } from '@/lib/supabase';

export type ProductCategory = {
  id: string;
  slug: string;
  name_fr: string;
  name_en: string;
  display_order: number;
  /** Parent family id (e.g. "Boissons") for a two-level menu. null/absent = top level. */
  parent_id?: string | null;
};

/** A brand/manufacturer (e.g. "Jack Daniel's", "Johnnie Walker") — a flat
 *  list, independent of product_categories, that a product can optionally
 *  carry so the catalogue can filter by brand across any category. */
export type Brand = {
  id: string;
  slug: string;
  name_fr: string;
  name_en: string;
  display_order: number;
};

export type Product = {
  id: string;
  /** Bilingual slugs — /achat-envoi/{slug_fr} + /en/shop-and-ship/{slug_en}. */
  slug_fr: string;
  slug_en: string;
  /** Legacy single-slug column kept for the roll-forward window; unread by the frontend. */
  slug?: string | null;
  name_fr: string;
  name_en: string;
  description_fr: string | null;
  description_en: string | null;
  price: number;
  category_id: string;
  /** Optional brand (e.g. Jack Daniel's) — independent of category. */
  brand_id?: string | null;
  barcode: string | null;
  hs_code: string | null;
  weight_kg: number | null;
  image_url: string | null;
  is_active: boolean;
  meta_title_fr: string | null;
  meta_title_en: string | null;
  meta_description_fr: string | null;
  meta_description_en: string | null;
  /** Which store this product belongs to (null for the legacy demo rows). */
  store_id?: string | null;
  /** Informational: does it need the fridge? true/false/null (unknown). */
  requires_cold_chain?: boolean | null;
  is_alcoholic?: boolean;
};

export type Store = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  store_type: string;
  country: string;
  is_active: boolean;
  display_order: number;
};

export function productName(p: Product, lang: 'fr' | 'en'): string {
  return lang === 'en' ? p.name_en : p.name_fr;
}
export function productSlug(p: Product, lang: 'fr' | 'en'): string {
  return lang === 'en' ? p.slug_en : p.slug_fr;
}
export function productDescription(p: Product, lang: 'fr' | 'en'): string | null {
  return lang === 'en' ? p.description_en : p.description_fr;
}
export function productMetaTitle(p: Product, lang: 'fr' | 'en'): string {
  const m = lang === 'en' ? p.meta_title_en : p.meta_title_fr;
  return m || productName(p, lang);
}
export function productMetaDescription(p: Product, lang: 'fr' | 'en'): string | null {
  const m = lang === 'en' ? p.meta_description_en : p.meta_description_fr;
  return m || productDescription(p, lang);
}
export function categoryName(c: ProductCategory, lang: 'fr' | 'en'): string {
  return lang === 'en' ? c.name_en : c.name_fr;
}
export function brandName(b: Brand, lang: 'fr' | 'en'): string {
  return lang === 'en' ? b.name_en : b.name_fr;
}

export async function fetchProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase.from('product_categories').select('*').order('display_order');
  if (error) { console.warn('[products] categories fetch failed:', error.message); return []; }
  return (data ?? []) as ProductCategory[];
}

export async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name_fr');
  if (error) { console.warn('[products] fetch failed:', error.message); return []; }
  return (data ?? []) as Product[];
}

export async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').order('name_fr');
  if (error) { console.warn('[products] fetchAll failed:', error.message); return []; }
  return (data ?? []) as Product[];
}

/** Look up a product by (lang, slug). Falls back to the other language's
 *  slug if not found — a shared URL between users of different languages
 *  still resolves during the transition. */
export async function fetchProductBySlug(lang: 'fr' | 'en', slug: string): Promise<Product | null> {
  const column = lang === 'en' ? 'slug_en' : 'slug_fr';
  const { data, error } = await supabase.from('products').select('*').eq(column, slug).maybeSingle();
  if (error) { console.warn('[products] bySlug failed:', error.message); return null; }
  if (data) return data as Product;
  const other = lang === 'en' ? 'slug_fr' : 'slug_en';
  const { data: alt } = await supabase.from('products').select('*').eq(other, slug).maybeSingle();
  return (alt as Product) ?? null;
}

export async function fetchProductByBarcode(barcode: string): Promise<Product | null> {
  const { data, error } = await supabase.from('products').select('*').eq('barcode', barcode).maybeSingle();
  if (error) { console.warn('[products] byBarcode failed:', error.message); return null; }
  return (data as Product) ?? null;
}

export async function upsertProduct(p: Omit<Product, 'id'> & { id?: string }) {
  const { data, error } = await supabase.from('products').upsert(p).select().single();
  if (error) throw error;
  return data as Product;
}

/** Active stores, ordered — used by the CSV import to resolve store_slug and
 *  by the Courses page store selector (later). */
export async function fetchStores(): Promise<Store[]> {
  const { data, error } = await supabase.from('stores').select('*').order('display_order');
  if (error) { console.warn('[stores] fetch failed:', error.message); return []; }
  return (data ?? []) as Store[];
}

export async function upsertStore(s: Omit<Store, 'id'> & { id?: string }): Promise<Store> {
  const { data, error } = await supabase.from('stores').upsert(s).select().single();
  if (error) throw error;
  return data as Store;
}

/** Stores are never deleted from the UI (products FK is on delete restrict) —
 *  only activated/deactivated. */
export async function toggleStoreActive(id: string, next: boolean) {
  const { error } = await supabase.from('stores').update({ is_active: next }).eq('id', id);
  if (error) throw error;
}

export type ProductSourceInput = {
  product_id: string;
  source_url: string | null;
  source_product_id: string | null;
  source_category: string | null;
  /** 'forced' = left "to verify" by the filter, imported by an explicit admin choice. */
  eligibility_status: 'accepted' | 'forced';
  eligibility_reason: string | null;
};

/** Upsert the 1:1 source-traceability row. store_id is filled by a DB trigger
 *  from products.store_id, so it is not passed here. */
export async function upsertProductSource(s: ProductSourceInput) {
  const { error } = await supabase
    .from('product_sources')
    .upsert({ ...s, last_checked_at: new Date().toISOString() });
  if (error) throw error;
}

export async function toggleProductActive(id: string, next: boolean) {
  const { error } = await supabase.from('products').update({ is_active: next }).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

/** Apply the same patch (category, brand and/or active status) to several
 *  products at once — used by the admin's bulk-select toolbar. A direct
 *  `.update()` rather than `.upsert()` per row, so it never needs the rest
 *  of each product's fields. */
export async function bulkUpdateProducts(
  ids: string[],
  patch: Partial<Pick<Product, 'category_id' | 'brand_id' | 'is_active'>>,
) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('products').update(patch).in('id', ids);
  if (error) throw error;
}

export async function bulkDeleteProducts(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('products').delete().in('id', ids);
  if (error) throw error;
}

export async function upsertCategory(c: Omit<ProductCategory, 'id'> & { id?: string }) {
  const { data, error } = await supabase.from('product_categories').upsert(c).select().single();
  if (error) throw error;
  return data as ProductCategory;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('product_categories').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.from('brands').select('*').order('display_order');
  if (error) { console.warn('[products] brands fetch failed:', error.message); return []; }
  return (data ?? []) as Brand[];
}

export async function upsertBrand(b: Omit<Brand, 'id'> & { id?: string }) {
  const { data, error } = await supabase.from('brands').upsert(b).select().single();
  if (error) throw error;
  return data as Brand;
}

export async function deleteBrand(id: string) {
  const { error } = await supabase.from('brands').delete().eq('id', id);
  if (error) throw error;
}

/** Upload a product photo to the product-images Storage bucket. Returns
 *  the public URL to store in products.image_url. */
export async function uploadProductImage(slug: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${slug || 'product'}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('product-images')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}
