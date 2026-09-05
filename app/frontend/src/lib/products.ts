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
  slug: string;
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
};

export function productName(p: Product, lang: 'fr' | 'en'): string {
  return lang === 'en' ? p.name_en : p.name_fr;
}
export function productDescription(p: Product, lang: 'fr' | 'en'): string | null {
  return lang === 'en' ? p.description_en : p.description_fr;
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

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase.from('products').select('*').eq('slug', slug).maybeSingle();
  if (error) { console.warn('[products] bySlug failed:', error.message); return null; }
  return (data as Product) ?? null;
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
