import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, Trash2, Save, Languages } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { BilingualPair } from '@/components/BilingualPair';
import RichTextEditor from '@/components/RichTextEditor';
import {
  fetchPostById, upsertPost, uploadFeaturedImage, slugify,
  type BlogPost,
} from '@/lib/blog';
import { optimizeImage } from '@/lib/optimize-image';
import { translateText } from '@/lib/translate';

export default function AdminBlogForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'nouveau';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translatingSlug, setTranslatingSlug] = useState<'fr2en' | 'en2fr' | null>(null);

  const [values, setValues] = useState<Partial<BlogPost>>(() => ({
    slug_fr: '', slug_en: '',
    title_fr: '', title_en: '', excerpt_fr: null, excerpt_en: null,
    content_fr: '', content_en: '',
    featured_image: null, featured_image_alt_fr: null, featured_image_alt_en: null,
    meta_title_fr: null, meta_title_en: null,
    meta_description_fr: null, meta_description_en: null,
    published: false,
  }));

  useEffect(() => {
    if (isNew) return;
    fetchPostById(id!).then((p) => { if (p) setValues(p); setLoading(false); });
  }, [id, isNew]);

  const set = <K extends keyof BlogPost>(k: K, v: BlogPost[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  // Auto-slug from titles on create; leave alone on edit.
  useEffect(() => {
    if (isNew && !values.slug_fr && values.title_fr) set('slug_fr', slugify(values.title_fr));
  }, [values.title_fr, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isNew && !values.slug_en && values.title_en) set('slug_en', slugify(values.title_en));
  }, [values.title_en, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = useMemo(
    () => Boolean(values.slug_fr?.trim() && values.slug_en?.trim()
      && values.title_fr?.trim() && values.title_en?.trim()),
    [values.slug_fr, values.slug_en, values.title_fr, values.title_en]
  );

  const onSave = async () => {
    if (!canSave) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      const payload = {
        id: isNew ? undefined : id,
        slug_fr: values.slug_fr!, slug_en: values.slug_en!,
        title_fr: values.title_fr!, title_en: values.title_en!,
        excerpt_fr: values.excerpt_fr ?? null, excerpt_en: values.excerpt_en ?? null,
        content_fr: values.content_fr ?? '', content_en: values.content_en ?? '',
        featured_image: values.featured_image ?? null,
        featured_image_alt_fr: values.featured_image_alt_fr ?? null,
        featured_image_alt_en: values.featured_image_alt_en ?? null,
        meta_title_fr: values.meta_title_fr ?? null, meta_title_en: values.meta_title_en ?? null,
        meta_description_fr: values.meta_description_fr ?? null, meta_description_en: values.meta_description_en ?? null,
        published: values.published ?? false,
      };
      const saved = await upsertPost(payload);
      toast.success(t('admin_blog.saved'));
      if (isNew) navigate(`/admin/blog/${saved.id}`, { replace: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-blog] save failed', err);
      toast.error(err instanceof Error ? err.message : t('common.error_generic'));
    } finally { setSaving(false); }
  };

  const onUpload = async (file: File) => {
    const s = values.slug_fr || values.slug_en;
    if (!s) { toast.error(t('admin_blog.slug_required_upload')); return; }
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxWidth: 1600, quality: 0.85 });
      const url = await uploadFeaturedImage(s, optimized);
      set('featured_image', url);
      toast.success(t('admin_blog.image_uploaded'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-blog] upload failed', err);
      toast.error(err instanceof Error ? err.message : t('common.error_generic'));
    } finally { setUploading(false); }
  };

  const translateSlug = async (direction: 'fr2en' | 'en2fr') => {
    const sourceTitle = direction === 'fr2en' ? values.title_fr : values.title_en;
    if (!sourceTitle?.trim()) return;
    setTranslatingSlug(direction);
    try {
      const target = direction === 'fr2en' ? 'en' : 'fr';
      const from   = direction === 'fr2en' ? 'fr' : 'en';
      const res = await translateText(sourceTitle, target, from);
      const newSlug = slugify(res.translation);
      if (direction === 'fr2en') set('slug_en', newSlug); else set('slug_fr', newSlug);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[translate-slug] failed', err);
      toast.error(err instanceof Error ? err.message : t('common.error_generic'));
    } finally { setTranslatingSlug(null); }
  };

  // Inline body-image picker for the RichTextEditor. Uploads and returns
  // the {url, alt} the editor needs to insert a <figure>.
  const onRequestImage = async (): Promise<{ url: string; alt: string } | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const s = values.slug_fr || values.slug_en;
        if (!s) { toast.error(t('admin_blog.slug_required_upload')); resolve(null); return; }
        try {
          const optimized = await optimizeImage(file, { maxWidth: 1600, quality: 0.85 });
          const url = await uploadFeaturedImage(s, optimized);
          const alt = prompt(t('admin_blog.image_alt_prompt')) ?? '';
          resolve({ url, alt });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          toast.error(err instanceof Error ? err.message : t('common.error_generic'));
          resolve(null);
        }
      };
      input.click();
    });
  };

  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <>
      <SEO title={isNew ? t('admin_blog.new') : t('admin_blog.edit')} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/blog"><ArrowLeft className="h-4 w-4" /> {t('admin_blog.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy">
          {isNew ? t('admin_blog.new_title') : t('admin_blog.edit_title')}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-center gap-2 text-sm text-slate-700 rounded-md border border-slate-200 bg-white px-3 py-1.5">
            <Switch checked={values.published ?? false} onCheckedChange={(v) => set('published', v)} />
            <span>{values.published ? t('admin_blog.status_published') : t('admin_blog.status_draft')}</span>
          </div>
          <Button variant="navy" disabled={saving || !canSave} onClick={onSave}>
            <Save className="h-4 w-4" />
            {saving ? t('admin_blog.saving') : t('admin_blog.save')}
          </Button>
        </div>
      </div>

      <div className="space-y-6 max-w-5xl">
        {/* Slugs FR + EN with translate-title-into-other-slug helper */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Label className="text-luna-navy">{t('admin_blog.field_slugs')}</Label>
          <p className="mt-1 text-xs text-slate-500">{t('admin_blog.field_slugs_hint')}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">FR — /blog/…</span>
                <Button type="button" size="sm" variant="ghost" disabled={translatingSlug !== null || !values.title_fr?.trim()}
                  onClick={() => translateSlug('fr2en')}>
                  <Languages className="h-3 w-3" />
                  {translatingSlug === 'fr2en' ? '…' : t('admin_blog.slug_from_title_en')}
                </Button>
              </div>
              <Input value={values.slug_fr ?? ''} onChange={(e) => set('slug_fr', e.target.value)}
                required className="font-mono text-sm" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">EN — /en/blog/…</span>
                <Button type="button" size="sm" variant="ghost" disabled={translatingSlug !== null || !values.title_en?.trim()}
                  onClick={() => translateSlug('en2fr')}>
                  <Languages className="h-3 w-3" />
                  {translatingSlug === 'en2fr' ? '…' : t('admin_blog.slug_from_title_fr')}
                </Button>
              </div>
              <Input value={values.slug_en ?? ''} onChange={(e) => set('slug_en', e.target.value)}
                required className="font-mono text-sm" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <BilingualPair
            label={t('admin_blog.field_title')}
            labelFr="Français" labelEn="English"
            fr={values.title_fr ?? ''} en={values.title_en ?? ''}
            onFr={(v) => set('title_fr', v)} onEn={(v) => set('title_en', v)}
            kind="input" required
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <BilingualPair
            label={t('admin_blog.field_excerpt')}
            labelFr="Français" labelEn="English"
            fr={values.excerpt_fr ?? ''} en={values.excerpt_en ?? ''}
            onFr={(v) => set('excerpt_fr', v || null)} onEn={(v) => set('excerpt_en', v || null)}
            kind="textarea" rows={3}
          />
        </div>

        {/* Content — RichTextEditor per language, with inline image upload
            and HTML source-view toggle (allowHtmlSourceView) so an admin
            can drop into raw HTML when Markdown isn't enough. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-luna-navy">{t('admin_blog.field_content')}</Label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="text-xs font-medium text-slate-500 block mb-1">Français</span>
              <RichTextEditor
                content={values.content_fr ?? ''}
                onChange={(html) => set('content_fr', html)}
                allowHtmlSourceView
                onRequestImage={onRequestImage}
                placeholder={t('admin_blog.content_placeholder')}
              />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block mb-1">English</span>
              <RichTextEditor
                content={values.content_en ?? ''}
                onChange={(html) => set('content_en', html)}
                allowHtmlSourceView
                onRequestImage={onRequestImage}
                placeholder={t('admin_blog.content_placeholder')}
              />
            </div>
          </div>
        </div>

        {/* Featured image */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Label className="text-luna-navy">{t('admin_blog.field_featured_image')}</Label>
          <div className="mt-3 flex flex-wrap items-start gap-4">
            <div className="w-56 aspect-video rounded-md border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
              {values.featured_image ? (
                <img src={values.featured_image} alt="" className="max-w-full max-h-full object-cover" />
              ) : (
                <span className="text-xs text-slate-400">{t('admin_blog.no_image')}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-3 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? t('admin_blog.uploading') : t('admin_blog.upload_image')}
                <input type="file" className="hidden" accept="image/*" disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              </label>
              {values.featured_image && (
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => set('featured_image', null)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('admin_blog.remove_image')}
                </Button>
              )}
            </div>
          </div>
          {values.featured_image && (
            <div className="mt-4">
              <BilingualPair
                label={t('admin_blog.field_image_alt')}
                labelFr="Français" labelEn="English"
                fr={values.featured_image_alt_fr ?? ''} en={values.featured_image_alt_en ?? ''}
                onFr={(v) => set('featured_image_alt_fr', v || null)} onEn={(v) => set('featured_image_alt_en', v || null)}
                kind="input"
              />
            </div>
          )}
        </div>

        {/* SEO meta */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-luna-navy mb-3">{t('admin_blog.section_seo')}</h3>
          <div className="space-y-4">
            <BilingualPair
              label={t('admin_blog.field_meta_title')}
              labelFr="Français" labelEn="English"
              fr={values.meta_title_fr ?? ''} en={values.meta_title_en ?? ''}
              onFr={(v) => set('meta_title_fr', v || null)} onEn={(v) => set('meta_title_en', v || null)}
              kind="input"
            />
            <BilingualPair
              label={t('admin_blog.field_meta_description')}
              labelFr="Français" labelEn="English"
              fr={values.meta_description_fr ?? ''} en={values.meta_description_en ?? ''}
              onFr={(v) => set('meta_description_fr', v || null)} onEn={(v) => set('meta_description_en', v || null)}
              kind="textarea" rows={3}
            />
          </div>
        </div>
      </div>
    </>
  );
}
