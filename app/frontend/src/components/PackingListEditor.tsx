import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PACKAGE_TYPES, computePackageTotals, emptyPackingLine, lineVolumeM3,
  type PackageType, type PackingLine,
} from '@/lib/shipments';

const fmt = (n: number, digits: number) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

/**
 * Colisage editor for the shipment form. One line = `quantity` identical
 * packages of one type; volume per line is L×l×H (cm) → m³ × quantity. The
 * running totals shown here are the same maths the DB trigger stores on the
 * shipment (weight × qty, volume × qty), so what the user sees is what saves.
 */
export function PackingListEditor({
  lines, onChange, disabled,
}: {
  lines: PackingLine[];
  onChange: (lines: PackingLine[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const totals = computePackageTotals(lines);
  const update = (i: number, patch: Partial<PackingLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const num = (v: string): number | null => (v === '' ? null : Math.max(0, Number(v)));

  const cols = 'sm:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))_0.7fr_1fr_auto]';
  const lbl = 'text-[11px] font-medium text-slate-500 sm:sr-only';

  return (
    <div className="space-y-2">
      <div className={`hidden sm:grid ${cols} gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-luna-navy`} aria-hidden="true">
        <span>{t('business_shipment_form.pkg_type')}</span>
        <span>{t('business_shipment_form.pkg_length')}</span>
        <span>{t('business_shipment_form.pkg_width')}</span>
        <span>{t('business_shipment_form.pkg_height')}</span>
        <span>{t('business_shipment_form.pkg_weight')}</span>
        <span>{t('business_shipment_form.pkg_qty')}</span>
        <span>{t('business_shipment_form.pkg_volume')}</span>
        <span />
      </div>

      {lines.length === 0 && <p className="text-sm text-slate-500">{t('business_shipment_form.pkg_empty')}</p>}

      <ol className="space-y-2">
        {lines.map((l, i) => {
          const vol = lineVolumeM3(l);
          const n = i + 1;
          const id = (k: string) => `pkg-${i}-${k}`;
          return (
            <li key={l.id ?? `new-${i}`}
              className={`grid grid-cols-2 ${cols} gap-2 items-end rounded-xl border border-slate-200 bg-slate-50/60 p-2 sm:border-0 sm:bg-transparent sm:p-0`}>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor={id('type')} className={lbl}>{t('business_shipment_form.pkg_type')} #{n}</label>
                <Select value={l.package_type} onValueChange={(v) => update(i, { package_type: v as PackageType })} disabled={disabled}>
                  <SelectTrigger id={id('type')} aria-label={`${t('business_shipment_form.pkg_type')} #${n}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map((pt) => <SelectItem key={pt} value={pt}>{t(`business_shipment_form.pkg_type_${pt}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(['length_cm', 'width_cm', 'height_cm'] as const).map((k) => {
                const key = k === 'length_cm' ? 'pkg_length' : k === 'width_cm' ? 'pkg_width' : 'pkg_height';
                return (
                  <div key={k}>
                    <label htmlFor={id(k)} className={lbl}>{t(`business_shipment_form.${key}`)}</label>
                    <Input id={id(k)} type="number" inputMode="decimal" step="0.1" min="0" value={l[k] ?? ''}
                      aria-label={`${t(`business_shipment_form.${key}`)} #${n}`}
                      onChange={(e) => update(i, { [k]: num(e.target.value) } as Partial<PackingLine>)} disabled={disabled} />
                  </div>
                );
              })}
              <div>
                <label htmlFor={id('w')} className={lbl}>{t('business_shipment_form.pkg_weight')}</label>
                <Input id={id('w')} type="number" inputMode="decimal" step="0.001" min="0" value={l.weight_kg ?? ''}
                  aria-label={`${t('business_shipment_form.pkg_weight')} #${n}`}
                  onChange={(e) => update(i, { weight_kg: num(e.target.value) })} disabled={disabled} />
              </div>
              <div>
                <label htmlFor={id('q')} className={lbl}>{t('business_shipment_form.pkg_qty')}</label>
                <Input id={id('q')} type="number" inputMode="numeric" step="1" min="1" value={l.quantity}
                  aria-label={`${t('business_shipment_form.pkg_qty')} #${n}`}
                  onChange={(e) => update(i, { quantity: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })} disabled={disabled} />
              </div>
              <div>
                <span className={lbl}>{t('business_shipment_form.pkg_volume')}</span>
                <p className="h-10 flex items-center text-sm tabular-nums text-slate-700" aria-label={`${t('business_shipment_form.pkg_volume')} #${n}`}>
                  {vol == null ? '—' : fmt(vol, 4)}
                </p>
              </div>
              <div className="flex justify-end">
                {!disabled && (
                  <Button type="button" variant="ghost" size="sm" className="h-10 text-red-600 hover:bg-red-50"
                    onClick={() => onChange(lines.filter((_, j) => j !== i))}
                    aria-label={`${t('business_shipment_form.pkg_remove')} #${n}`} title={t('business_shipment_form.pkg_remove')}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyPackingLine()])}>
          <Plus className="h-4 w-4" />{t('business_shipment_form.pkg_add')}
        </Button>
      )}

      <dl className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm" aria-live="polite">
        <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('business_shipment_form.totals_pieces')}</dt>
          <dd className="font-semibold text-luna-navy tabular-nums">{totals.count}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('business_shipment_form.totals_weight')}</dt>
          <dd className="font-semibold text-luna-navy tabular-nums">{fmt(totals.weight_kg, 3)} kg</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-slate-500">{t('business_shipment_form.totals_volume')}</dt>
          <dd className="font-semibold text-luna-navy tabular-nums">{fmt(totals.volume_m3, 4)} m³</dd></div>
      </dl>
      {totals.volume_partial && <p className="text-[11px] text-amber-800">{t('business_shipment_form.totals_volume_partial')}</p>}
    </div>
  );
}
