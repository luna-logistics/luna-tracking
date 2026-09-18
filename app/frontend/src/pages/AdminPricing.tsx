import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { errorMessage } from '@/lib/errors';
import {
  fetchActivePricingConfig, fetchAllPricingConfigs, savePricingConfig, type PricingConfigRow,
} from '@/lib/pricing/config';
import { validatePricingConfig } from '@/lib/pricing/validate';
import { computeQuote, formatEuros, type PricingConfig, type Mode, type ModeResult } from '@/lib/pricing/engine';

/**
 * Admin — pricing grid editor (/admin/tarifs). Edits the whole `pricing_config`
 * document (rates, fees, thresholds, carton flat prices, and the four optional
 * fields) without SQL. Saving publishes a NEW active row via save_pricing_config
 * (previous grid kept as history), after client validation, with a live preview
 * of two fixed shipments computed by the real engine on the pending values.
 * Money is edited in euros and stored in integer cents.
 */

const MODES: Mode[] = ['express', 'cargo', 'sea'];
const INCLUDE_KEYS = ['homeDeliveryKinshasa', 'collection', 'customsDuties', 'congoleseVatOnArrival', 'insurance', 'insuranceCeiling'] as const;

const eur = (cents: number | null | undefined) => (cents == null ? '' : String(cents / 100));
const toCents = (v: string) => (v === '' ? 0 : Math.round(Number(v) * 100));
const toNum = (v: string) => (v === '' ? 0 : Number(v));

