import { supabase } from '@/lib/supabase';

export type ProductCategory = {
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
  barcode: string | null;
  hs_code: string | null;
  weight_kg: number | null;
  image_url: string | null;
  is_active: boolean;
  meta_title_fr: string | null;
  meta_title_en: string | null;
  meta_description_fr: string | null;
  meta_description_en: string | null;
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

export async function toggleProductActive(id: string, next: boolean) {
  const { error } = await supabase.from('products').update({ is_active: next }).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id);
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
