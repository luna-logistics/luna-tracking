import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import RichTextEditor from '@/components/RichTextEditor';
import { translateText } from '@/lib/translate';
import { errorMessage } from '@/lib/errors';

type Props = {
  label: string;
  fr: string;
  en: string;
  onFr: (html: string) => void;
  onEn: (html: string) => void;
  onRequestImage: () => Promise<{ url: string; alt: string } | null>;
  placeholder?: string;
};

/**
 * Two side-by-side RichTextEditors (FR + EN) with a per-side "Translate
 * to the other language" button. Uses the DeepL edge function with
 * `tag_handling: html` so all markup (headings, lists, links, inline
 * images) is preserved and, per DeepL's pricing, HTML tags don't count
 * against the character quota.
 *
 * Extracted from AdminBlogForm so custom-pages, and any future rich-text
 * pair, keep the same UX without copy-paste.
 */
export function BilingualRichTextEditor({
  label, fr, en, onFr, onEn, onRequestImage, placeholder,
}: Props) {
  return (
    <div>
      <Label className="text-luna-navy">{label}</Label>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Side
          sideLabel="Français"
          value={fr}
          onChange={onFr}
          onTranslate={onEn}
          side="fr"
          onRequestImage={onRequestImage}
          placeholder={placeholder}
        />
        <Side
          sideLabel="English"
          value={en}
          onChange={onEn}
          onTranslate={onFr}
          side="en"
          onRequestImage={onRequestImage}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

function Side({
  sideLabel, value, onChange, onTranslate, side, onRequestImage, placeholder,
}: {
  sideLabel: string;
  value: string;
  onChange: (html: string) => void;
  /** Writes the translation to the OTHER side of the pair. */
  onTranslate: (html: string) => void;
  side: 'fr' | 'en';
  onRequestImage: () => Promise<{ url: string; alt: string } | null>;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const otherName = side === 'fr'
    ? t('admin_content.language_en')
    : t('admin_content.language_fr');

  const doTranslate = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const target = side === 'fr' ? 'en' : 'fr';
      const res = await translateText(value, target, side);
      onTranslate(res.translation);
      toast.success(t('admin_content.translated'));
    } catch (err) {
      console.error('[translate-content] failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs font-medium text-slate-500">{sideLabel}</span>
        <Button
          type="button" size="sm" variant="ghost"
          disabled={busy || !value.trim()}
          onClick={doTranslate}
          title={t('admin_content.translate_this_to', { lang: otherName })}
          className="text-xs"
        >
          {busy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Languages className="h-3.5 w-3.5" />}
          {busy
            ? t('admin_content.translating')
            : t('admin_content.translate_this_to', { lang: otherName })}
        </Button>
      </div>
      <RichTextEditor
        content={value}
        onChange={onChange}
        allowHtmlSourceView
        onRequestImage={onRequestImage}
        placeholder={placeholder}
      />
    </div>
  );
}