export default function AdminPricing() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PricingConfig | null>(null);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [history, setHistory] = useState<PricingConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadHistory = async () => setHistory(await fetchAllPricingConfigs());

  useEffect(() => {
    (async () => {
      const c = await fetchActivePricingConfig();
      if (c) { setDraft(c); setEffectiveDate(c.effectiveFrom || ''); } else setLoadError(true);
      await loadHistory();
      setLoading(false);
    })();
  }, []);

  // Immutable draft edit.
  const edit = (fn: (d: PricingConfig) => void) => setDraft((d) => { if (!d) return d; const n = structuredClone(d); fn(n); return n; });

  const errors = useMemo(() => (draft ? validatePricingConfig(draft) : []), [draft]);
  const preview = useMemo(() => {
    if (!draft || errors.length) return null;
    try {
      return {
        carton: computeQuote({ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }, draft),
        sea: computeQuote({ volumeM3: 3 }, draft),
      };
    } catch { return null; }
  }, [draft, errors]);

  const onSave = async () => {
    if (!draft || errors.length) return;
    setSaving(true);
    try {
      await savePricingConfig(draft, effectiveDate || null);
      toast.success(t('admin_pricing.saved'));
      await loadHistory();
    } catch (err) {
      console.error('[admin-pricing] save failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  }
  if (loadError || !draft) {
    return (
      <div className="max-w-5xl">
        <SEO title={t('admin_pricing.title')} noindex />
        <h1 className="text-2xl font-bold text-luna-navy">{t('admin_pricing.title')}</h1>
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{t('admin_pricing.load_error')}</p>
      </div>
    );
  }

  const card = 'rounded-2xl border border-slate-200 bg-white p-5';
  const h2 = 'text-lg font-semibold text-luna-navy mb-4';
  const ratio = draft.ratioQuote ?? { thresholdKgPerM3: 0, appliesTo: [] };

  return (
    <div className="max-w-5xl pb-24">
      <SEO title={t('admin_pricing.title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin_pricing.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('admin_pricing.subtitle')}</p>

      <div className="mt-6 space-y-6">
        {/* Modes & rates */}
        <section className={card}>
          <h2 className={h2}>{t('admin_pricing.sec_modes')}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Express */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-luna-navy">{t('calc.mode_express')}</h3>
              <Field label={t('admin_pricing.f_per_kg')}><Input type="number" min="0" step="0.01" value={eur(draft.modes.express.perKgCents)} onChange={(e) => edit((d) => { d.modes.express.perKgCents = toCents(e.target.value); })} /></Field>
              <Field label={t('admin_pricing.f_flat_min')}><Input type="number" min="0" step="0.01" value={eur(draft.modes.express.flatMinCents)} onChange={(e) => edit((d) => { d.modes.express.flatMinCents = toCents(e.target.value); })} /></Field>
              <Field label={t('admin_pricing.f_max_kg')}><Input type="number" min="0" step="1" value={String(draft.modes.express.maxKg)} onChange={(e) => edit((d) => { d.modes.express.maxKg = toNum(e.target.value); })} /></Field>
            </div>
            {/* Cargo */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-luna-navy">{t('calc.mode_cargo')}</h3>
              <Field label={t('admin_pricing.f_per_kg')}><Input type="number" min="0" step="0.01" value={eur(draft.modes.cargo.perKgCents)} onChange={(e) => edit((d) => { d.modes.cargo.perKgCents = toCents(e.target.value); })} /></Field>
              <Field label={t('admin_pricing.f_max_kg')}><Input type="number" min="0" step="1" value={String(draft.modes.cargo.maxKg)} onChange={(e) => edit((d) => { d.modes.cargo.maxKg = toNum(e.target.value); })} /></Field>
            </div>
            {/* Sea */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-luna-navy">{t('calc.mode_sea')}</h3>
              {draft.modes.sea.tiers.map((tier, i) => (
                <div key={i} className="rounded-xl bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">{t('admin_pricing.tier_n', { n: i + 1 })}</span>
                    <button type="button" aria-label={t('admin_pricing.remove_tier')} className="text-slate-400 hover:text-red-600" onClick={() => edit((d) => { d.modes.sea.tiers.splice(i, 1); })}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <Field label={t('admin_pricing.f_upto_m3')}><Input type="number" min="0" step="0.01" value={String(tier.uptoM3)} onChange={(e) => edit((d) => { d.modes.sea.tiers[i].uptoM3 = toNum(e.target.value); })} /></Field>
                  <Field label={t('admin_pricing.f_per_m3')}><Input type="number" min="0" step="0.01" value={eur(tier.perM3Cents)} onChange={(e) => edit((d) => { d.modes.sea.tiers[i].perM3Cents = toCents(e.target.value); })} /></Field>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => edit((d) => { const last = d.modes.sea.tiers[d.modes.sea.tiers.length - 1]; d.modes.sea.tiers.push({ uptoM3: last ? last.uptoM3 : 0, perM3Cents: last ? last.perM3Cents : 0 }); })}><Plus className="h-4 w-4" /> {t('admin_pricing.add_tier')}</Button>
              <Field label={t('admin_pricing.f_max_m3')}><Input type="number" min="0" step="0.01" value={String(draft.modes.sea.maxM3)} onChange={(e) => edit((d) => { d.modes.sea.maxM3 = toNum(e.target.value); })} /></Field>
            </div>
          </div>
        </section>

        {/* Fees & volumetric */}
        <section className={card}>
          <h2 className={h2}>{t('admin_pricing.sec_fees')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('admin_pricing.f_handling')}><Input type="number" min="0" step="0.01" value={eur(draft.handlingFeeCents)} onChange={(e) => edit((d) => { d.handlingFeeCents = toCents(e.target.value); })} /></Field>
            <Field label={t('admin_pricing.f_customs')}><Input type="number" min="0" step="0.01" value={eur(draft.customsAdminFeeCents)} onChange={(e) => edit((d) => { d.customsAdminFeeCents = toCents(e.target.value); })} /></Field>
            <Field label={t('admin_pricing.f_divisor')}><Input type="number" min="1" step="1" value={String(draft.volumetricDivisor)} onChange={(e) => edit((d) => { d.volumetricDivisor = toNum(e.target.value); })} /></Field>
            <Field label={t('admin_pricing.f_surcharge')}><Input type="number" min="0" step="0.01" value={eur(draft.volumetricSurchargeRateCentsPerKg)} onChange={(e) => edit((d) => { d.volumetricSurchargeRateCentsPerKg = toCents(e.target.value); })} /></Field>
          </div>
        </section>

        {/* Quote thresholds */}
        <section className={card}>
          <h2 className={h2}>{t('admin_pricing.sec_thresholds')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('admin_pricing.thresholds_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('admin_pricing.f_ratio_threshold')}><Input type="number" min="0" step="1" value={String(ratio.thresholdKgPerM3)} onChange={(e) => edit((d) => { d.ratioQuote = { thresholdKgPerM3: toNum(e.target.value), appliesTo: d.ratioQuote?.appliesTo ?? [] }; })} /></Field>
            <div>
              <Label className="text-luna-navy">{t('admin_pricing.ratio_applies')}</Label>
              <div className="mt-2 flex flex-wrap gap-4">
                {MODES.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <Switch checked={ratio.appliesTo.includes(m)} onCheckedChange={(on) => edit((d) => {
                      const base = d.ratioQuote ?? { thresholdKgPerM3: 0, appliesTo: [] };
                      const set = new Set(base.appliesTo);
                      if (on) set.add(m); else set.delete(m);
                      d.ratioQuote = { thresholdKgPerM3: base.thresholdKgPerM3, appliesTo: [...set] as Mode[] };
                    })} />
                    {t(`calc.mode_${m}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Carton presets */}
        <section className={card}>
          <h2 className={h2}>{t('admin_pricing.sec_cartons')}</h2>
          <p className="text-xs text-slate-500 mb-3">{t('admin_pricing.cartons_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(draft.presets ?? []).map((p, i) => (
              p.seaFlatTransportCents != null || (p.lengthCm != null && p.key.startsWith('carton')) ? (
                <Field key={p.key} label={`${cartonLabel(p, t)} — ${t('admin_pricing.f_carton_transport')}`}>
                  <Input type="number" min="0" step="0.01" value={eur(p.seaFlatTransportCents)} onChange={(e) => edit((d) => { d.presets![i].seaFlatTransportCents = toCents(e.target.value); })} />
                </Field>
              ) : null
            ))}
          </div>
        </section>

        {/* Optional / currently-empty fields */}
        <section className={card}>
          <h2 className={h2}>{t('admin_pricing.sec_optional')}</h2>
          <p className="text-xs text-slate-500 mb-4">{t('admin_pricing.optional_hint')}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            {MODES.map((m) => (
              <Field key={m} label={t('admin_pricing.f_transit', { mode: t(`calc.mode_${m}`) })}>
                <Input value={draft.transitTimes?.[m] ?? ''} placeholder={t('admin_pricing.transit_ph')} onChange={(e) => edit((d) => { d.transitTimes = { ...(d.transitTimes ?? { express: null, cargo: null, sea: null }), [m]: e.target.value || null }; })} />
              </Field>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('admin_pricing.f_vat')}><Input value={draft.vatStatus ?? ''} placeholder={t('admin_pricing.vat_ph')} onChange={(e) => edit((d) => { d.vatStatus = e.target.value || null; })} /></Field>
            <Field label={t('admin_pricing.f_effective_date')}><Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-luna-navy">{t('admin_pricing.includes_title')}</h3>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {INCLUDE_KEYS.map((k) => (
              <Field key={k} label={t(`admin_pricing.inc_${k}`)}>
                <Input value={draft.includes?.[k] ?? ''} placeholder={t('admin_pricing.include_ph')} onChange={(e) => edit((d) => { d.includes = { ...(d.includes ?? {}), [k]: e.target.value || null }; })} />
              </Field>
            ))}
          </div>
        </section>

        {/* Preview */}
        <section className={`${card} bg-slate-50`}>
          <h2 className={h2}>{t('admin_pricing.sec_preview')}</h2>
          {errors.length > 0 ? (
            <p className="text-sm text-amber-700">{t('admin_pricing.preview_invalid')}</p>
          ) : preview ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <PreviewCard title={t('admin_pricing.preview_carton')} q={preview.carton} modes={MODES} />
              <PreviewCard title={t('admin_pricing.preview_sea')} q={preview.sea} modes={['sea']} />
            </div>
          ) : null}
        </section>

        {/* Validation errors */}
        {errors.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="text-lg font-semibold text-red-800 mb-2">{t('admin_pricing.sec_errors')}</h2>
            <ul className="list-disc pl-5 text-sm text-red-800 space-y-1">
              {errors.map((e, i) => <li key={i}>{t(`admin_pricing.err_${e.code}`, e.params)}</li>)}
            </ul>
          </section>
        )}

        {/* History */}
        <section className={card}>
          <h2 className={h2}>{t('admin_pricing.sec_history')}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">{t('admin_pricing.history_none')}</p>
          ) : (
            <ul className="text-sm text-slate-600 space-y-1">
              {history.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  {r.is_active && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{t('admin_pricing.history_active')}</span>}
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  {r.effective_from && <span className="text-slate-400">· {t('admin_pricing.history_effective', { date: r.effective_from })}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
        {errors.length > 0 && <span className="text-sm text-red-700">{t('admin_pricing.fix_errors')}</span>}
        <Button variant="navy" disabled={saving || errors.length > 0} onClick={onSave}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('admin_pricing.saving')}</> : <><Save className="h-4 w-4" /> {t('admin_pricing.save')}</>}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy text-[13px]">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function cartonLabel(p: { key: string; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null }, t: (k: string) => string): string {
  const key = `calc.preset_${p.key}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return `${p.lengthCm} × ${p.widthCm} × ${p.heightCm}`;
}

function PreviewCard({ title, q, modes }: { title: string; q: ReturnType<typeof computeQuote>; modes: Mode[] }) {
  const { t } = useTranslation();
  const line = (r: ModeResult) => {
    if (r.kind === 'price') return formatEuros(r.totalCents);
    if (r.kind === 'quote') return t('calc.live_quote');
    return '—';
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-luna-navy">{title}</p>
      <dl className="mt-2 space-y-1 text-sm">
        {modes.map((m) => (
          <div key={m} className="flex justify-between">
            <dt className="text-slate-500">{t(`calc.mode_${m}`)}</dt>
            <dd className="font-semibold text-luna-navy">{line(q[m])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
