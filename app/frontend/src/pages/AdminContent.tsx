import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2, Save, RefreshCw, Languages } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { EDITABLE_PAGES, type EditablePage, type EditableField } from '@/lib/editable-content';
import {
  saveSiteContent, saveSiteImage, deleteSiteImage, uploadSiteImage,
  contentKey,
} from '@/lib/site-content';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { translateText } from '@/lib/translate';
import { cn } from '@/lib/utils';

/**
 * One page-picker at the top; each page renders its editable fields in
 * two columns (FR / EN) and its image slots below. Save is per-field
 * (Save button next to each input) so a slip on one field doesn't blow
 * away the others. After every write the context refresh() runs so the
 * override lands in the public site immediately on the next navigation.
 */
export default function AdminContent() {
  const { t, i18n } = useTranslation();
  const uiLang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const ctx = useSiteContentContext();
  const [activeKey, setActiveKey] = useState<string>(EDITABLE_PAGES[0].key);
  const activePage = useMemo(() => EDITABLE_PAGES.find((p) => p.key === activeKey)!, [activeKey]);

  return (
    <>
      <SEO title={t('admin_content.title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy">{t('admin_content.title')}</h1>
          <p className="mt-2 text-slate-600 max-w-3xl">{t('admin_content.intro')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => ctx.refresh()}>
          <RefreshCw className="h-4 w-4" />
          {t('admin_content.refresh')}
        </Button>
      </div>

      {/* Page selector — pills, not tabs, because the list will grow */}
      <div className="mt-6 flex flex-wrap gap-2">
        {EDITABLE_PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setActiveKey(p.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium border transition-colors',
              activeKey === p.key
                ? 'bg-luna-navy text-white border-luna-navy'
                : 'bg-white text-luna-navy border-slate-200 hover:border-luna-navy/40'
            )}
          >
            {uiLang === 'en' ? p.labelEn : p.labelFr}
          </button>
        ))}
      </div>

      <PageEditor page={activePage} uiLang={uiLang} />
    </>
  );
}

