import { supabase } from '@/lib/supabase';

export type SiteContentRow = {
  id: string;
  page_key: string;
  lang: 'fr' | 'en';
  field_key: string;
  value: string;
  updated_at: string;
};

export type SiteImageRow = {
  id: string;
  image_key: string;
  url: string;
  updated_at: string;
};

export type SiteBlockRow = {
  id: string;
  block_key: string;
  hidden: boolean;
  updated_at: string;
};

/** Compose the cache key used by the runtime resolver + the admin editor. */
export const contentKey = (page: string, lang: 'fr' | 'en', field: string) =>
  `${page}::${lang}::${field}`;

export async function fetchAllSiteContent(): Promise<SiteContentRow[]> {
  const { data, error } = await supabase.from('site_content').select('*');
  if (error) { console.warn('[site-content] fetch failed:', error.message); return []; }
  return (data ?? []) as SiteContentRow[];
}

export async function fetchAllSiteImages(): Promise<SiteImageRow[]> {
  const { data, error } = await supabase.from('site_images').select('*');
  if (error) { console.warn('[site-images] fetch failed:', error.message); return []; }
  return (data ?? []) as SiteImageRow[];
}

export async function fetchAllSiteBlocks(): Promise<SiteBlockRow[]> {
  const { data, error } = await supabase.from('site_blocks').select('*');
  if (error) { console.warn('[site-blocks] fetch failed:', error.message); return []; }
  return (data ?? []) as SiteBlockRow[];
}

export async function setBlockHidden(block_key: string, hidden: boolean) {
  const { error } = await supabase.from('site_blocks')
    .upsert({ block_key, hidden }, { onConflict: 'block_key' });
  if (error) throw error;
}

/**
 * Write (upsert-or-delete) a content field. Passing an empty / whitespace
 * value DELETES the row so the page falls back to its i18n default —
 * cleaner than an empty string sitting in the DB.
 */
export async function saveSiteContent(page: string, lang: 'fr' | 'en', field: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    const { error } = await supabase.from('site_content')
      .delete()
      .eq('page_key', page).eq('lang', lang).eq('field_key', field);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('site_content')
    .upsert({ page_key: page, lang, field_key: field, value: trimmed }, { onConflict: 'page_key,lang,field_key' });
  if (error) throw error;
}

export async function saveSiteImage(image_key: string, url: string) {
  const { error } = await supabase.from('site_images')
    .upsert({ image_key, url }, { onConflict: 'image_key' });
  if (error) throw error;
}

export async function deleteSiteImage(image_key: string) {
  const { error } = await supabase.from('site_images').delete().eq('image_key', image_key);
  if (error) throw error;
}

/**
 * Upload a file to the `site-images` Storage bucket and return its public
 * URL. Filename is derived from the image_key + a cache-busting timestamp
 * so the CDN never serves a stale version after a re-upload.
 */
export async function uploadSiteImage(image_key: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${image_key}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('site-images')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('site-images').getPublicUrl(path);
  return data.publicUrl;
}
