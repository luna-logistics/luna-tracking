import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, Trash2, Eye, Save } from 'lucide-react';
import Markdown from 'markdown-to-jsx';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { BilingualPair } from '@/components/BilingualPair';
import {
  fetchPostById, upsertPost, uploadFeaturedImage, slugify,
  type BlogPost,
} from '@/lib/blog';

/**
 * Create + edit share this page. On create the URL is /admin/blog/nouveau
 * (no :id); on edit /admin/blog/:id — we detect which via useParams.
 * Draft state lives in this component; a Save button persists to Supabase
 * and (on create) redirects to the edit URL for the new row.
 */
export default function AdminBlogForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'nouveau';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<'fr' | 'en' | null>(null);

  const [values, setValues] = useState<Partial<BlogPost>>(() => ({
    slug: '', title_fr: '', title_en: '', excerpt_fr: null, excerpt_en: null,
    content_fr: '', content_en: '', featured_image: null,
    featured_image_alt_fr: null, featured_image_alt_en: null,
    meta_title_fr: null, meta_title_en: null,
    meta_description_fr: null, meta_description_en: null,
    published: false,
  }));

  useEffect(() => {
    if (isNew) return;
    fetchPostById(id!).then((p) => {
      if (p) setValues(p);
      setLoading(false);
    });
  }, [id, isNew]);

  const set = <K extends keyof BlogPost>(k: K, v: BlogPost[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  // Auto-slug from FR title when creating a new post AND slug is empty.
  useEffect(() => {
    if (isNew && !values.slug && values.title_fr) {
      setValues((prev) => ({ ...prev, slug: slugify(values.title_fr!) }));
    }
  }, [values.title_fr, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = useMemo(
    () => Boolean(values.slug?.trim() && values.title_fr?.trim() && values.title_en?.trim()),
    [values.slug, values.title_fr, values.title_en]
  );

  const onSave = async () => {
    if (!canSave) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      const payload = {
        id: isNew ? undefined : id,
        slug: values.slug!,
        title_fr: values.title_fr!,
        title_en: values.title_en!,
        excerpt_fr: values.excerpt_fr ?? null,
        excerpt_en: values.excerpt_en ?? null,
        content_fr: values.content_fr ?? '',
        content_en: values.content_en ?? '',
        featured_image: values.featured_image ?? null,
        featured_image_alt_fr: values.featured_image_alt_fr ?? null,
        featured_image_alt_en: values.featured_image_alt_en ?? null,
        meta_title_fr: values.meta_title_fr ?? null,
        meta_title_en: values.meta_title_en ?? null,
        meta_description_fr: values.meta_description_fr ?? null,
        meta_description_en: values.meta_description_en ?? null,
        published: values.published ?? false,
      };
      const saved = await upsertPost(payload);
      toast.success(t('admin_blog.saved'));
      if (isNew) navigate(`/admin/blog/${saved.id}`, { replace: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-blog] save failed', err);
      toast.error(err instanceof Error ? err.message : t('common.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file: File) => {
    if (!values.slug) { toast.error(t('admin_blog.slug_required_upload')); return; }
    setUploading(true);
    try {
      const url = await uploadFeaturedImage(values.slug, file);
      set('featured_image', url);
      toast.success(t('admin_blog.image_uploaded'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-blog] upload failed', err);
      toast.error(err instanceof Error ? err.message : t('common.error_generic'));
    } finally { setUploading(false); }
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <Label htmlFor="slug" className="text-luna-navy">{t('admin_blog.field_slug')}</Label>
          <Input id="slug" value={values.slug ?? ''} onChange={(e) => set('slug', e.target.value)} className="mt-1.5 font-mono" required />
          <p className="mt-1 text-xs text-slate-500">{t('admin_blog.field_slug_hint')}</p>
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

        {/* Content — bilingual, markdown, with a per-side preview toggle */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-luna-navy">{t('admin_blog.field_content')}</Label>
            <div className="text-xs text-slate-500">{t('admin_blog.markdown_hint')}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {(['fr', 'en'] as const).map((side) => (
              <div key={side}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500">{side.toUpperCase()}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(preview === side ? null : side)}>
                    <Eye className="h-3 w-3" />
                    {preview === side ? t('admin_blog.hide_preview') : t('admin_blog.show_preview')}
                  </Button>
                </div>
                {preview === side ? (
                  <div className="prose prose-sm max-w-none border border-slate-200 rounded-md bg-slate-50/60 p-4 min-h-[16rem]">
                    <Markdown options={{ forceBlock: true }}>{side === 'fr' ? (values.content_fr ?? '') : (values.content_en ?? '')}</Markdown>
                  </div>
                ) : (
                  <Textarea
                    rows={14}
                    value={side === 'fr' ? (values.content_fr ?? '') : (values.content_en ?? '')}
                    onChange={(e) => set(side === 'fr' ? 'content_fr' : 'content_en', e.target.value)}
                    className="font-mono text-sm"
                  />
                )}
              </div>
            ))}
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