function PageEditor({ page, uiLang }: { page: EditablePage; uiLang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  return (
    <div className="mt-8 space-y-8">
      {page.fields.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-luna-navy mb-3">
            {t('admin_content.section_text')}
          </h2>
          <div className="space-y-6">
            {page.fields.map((f) => (
              <FieldEditor key={f.key} page={page.key} field={f} uiLang={uiLang} />
            ))}
          </div>
        </section>
      )}
      {page.images.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-luna-navy mb-3">
            {t('admin_content.section_images')}
          </h2>
          <div className="space-y-6">
            {page.images.map((img) => (
              <ImageEditor key={img.key} imageKey={img.key} labelFr={img.labelFr} labelEn={img.labelEn}
                hintFr={img.hintFr} hintEn={img.hintEn} uiLang={uiLang} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FieldEditor({ page, field, uiLang }: { page: string; field: EditableField; uiLang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  const label = uiLang === 'en' ? field.labelEn : field.labelFr;
  const hint = uiLang === 'en' ? field.hintEn : field.hintFr;

  // Two draft states shared with the pair of FieldSlots so the "Translate
  // FR→EN" button on the FR slot can push the DeepL output into the EN slot
  // without a page round-trip.
  const [frDraft, setFrDraft] = useState<string | null>(null);
  const [enDraft, setEnDraft] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm font-semibold text-luna-navy">{label}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <FieldSlot page={page} field={field} lang="fr" labelLang={t('admin_content.lang_fr')}
          externalValue={frDraft} onValueChange={setFrDraft} pairValue={enDraft} onPairChange={setEnDraft} />
        <FieldSlot page={page} field={field} lang="en" labelLang={t('admin_content.lang_en')}
          externalValue={enDraft} onValueChange={setEnDraft} pairValue={frDraft} onPairChange={setFrDraft} />
      </div>
    </div>
  );
}

function FieldSlot({
  page, field, lang, labelLang, externalValue, onValueChange, pairValue, onPairChange,
}: {
  page: string; field: EditableField; lang: 'fr' | 'en'; labelLang: string;
  externalValue: string | null;
  onValueChange: (v: string | null) => void;
  pairValue: string | null;
  onPairChange: (v: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const ctx = useSiteContentContext();
  const key = contentKey(page, lang, field.key);
  const stored = ctx.content.get(key);          // string OR undefined
  const defaultValue = i18n.t(field.i18nKey, { lng: lang }) as string;
  // Effective value in the input: draft > stored override > site default.
  const value = externalValue ?? stored ?? defaultValue;
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const isOverride = stored !== undefined;
  // Dirty when the input differs from what's persisted (or from default if no
  // override exists yet).
  const persistedForCompare = stored ?? defaultValue;
  const dirty = value !== persistedForCompare;

  // Reset local draft when the underlying persisted value changes (another
  // admin's edit, or a refresh() after our own save).
  useEffect(() => { onValueChange(null); }, [stored, defaultValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (v: string) => onValueChange(v);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveSiteContent(page, lang, field.key, value);
      await ctx.refresh();
      onValueChange(null);
      toast.success(`${labelLang} — ${t('admin_content.saved')}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-content] save failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!confirm(t('admin_content.reset_confirm'))) return;
    setSaving(true);
    try {
      await saveSiteContent(page, lang, field.key, '');  // empty = delete row = revert to default
      await ctx.refresh();
      onValueChange(null);
      toast.success(`${labelLang} — ${t('admin_content.reset_done')}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-content] reset failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  const otherLang: 'fr' | 'en' = lang === 'fr' ? 'en' : 'fr';
  const onTranslate = async () => {
    if (!value.trim()) return;
    setTranslating(true);
    try {
      const res = await translateText(value, otherLang, lang);
      onPairChange(res.translation);
      toast.success(t('admin_content.translated'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[translate] failed', err);
      const msg = err instanceof Error ? err.message : t('common.error_generic');
      toast.error(msg);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
        {labelLang}
      </label>
      {field.kind === 'textarea' ? (
        <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-slate-400">
          {isOverride ? t('admin_content.currently_overridden') : t('admin_content.currently_default')}
        </span>
        <div className="flex items-center gap-2">
          {isOverride && (
            <Button size="sm" variant="ghost" disabled={saving} onClick={onReset}
              className="text-slate-500 hover:text-luna-navy" title={t('admin_content.reset_tooltip')}>
              {t('admin_content.reset')}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={translating || !value.trim()} onClick={onTranslate}
            title={t('admin_content.translate_to', { lang: otherLang.toUpperCase() })}>
            <Languages className="h-3.5 w-3.5" />
            {translating ? t('admin_content.translating') : `→ ${otherLang.toUpperCase()}`}
          </Button>
          <Button size="sm" variant={dirty ? 'navy' : 'outline'} disabled={!dirty || saving} onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            {saving ? t('admin_content.saving') : t('admin_content.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImageEditor({
  imageKey, labelFr, labelEn, hintFr, hintEn, uiLang,
}: {
  imageKey: string; labelFr: string; labelEn: string;
  hintFr?: string; hintEn?: string; uiLang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const ctx = useSiteContentContext();
  const currentUrl = ctx.images.get(imageKey);
  const [uploading, setUploading] = useState(false);

  const label = uiLang === 'en' ? labelEn : labelFr;
  const hint = uiLang === 'en' ? hintEn : hintFr;

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadSiteImage(imageKey, file);
      await saveSiteImage(imageKey, url);
      await ctx.refresh();
      toast.success(t('admin_content.saved'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-content] upload failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async () => {
    if (!confirm(t('admin_content.remove_confirm'))) return;
    try {
      await deleteSiteImage(imageKey);
      await ctx.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-content] remove failed', err);
      toast.error(t('common.error_generic'));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm font-semibold text-luna-navy">{label}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="w-48 h-28 rounded-md border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
          {currentUrl ? (
            <img src={currentUrl} alt={label} className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">{t('admin_content.no_image')}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-3 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? t('admin_content.uploading') : t('admin_content.upload')}
            <input
              type="file" className="hidden" accept="image/*" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          {currentUrl && (
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
              {t('admin_content.remove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
