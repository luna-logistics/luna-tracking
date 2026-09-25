import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { emptyPackageLine, type PackageLine, type PackageLinesSize } from '@/lib/pricing/surfaces';
import { formatM3 } from '@/lib/pricing/volume';

const fmtNum = (n: number, digits: number) => `${Number(n.toFixed(digits))}`;

/**
 * Colisage: one line per package (L × l × H in cm + weight in kg), as many
 * lines as needed. The ONE package editor of /calculateur, /tarifs and the pro
 * Devis form — each surface turns the lines into engine input with the shared
 * rule (lib/pricing/surfaces.packageLinesSize): totals are summed over EVERY
 * line, never just the first, and a line missing its weight or dimensions is
 * never guessed (the warning below says what is missing).
 */
export function PackageLinesEditor({ lines, onChange, size, idPrefix, placeholders, inputStyle, minLines = 1 }: {
  lines: PackageLine[];
  onChange: (lines: PackageLine[]) => void;
  /** packageLinesSize(lines), computed by the parent (it also prices with it). */
  size: PackageLinesSize;
  /** Unique per page — ids for the legend / aria wiring. */
  idPrefix: string;
  /** Greyed examples; default = the column names. */
  placeholders?: Partial<PackageLine>;
  /** Extra inline style for the inputs, so the editor matches the host page. */
  inputStyle?: CSSProperties;
  /** Lines that can't be removed (the remove button disables at this count). */
  minLines?: number;
}) {
  const { t, i18n } = useTranslation();
  // Decimal comma in French (the fields accept both).
  const loc = (v: string) => (i18n.language.startsWith('fr') ? v.replace('.', ',') : v);
  const legendId = `${idPrefix}-pkg-legend`;
  const update = (i: number, patch: Partial<PackageLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ph: PackageLine = {
    length: placeholders?.length ?? t('pricing.dim_l'),
    width: placeholders?.width ?? t('pricing.dim_w'),
    height: placeholders?.height ?? t('pricing.dim_h'),
    weight: placeholders?.weight ?? 'kg',
  };
  const totals = [
    size.totalWeightKg != null ? `${loc(fmtNum(size.totalWeightKg, 3))} kg` : '—',
    size.totalVolumeM3 != null ? `${loc(formatM3(size.totalVolumeM3))} m³` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div role="group" aria-labelledby={legendId}>
      <p id={legendId} className="text-sm font-medium text-luna-navy">{t('pricing.pkg_legend')}</p>
      <p className="mt-0.5 text-xs text-slate-500">{t('pricing.pkg_hint')}</p>
      <div className="mt-2 hidden sm:grid grid-cols-[4.5rem_repeat(4,minmax(0,1fr))_2.5rem] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500" aria-hidden="true">
        <span />
        <span>{t('pricing.dim_l')}</span><span>{t('pricing.dim_w')}</span><span>{t('pricing.dim_h')}</span>
        <span>{t('pricing.pkg_weight')}</span><span />
      </div>
      <ol className="mt-1 space-y-2">
        {lines.map((l, i) => {
          const n = i + 1;
          const field = (k: keyof PackageLine, labelKey: string) => (
            <Input aria-label={`${t(labelKey)} — ${t('pricing.pkg_line', { n })}`} placeholder={ph[k]}
              type="text" inputMode="decimal" value={l[k]}
              onChange={(e) => update(i, { [k]: e.target.value })} className="text-center" style={inputStyle} />
          );
          return (
            <li key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_2.5rem] sm:grid-cols-[4.5rem_repeat(4,minmax(0,1fr))_2.5rem] items-center gap-2">
              <span className="col-span-5 sm:col-span-1 text-xs font-semibold text-luna-navy">{t('pricing.pkg_line', { n })}</span>
              {field('length', 'calc.dim_length')}
              {field('width', 'calc.dim_width')}
              {field('height', 'calc.dim_height')}
              {field('weight', 'pricing.pkg_weight')}
              <Button type="button" variant="ghost" size="sm" className="h-10 px-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                disabled={lines.length <= minLines}
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
                aria-label={t('pricing.pkg_remove', { n })} title={t('pricing.pkg_remove', { n })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyPackageLine()])}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t('pricing.pkg_add')}
        </Button>
        {size.used > 0 && (
          <p className="text-sm text-slate-700 tabular-nums" aria-live="polite">
            {t('pricing.pkg_totals', { count: size.used, weight: totals })}
          </p>
        )}
      </div>
      {size.used > 0 && (size.missingWeight || size.missingDims) && (
        <p className="mt-1 text-xs text-amber-800">
          {size.missingWeight ? t('pricing.pkg_missing_weight') : t('pricing.pkg_missing_dims')}
        </p>
      )}
    </div>
  );
}
