import { useTranslation } from 'react-i18next';
import { BookOpen, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INCOTERMS, INCOTERMS_GUIDE_SLUGS, SEA_ONLY_INCOTERMS, isIncoterm } from '@/lib/incoterms';
import { blogPostUrl } from '@/lib/url/routes';

/**
 * Incoterms 2020 dropdown. The list stays compact (code + short name); the
 * plain-language "who pays / who carries the risk" explanation of the chosen
 * term is shown under the field, with a link to the full guide.
 */
export function IncotermSelect({
  value, onChange, mode, disabled, id,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  /** Shipment mode — sea-only terms get a warning on air/road shipments. */
  mode?: string;
  disabled?: boolean;
  id?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const selected = isIncoterm(value) ? value : null;
  const seaMismatch = !!selected && SEA_ONLY_INCOTERMS.includes(selected) && !!mode && mode !== 'sea';

  return (
    <div>
      <Select value={selected ?? '__none'} onValueChange={(v) => onChange(v === '__none' ? null : v)} disabled={disabled}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{t('incoterms.none')}</SelectItem>
          {INCOTERMS.map((c) => (
            <SelectItem key={c} value={c}>
              <span className="font-mono font-semibold">{c}</span> — {t(`incoterms.${c}_name`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-600">{t(`incoterms.${selected}_desc`)}</p>
      )}
      {seaMismatch && (
        <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-amber-800">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
          {t('incoterms.sea_only_warning')}
        </p>
      )}
      <a href={blogPostUrl(INCOTERMS_GUIDE_SLUGS[lang], lang)} target="_blank" rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-luna-blue hover:underline">
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        {t('incoterms.guide_link')}
      </a>
    </div>
  );
}
