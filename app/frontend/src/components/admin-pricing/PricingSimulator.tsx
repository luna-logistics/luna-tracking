import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { computeQuote, formatEuros, type Mode, type ModeResult, type PricedResult, type PricingConfig } from '@/lib/pricing/engine';
import { calculatorEngineInput } from '@/lib/pricing/surfaces';

/**
 * /admin/tarifs simulator: one parcel priced by the SAME builder + engine as
 * the public /calculateur (calculatorEngineInput → computeQuote), with the
 * values being edited — before anything is published — next to the price the
 * site gives today.
 */
const MODES: Mode[] = ['express', 'cargo', 'sea'];
type Fields = { weight: string; length: string; width: string; height: string; volume: string };

const PRESETS: { key: string; labelKey: string; fields: Fields }[] = [
  { key: 'carton_std', labelKey: 'calc.preset_carton_std', fields: { weight: '6', length: '60', width: '40', height: '40', volume: '' } },
  { key: 'carton_small', labelKey: 'calc.preset_carton_small', fields: { weight: '4', length: '40', width: '30', height: '30', volume: '' } },
  { key: 'suitcase', labelKey: 'calc.preset_suitcase', fields: { weight: '23', length: '', width: '', height: '', volume: '' } },
  { key: 'move', labelKey: 'calc.preset_move', fields: { weight: '300', length: '', width: '', height: '', volume: '3' } },
];

const fmtKg = (n: number) => `${Number(n.toFixed(3))}`;

export function PricingSimulator({ draft, live, lang }: {
  /** The grid being edited, or null while it has validation errors. */
  draft: PricingConfig | null;
  /** The grid the site prices with right now. */
  live: PricingConfig;
  lang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const [f, setF] = useState<Fields>(PRESETS[0].fields);
  const [mode, setMode] = useState<Mode>('express');
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const input = useMemo(() => calculatorEngineInput({
    lines: [{ length: f.length, width: f.width, height: f.height, weight: f.weight }],
    volume: f.volume,
    destination: 'kinshasa',
  }), [f]);
  const edited = useMemo(() => (draft ? computeQuote(input, draft) : null), [draft, input]);
  const current = useMemo(() => computeQuote(input, live), [live, input]);

  const field = (k: keyof Fields, label: string) => (
    <div>
      <Label htmlFor={`sim-${k}`} className="text-luna-navy text-[13px]">{label}</Label>
      <Input id={`sim-${k}`} inputMode="decimal" value={f[k]} onChange={set(k)} className="mt-1.5 tabular-nums" />
    </div>
  );

  return (
    <div>
      <p className="text-xs text-slate-500">{t('admin_pricing.sim_hint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => setF(p.fields)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-luna-navy hover:border-luna-blue hover:bg-luna-blue/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-blue/40">
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {field('weight', t('admin_pricing.sim_weight'))}
        {field('length', t('admin_pricing.sim_length'))}
        {field('width', t('admin_pricing.sim_width'))}
        {field('height', t('admin_pricing.sim_height'))}
        {field('volume', t('admin_pricing.sim_volume'))}
      </div>

      <div role="tablist" aria-label={t('admin_pricing.sim_mode')} className="mt-5 grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={cn(
              'rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-blue/40',
              mode === m ? 'border-luna-navy bg-luna-navy text-white' : 'border-slate-200 bg-white text-luna-navy hover:border-luna-blue',
            )}>
            <span className="block text-xs font-medium opacity-80">{t(`calc.mode_${m}`)}</span>
            <span className="block text-sm font-semibold tabular-nums">{edited ? shortResult(edited[m], lang, t) : '—'}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4" role="tabpanel" aria-live="polite">
        {!edited ? (
          <p className="text-sm text-amber-700">{t('admin_pricing.sim_invalid')}</p>
        ) : (
          <ResultDetail edited={edited[mode]} current={current[mode]} lang={lang} />
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {t('admin_pricing.sim_customs_note', { fee: formatEuros((draft ?? live).customsAdminFeeCents ?? 0, lang) })}
      </p>
    </div>
  );
}

function shortResult(r: ModeResult, lang: 'fr' | 'en', t: (k: string) => string): string {
  if (r.kind === 'price') return formatEuros(r.totalCents, lang);
  if (r.kind === 'quote') return t('admin_pricing.sim_quote');
  return '—';
}

function ResultDetail({ edited, current, lang }: { edited: ModeResult; current: ModeResult; lang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  if (edited.kind === 'empty') {
    return <p className="text-sm text-slate-600">{t(edited.mode === 'sea' ? 'calc.empty_sea' : 'calc.empty_air')}</p>;
  }
  if (edited.kind === 'quote') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="font-semibold">{t('admin_pricing.sim_quote')}</span> — {t(`calc.quote_reason_${edited.reason}`)}
      </div>
    );
  }
  const row = 'flex items-baseline justify-between gap-3 text-sm';
  const detail = (l: PricedResult['lines'][number]): string | null => {
    if (l.key === 'weight' && l.rateCentsPerKg != null) {
      if (l.cents > edited.actualWeightKg * l.rateCentsPerKg + 0.5) return t('calc.line_weight_min');
      return `${fmtKg(l.qtyKg ?? 0)} kg × ${formatEuros(l.rateCentsPerKg, lang)}/kg`;
    }
    if (l.key === 'volumetric_diff' && l.rateCentsPerKg != null) return `${fmtKg(l.qtyKg ?? 0)} kg × ${formatEuros(l.rateCentsPerKg, lang)}/kg`;
    if (l.key === 'volume' && l.rateCentsPerM3 != null) return `${fmtKg(l.qtyM3 ?? 0)} m³ × ${formatEuros(l.rateCentsPerM3, lang)}/m³`;
    return null;
  };
  const delta = current.kind === 'price' ? edited.totalCents - current.totalCents : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold text-luna-navy tabular-nums">{formatEuros(edited.totalCents, lang)}</p>
        <p className="text-xs font-medium text-luna-blue">{t(`calc.basis_${edited.chargeableBasis}`)}</p>
      </div>
      <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {edited.mode !== 'sea' && (
          <li className={row}>
            <span className="text-slate-600">{t('calc.real_weight_label')}</span>
            <span className="tabular-nums text-slate-700">{fmtKg(edited.actualWeightKg)} kg</span>
          </li>
        )}
        {edited.volumetricWeightKg != null && (
          <li className={row}>
            <span className="text-slate-600">{t('calc.vol_weight')}</span>
            <span className="tabular-nums text-slate-700">{fmtKg(edited.volumetricWeightKg)} kg</span>
          </li>
        )}
        {edited.lines.map((l, i) => (
          <li key={i} className={row}>
            <span className="min-w-0">
              <span className="block text-luna-navy">{t(`calc.line_${l.key}`)}</span>
              {detail(l) && <span className="block text-xs text-slate-500 tabular-nums">{detail(l)}</span>}
            </span>
            <span className="tabular-nums font-medium text-luna-navy">{formatEuros(Math.round(l.cents), lang)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
        {t('admin_pricing.sim_live')}{' '}
        <span className="font-medium tabular-nums">{shortResult(current, lang, t)}</span>
        {delta != null && delta !== 0 && (
          <span className={cn('ml-2 font-semibold tabular-nums', delta > 0 ? 'text-red-700' : 'text-emerald-700')}>
            ({delta > 0 ? '+' : '−'}{formatEuros(Math.abs(delta), lang)})
          </span>
        )}
      </p>
    </div>
  );
}
