import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { translateText } from '@/lib/translate';
import { errorMessage } from '@/lib/errors';

type Props = {
  label: string;
  labelFr: string;
  labelEn: string;
  fr: string;
  en: string;
  onFr: (v: string) => void;
  onEn: (v: string) => void;
  kind: 'input' | 'textarea';
  rows?: number;
  required?: boolean;
};

/**
 * Two side-by-side inputs (FR / EN) with per-side "Translate to the
 * other" button (DeepL via the edge function). Used across product form,
 * blog form, category form — anywhere content is authored bilingually.
 */
export function BilingualPair({
  label, labelFr, labelEn, fr, en, onFr, onEn, kind, rows = 4, required = false,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'fr2en' | 'en2fr' | null>(null);

  const translate = async (direction: 'fr2en' | 'en2fr') => {
    const source = direction === 'fr2en' ? fr : en;
    if (!source.trim()) return;
    setBusy(direction);
    try {
      const target = direction === 'fr2en' ? 'en' : 'fr';
      const from   = direction === 'fr2en' ? 'fr' : 'en';
      const res = await translateText(source, target, from);
      if (direction === 'fr2en') onEn(res.translation); else onFr(res.translation);
      toast.success(t('admin_content.translated'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[translate] failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <Label className="text-luna-navy">{label}</Label>
      <div className="mt-1.5 grid gap-3 md:grid-cols-2">
        {(['fr', 'en'] as const).map((side) => {
          const value    = side === 'fr' ? fr : en;
          const setter   = side === 'fr' ? onFr : onEn;
          const label    = side === 'fr' ? labelFr : labelEn;
          const otherName = side === 'fr' ? t('admin_content.language_en') : t('admin_content.language_fr');
          const direction = side === 'fr' ? 'fr2en' : 'en2fr';
          return (
            <div key={side}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs font-semibold text-slate-600">{label}</span>
                <Button type="button" size="sm" variant="ghost" disabled={busy !== null || !value.trim()}
                  onClick={() => translate(direction)}
                  title={t('admin_content.translate_this_to', { lang: otherName })}
                  className="text-xs">
                  <Languages className="h-3.5 w-3.5" />
                  {busy === direction ? t('admin_content.translating') : t('admin_content.translate_this_to', { lang: otherName })}
                </Button>
              </div>
              {kind === 'textarea' ? (
                <Textarea value={value} onChange={(e) => setter(e.target.value)} rows={rows} required={required} />
              ) : (
                <Input value={value} onChange={(e) => setter(e.target.value)} required={required} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
