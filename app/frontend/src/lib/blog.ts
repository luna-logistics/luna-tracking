import { supabase } from '@/lib/supabase';

export type BlogPost = {
  id: string;
  /** Bilingual slugs — /blog/{slug_fr} + /en/blog/{slug_en}. */
  slug_fr: string;
  slug_en: string;
  /** Legacy single-slug column kept for the roll-forward window; never read
   *  by the frontend now that slug_fr / slug_en exist. */
  slug?: string | null;
  title_fr: string;
  title_en: string;
  excerpt_fr: string | null;
  excerpt_en: string | null;
  content_fr: string;
  content_en: string;
  featured_image: string | null;
  featured_image_alt_fr: string | null;
  featured_image_alt_en: string | null;
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

export function postSlug(p: BlogPost, lang: Lang)        { return lang === 'en' ? p.slug_en : p.slug_fr; }
export function postTitle(p: BlogPost, lang: Lang)       { return lang === 'en' ? p.title_en : p.title_fr; }
export function postExcerpt(p: BlogPost, lang: Lang)     { return lang === 'en' ? p.excerpt_en : p.excerpt_fr; }
export function postContent(p: BlogPost, lang: Lang)     { return lang === 'en' ? p.content_en : p.content_fr; }
export function postMetaTitle(p: BlogPost, lang: Lang)   {
  const m = lang === 'en' ? p.meta_title_en : p.meta_title_fr;
  return m || postTitle(p, lang);
}
export function postMetaDescription(p: BlogPost, lang: Lang) {
  return lang === 'en' ? p.meta_description_en : p.meta_description_fr;
}
export function postImageAlt(p: BlogPost, lang: Lang) {
  const a = lang === 'en' ? p.featured_image_alt_en : p.featured_image_alt_fr;
  return a || postTitle(p, lang);
}

export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false });
  if (error) { console.warn('[blog] fetchPublished failed:', error.message); return []; }
  return (data ?? []) as BlogPost[];
}

/** Admin view — includes drafts. */
export async function fetchAllPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) { console.warn('[blog] fetchAll failed:', error.message); return []; }
  return (data ?? []) as BlogPost[];
}

/** Look up a post by (lang, slug). Falls back to the other language's slug
 *  if not found — lets an old /blog/{en-slug} still resolve during a
 *  transition, and matches the "slug is unique per column" guarantee. */
export async function fetchPostBySlug(lang: Lang, slug: string): Promise<BlogPost | null> {
  const column = lang === 'en' ? 'slug_en' : 'slug_fr';
  const { data, error } = await supabase.from('blog_posts').select('*').eq(column, slug).maybeSingle();
  if (error) { console.warn('[blog] bySlug failed:', error.message); return null; }
  if (data) return data as BlogPost;
  // Cross-lang fallback so a shared URL between users of different languages
  // still resolves (redirects handled at the page level).
  const other = lang === 'en' ? 'slug_fr' : 'slug_en';
  const { data: alt } = await supabase.from('blog_posts').select('*').eq(other, slug).maybeSingle();
  return (alt as BlogPost) ?? null;
}

export async function fetchPostById(id: string): Promise<BlogPost | null> {
  const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[blog] byId failed:', error.message); return null; }
  return (data as BlogPost) ?? null;
}

export async function upsertPost(p: Omit<BlogPost, 'created_at' | 'updated_at' | 'published_at' | 'slug'> & { id?: string; published_at?: string | null }) {
  const { data, error } = await supabase.from('blog_posts').upsert(p).select().single();
  if (error) throw error;
  return data as BlogPost;
}

export async function deletePost(id: string) {
  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) throw error;
}

export async function setPostPublished(id: string, published: boolean) {
  const { error } = await supabase.from('blog_posts').update({ published }).eq('id', id);
  if (error) throw error;
}

/** Upload a featured image (or an inline body image) to blog-images. */
export async function uploadFeaturedImage(slug: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${slug}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('blog-images')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
  return data.publicUrl;
}

export function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
