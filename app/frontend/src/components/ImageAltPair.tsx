import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { saveSiteContent, contentKey } from '@/lib/site-content';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { translateText } from '@/lib/translate';
import { errorMessage } from '@/lib/errors';

/**
 * Bilingual alt-text editor for any admin-uploaded image.
 *
 * Stores the alt text in `site_content` under a synthetic page_key
 * `image` so it doesn't collide with real page fields, one row per
 * language:
 *   page_key='image'  lang='fr'  field_key='<image_key>_alt'
 *   page_key='image'  lang='en'  field_key='<image_key>_alt'
 *
 * The public site reads back via useImageAlt(imageKey, defaultAlt),
 * and the prerender picks up the same override so <img alt> and
 * <meta property="og:image:alt"> stay consistent between crawlers and
 * hydrated visitors.
 *
 * Translation: per-side "Traduire vers l'autre langue" button calls
 * DeepL — same UX as every other bilingual field on the admin.
 */
export function ImageAltPair({
  imageKey,
  labelFr = "Texte alternatif (alt) — décrit l'image pour Google Images et les lecteurs d'écran",
  labelEn = 'Alt text — describes the image for Google Images and screen readers',
}: {
  imageKey: string;
  labelFr?: string;
  labelEn?: string;
}) {
  const { t, i18n } = useTranslation();
  const uiLang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const ctx = useSiteContentContext();
  const field = `${imageKey}_alt`;

  const stored = {
    fr: ctx.content.get(contentKey('image', 'fr', field)) ?? '',
    en: ctx.content.get(contentKey('image', 'en', field)) ?? '',
  };

  const [draftFr, setDraftFr] = useState(stored.fr);
  const [draftEn, setDraftEn] = useState(stored.en);
  const [savingFr, setSavingFr] = useState(false);
  const [savingEn, setSavingEn] = useState(false);
  const [translating, setTranslating] = useState<'fr2en' | 'en2fr' | null>(null);

  const dirtyFr = draftFr !== stored.fr;
  const dirtyEn = draftEn !== stored.en;

  const save = async (lang: 'fr' | 'en') => {
    const value = lang === 'fr' ? draftFr : draftEn;
    const setBusy = lang === 'fr' ? setSavingFr : setSavingEn;
    setBusy(true);
    try {
      await saveSiteContent('image', lang, field, value);
      await ctx.refresh();
      toast.success(t('admin_content.saved'));
    } catch (err) {
      console.error('[image-alt] save failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(false); }
  };

  const translate = async (direction: 'fr2en' | 'en2fr') => {
    const src = direction === 'fr2en' ? draftFr : draftEn;
    if (!src.trim()) return;
    setTranslating(direction);
    try {
      const target = direction === 'fr2en' ? 'en' : 'fr';
      const from   = direction === 'fr2en' ? 'fr' : 'en';
      const res = await translateText(src, target, from);
      if (direction === 'fr2en') setDraftEn(res.translation); else setDraftFr(res.translation);
      toast.success(t('admin_content.translated'));
    } catch (err) {
      console.error('[image-alt-translate] failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setTranslating(null); }
  };

  const label = uiLang === 'en' ? labelEn : labelFr;

  return (
    <div className="mt-4">
      <Label className="text-luna-navy text-xs">{label}</Label>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <Side
          side="fr" label="Français"
          value={draftFr} onChange={setDraftFr}
          dirty={dirtyFr} saving={savingFr}
          onSave={() => save('fr')}
          translating={translating} onTranslate={() => translate('fr2en')}
        />
        <Side
          side="en" label="English"
          value={draftEn} onChange={setDraftEn}
          dirty={dirtyEn} saving={savingEn}
          onSave={() => save('en')}
          translating={translating} onTranslate={() => translate('en2fr')}
        />
      </div>
    </div>
  );
}

function Side({
  side, label, value, onChange, dirty, saving, onSave, translating, onTranslate,
}: {
  side: 'fr' | 'en';
  label: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  translating: 'fr2en' | 'en2fr' | null;
  onTranslate: () => void;
}) {
  const { t } = useTranslation();
  const direction = side === 'fr' ? 'fr2en' : 'en2fr';
  const otherName = side === 'fr'
    ? t('admin_content.language_en')
    : t('admin_content.language_fr');
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Button type="button" size="sm" variant="ghost"
          disabled={translating !== null || !value.trim()}
          onClick={onTranslate}
          title={t('admin_content.translate_this_to', { lang: otherName })}
          className="text-xs">
          {translating === direction
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Languages className="h-3 w-3" />}
          {translating === direction ? t('admin_content.translating') : t('admin_content.translate_this_to', { lang: otherName })}
        </Button>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="ex. Camion Luna Tracking sur la route" />
      <div className="mt-1 flex items-center justify-end">
        <Button size="sm" variant={dirty ? 'navy' : 'outline'} disabled={!dirty || saving} onClick={onSave}>
          {saving ? t('admin_content.saving') : t('admin_content.save')}
        </Button>
      </div>
    </div>
  );
}
