import { supabase } from '@/lib/supabase';

/** Slugs that would collide with a fixed route on the site. Enforced in
 *  Postgres too (see 20260907000000_custom_pages.sql) — this list stays in
 *  sync by hand and gives the admin a friendly refusal before the DB does. */
export const RESERVED_SLUGS = new Set<string>([
  'suivi','tarifs','contact','achat-envoi','reexpedition','blog','en','admin',
  'compte','connexion','inscription','mot-de-passe-oublie','auth','tracking',
  'pricing','shop-and-ship','international-forwarding','account','login','signup',
  'forgot-password','robots.txt','sitemap.xml','favicon.ico','brand',
]);

export type CustomPage = {
  id: string;
  slug_fr: string;
  slug_en: string;
  title_fr: string;
  title_en: string;
  content_fr: string;
  content_en: string;
  og_image: string | null;
  og_image_alt_fr: string | null;
  og_image_alt_en: string | null;
  meta_title_fr: string | null;
  meta_title_en: string | null;
  meta_description_fr: string | null;
  meta_description_en: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Lang = 'fr' | 'en';

export function pageSlug(p: CustomPage, lang: Lang)      { return lang === 'en' ? p.slug_en : p.slug_fr; }
export function pageTitle(p: CustomPage, lang: Lang)     { return lang === 'en' ? p.title_en : p.title_fr; }
export function pageContent(p: CustomPage, lang: Lang)   { return lang === 'en' ? p.content_en : p.content_fr; }
export function pageMetaTitle(p: CustomPage, lang: Lang) {
  const m = lang === 'en' ? p.meta_title_en : p.meta_title_fr;
  return m || pageTitle(p, lang);
}
export function pageMetaDescription(p: CustomPage, lang: Lang) {
  return lang === 'en' ? p.meta_description_en : p.meta_description_fr;
}
export function pageImageAlt(p: CustomPage, lang: Lang) {
  const a = lang === 'en' ? p.og_image_alt_en : p.og_image_alt_fr;
  return a || pageTitle(p, lang);
}

export async function fetchPublishedPages(): Promise<CustomPage[]> {
  const { data, error } = await supabase
    .from('custom_pages').select('*').eq('published', true).order('published_at', { ascending: false });
  if (error) { console.warn('[custom-pages] fetchPublished failed:', error.message); return []; }
  return (data ?? []) as CustomPage[];
}

export async function fetchAllPages(): Promise<CustomPage[]> {
  const { data, error } = await supabase
    .from('custom_pages').select('*').order('updated_at', { ascending: false });
  if (error) { console.warn('[custom-pages] fetchAll failed:', error.message); return []; }
  return (data ?? []) as CustomPage[];
}

export async function fetchPageBySlug(lang: Lang, slug: string): Promise<CustomPage | null> {
  const column = lang === 'en' ? 'slug_en' : 'slug_fr';
  const { data, error } = await supabase.from('custom_pages').select('*').eq(column, slug).maybeSingle();
  if (error) { console.warn('[custom-pages] bySlug failed:', error.message); return null; }
  if (data) return data as CustomPage;
  const other = lang === 'en' ? 'slug_fr' : 'slug_en';
  const { data: alt } = await supabase.from('custom_pages').select('*').eq(other, slug).maybeSingle();
  return (alt as CustomPage) ?? null;
}

export async function fetchPageById(id: string): Promise<CustomPage | null> {
  const { data, error } = await supabase.from('custom_pages').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[custom-pages] byId failed:', error.message); return null; }
  return (data as CustomPage) ?? null;
}

export async function upsertPage(
  p: Omit<CustomPage, 'created_at' | 'updated_at' | 'published_at'> & { id?: string; published_at?: string | null }
) {
  const { data, error } = await supabase.from('custom_pages').upsert(p).select().single();
  if (error) throw error;
  return data as CustomPage;
}

export async function deletePage(id: string) {
  const { error } = await supabase.from('custom_pages').delete().eq('id', id);
  if (error) throw error;
}

export async function setPagePublished(id: string, published: boolean) {
  const { error } = await supabase.from('custom_pages').update({ published }).eq('id', id);
  if (error) throw error;
}

/** Upload an OG image to the blog-images bucket (shared — admins-only write). */
export async function uploadPageImage(slugFragment: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `pages/${slugFragment}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('blog-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
  return data.publicUrl;
}

export function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
