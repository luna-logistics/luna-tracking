import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Plus, Trash2, Loader2, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  fetchPricingAdminState, fetchPricingHistory, publishPricingSettings,
  type PricingAdminState, type PricingHistoryRow,
} from '@/lib/pricing/config';
import { hasFallbackCorridor, hasFallbackTariff, isTariffPath, withFallbackCorridor, withFallbackTariff } from '@/lib/pricing/fallback';
import { validatePricingConfig, zeroRateFields, type ConfigError } from '@/lib/pricing/validate';
import { diffPricingConfigs } from '@/lib/pricing/diff';
import type { Mode, PricingConfig } from '@/lib/pricing/engine';
import { PricingSimulator } from '@/components/admin-pricing/PricingSimulator';
import { PricingHistory } from '@/components/admin-pricing/PricingHistory';
import { PublishDialog } from '@/components/admin-pricing/PublishDialog';
import { describePricingPath, presetName } from '@/components/admin-pricing/labels';

/**
 * Admin — « Réglages tarifs » (/admin/tarifs). Edits the pricing_config document
 * (rates, fees, thresholds, carton flat prices, optional texts) without a
 * deploy. Strict validation, a simulator running the public calculator's
 * engine on the values being edited, a confirmation listing every change
 * (old → new, explicit OK for any rate at 0 €), "restore the default values"
 * (the fallback grid of lib/pricing/fallback.ts) and the change history.
 * Publishing goes through save_pricing_settings(): the database re-checks the
 * admin's permission and the grid, keeps the previous version and logs the
 * change. Money is edited in euros and stored in integer cents.
 */

const MODES: Mode[] = ['express', 'cargo', 'sea'];
const INCLUDE_KEYS = ['homeDeliveryKinshasa', 'collection', 'customsDuties', 'congoleseVatOnArrival', 'insurance', 'insuranceCeiling'] as const;

export default function AdminPricing() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const [state, setState] = useState<PricingAdminState | null>(null);
  const [draft, setDraft] = useState<PricingConfig | null>(null);
  // Which corridor the form is editing: the root destination slug (Kinshasa) or
  // an extra corridor's slug (Lubumbashi). The root is the top-level grid; a
  // corridor is config.corridors[slug]. Editing one never touches the others.
  const [editing, setEditing] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [history, setHistory] = useState<PricingHistoryRow[] | null>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, h] = await Promise.all([fetchPricingAdminState(), fetchPricingHistory()]);
    setState(s);
    // The form starts from the grid the site prices with right now: the active
    // row when it is valid, the fallback grid otherwise (banner below says so).
    setDraft(structuredClone(s.live.config));
    setEditing((cur) => cur || s.live.config.corridor.destination);
    setEffectiveDate(s.live.source === 'database' ? (s.effectiveFrom ?? '') : '');
    setHistory(h);
  }, []);

  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  // Immutable draft edit.
  const edit = (fn: (d: PricingConfig) => void) => setDraft((d) => { if (!d) return d; const n = structuredClone(d); fn(n); return n; });

  const candidate = useMemo(() => (draft ? { ...draft, effectiveFrom: effectiveDate || null } : null), [draft, effectiveDate]);
  const errors = useMemo(() => (candidate ? validatePricingConfig(candidate) : []), [candidate]);
  const invalid = useMemo(() => new Set(errors.map((e) => e.field)), [errors]);
  const changes = useMemo(() => (candidate && state ? diffPricingConfigs(state.stored, candidate) : []), [candidate, state]);
  const zeroPaths = useMemo(() => {
    if (!candidate || errors.length) return [];
    const changed = new Set(changes.map((c) => c.path));
    return zeroRateFields(candidate).filter((p) => changed.has(p));
  }, [candidate, errors, changes]);
  // "Restore defaults" = the tariff changes AND lands exactly on the fallback grid.
  const restoring = useMemo(
    () => !!candidate && !errors.length && changes.some((c) => isTariffPath(c.path)) && hasFallbackTariff(candidate),
    [candidate, errors, changes]);

  const canPublish = !!state?.reachable && !!candidate && errors.length === 0 && changes.length > 0 && !saving;

  const onPublish = async () => {
    if (!canPublish || !draft || !state) return;
    setSaving(true);
    try {
      await publishPricingSettings({
        config: draft,
        effectiveFrom: effectiveDate || null,
        action: restoring ? 'restore_defaults' : 'update',
        expectedActiveId: state.activeId,
      });
      toast.success(t('admin_pricing.saved'));
      setConfirmOpen(false);
      await load();
    } catch (err) {
      const msg = errorMessage(err, '');
      console.error('[admin-pricing] publish failed', err);
      if (msg.includes('pricing_config_stale')) toast.error(t('admin_pricing.err_stale'));
      else if (msg.includes('not authorized') || msg.includes('permission denied')) toast.error(t('admin_pricing.err_not_authorized'));
      else if (msg.includes('no_changes')) toast.info(t('admin_pricing.no_changes'));
      else toast.error(t('admin_pricing.err_publish', { message: msg || t('common.error_generic') }));
    } finally {
      setSaving(false);
    }
  };

  const onRestore = () => {
    if (!draft) return;
    const isRootCorridor = editing === draft.corridor.destination;
    const already = isRootCorridor ? hasFallbackTariff(draft) : hasFallbackCorridor(draft, editing);
    if (already) { toast.info(t('admin_pricing.restore_same')); return; }
    if (!confirm(t('admin_pricing.restore_confirm'))) return;
    setDraft(isRootCorridor ? withFallbackTariff(draft) : withFallbackCorridor(draft, editing));
    toast.success(t('admin_pricing.restore_done'));
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label={t('common.loading')} /></div>;
  }
  if (!state || !draft) return null;

  const card = 'rounded-2xl border border-slate-200 bg-white p-5';
  const h2 = 'text-lg font-semibold text-luna-navy';
  const hint = 'mt-1 mb-4 text-xs text-slate-500';
  // The corridor the form edits: the root destination (Kinshasa) or an extra
  // corridor (Lubumbashi). `grid` is the slice being edited, `gridOf` the same
  // slice inside a draft mutation, `gp` the path prefix for validation + ids.
  const rootDest = draft.corridor.destination;
  const editKeys = [rootDest, ...Object.keys(draft.corridors ?? {})];
  const curSlug = editKeys.includes(editing) ? editing : rootDest;
  const isRoot = curSlug === rootDest;
  type Grid = Omit<PricingConfig, 'corridor' | 'corridors'>;
  const grid = (isRoot ? draft : draft.corridors?.[curSlug]) as Grid;
  const gridOf = (d: PricingConfig): Grid => (isRoot ? d : d.corridors![curSlug]);
  const gp = isRoot ? '' : `corridors.${curSlug}.`;
  const cityLabel = (slug: string) => t(`admin_pricing.corridor_${slug}`, { defaultValue: slug.charAt(0).toUpperCase() + slug.slice(1) });
  const ratio = grid.ratioQuote ?? { thresholdKgPerM3: NaN, appliesTo: [] as Mode[] };
  const fieldProps = (path: string) => ({ id: `pc-${(gp + path).replace(/\./g, '-')}`, invalid: invalid.has(gp + path) });
  const banner = !state.reachable ? 'source_unreachable' : state.live.source === 'fallback' ? `source_fallback_${state.live.reason}` : null;

  return (
    <div className="max-w-5xl pb-28">
      <SEO title={t('admin_pricing.title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin_pricing.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('admin_pricing.subtitle')}</p>

      {banner && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(`admin_pricing.${banner}`)}</span>
        </p>
      )}
      <p className="mt-4 flex items-start gap-2 rounded-2xl border border-luna-blue/20 bg-luna-blue/5 p-4 text-sm text-luna-navy">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-luna-blue" aria-hidden="true" />
        <span>{t('admin_pricing.documents_note')}</span>
      </p>

      {editKeys.length > 1 && (
        <div className="mt-6" role="tablist" aria-label={t('admin_pricing.corridor_tabs_label')}>
          <span className="mb-2 block text-[13px] font-medium text-slate-600">{t('admin_pricing.corridor_tabs_label')}</span>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {editKeys.map((slug) => (
              <button key={slug} type="button" role="tab" aria-selected={slug === curSlug}
                onClick={() => setEditing(slug)}
                className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition',
                  slug === curSlug ? 'bg-white text-luna-navy shadow-sm' : 'text-slate-500 hover:text-luna-navy')}>
                {cityLabel(slug)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('admin_pricing.corridor_tabs_hint', { city: cityLabel(curSlug) })}</p>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Air */}
        <section className={card} aria-labelledby="pc-sec-air">
          <h2 id="pc-sec-air" className={h2}>{t('admin_pricing.sec_air')}</h2>
          <p className={hint}>{t('admin_pricing.air_hint')}</p>
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-luna-navy">{t('calc.mode_express')}</legend>
              <NumField {...fieldProps('modes.express.perKgCents')} label={t('admin_pricing.f_per_kg')} unit="€/kg" cents
                value={grid.modes.express.perKgCents} onChange={(v) => edit((d) => { gridOf(d).modes.express.perKgCents = v; })} />
              <NumField {...fieldProps('modes.express.flatMinCents')} label={t('admin_pricing.f_flat_min')} unit="€" cents
                hint={t('admin_pricing.flat_min_hint')}
                value={grid.modes.express.flatMinCents} onChange={(v) => edit((d) => { gridOf(d).modes.express.flatMinCents = v; })} />
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-luna-navy">{t('calc.mode_cargo')}</legend>
              <NumField {...fieldProps('modes.cargo.perKgCents')} label={t('admin_pricing.f_per_kg')} unit="€/kg" cents
                value={grid.modes.cargo.perKgCents} onChange={(v) => edit((d) => { gridOf(d).modes.cargo.perKgCents = v; })} />
            </fieldset>
          </div>
        </section>

        {/* Volume */}
        <section className={card} aria-labelledby="pc-sec-volume">
          <h2 id="pc-sec-volume" className={h2}>{t('admin_pricing.sec_volume')}</h2>
          <p className={hint}>{t('admin_pricing.volume_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField {...fieldProps('volumetricSurchargeRateCentsPerKg')} label={t('admin_pricing.f_surcharge')} unit="€/kg" cents
              value={grid.volumetricSurchargeRateCentsPerKg} onChange={(v) => edit((d) => { gridOf(d).volumetricSurchargeRateCentsPerKg = v; })} />
            <NumField {...fieldProps('volumetricDivisor')} label={t('admin_pricing.f_divisor')} unit="cm³/kg"
              hint={t('admin_pricing.divisor_hint')}
              value={grid.volumetricDivisor} onChange={(v) => edit((d) => { gridOf(d).volumetricDivisor = v; })} />
          </div>
        </section>

        {/* Sea */}
        <section className={card} aria-labelledby="pc-sec-sea">
          <h2 id="pc-sec-sea" className={h2}>{t('admin_pricing.sec_sea')}</h2>
          <p className={hint}>{t('admin_pricing.sea_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grid.modes.sea.tiers.map((tier, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{t('admin_pricing.tier_n', { n: i + 1 })}</span>
                  <button type="button" aria-label={t('admin_pricing.remove_tier_n', { n: i + 1 })} disabled={grid.modes.sea.tiers.length <= 1}
                    className="rounded text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-blue/40"
                    onClick={() => edit((d) => { gridOf(d).modes.sea.tiers.splice(i, 1); })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <NumField {...fieldProps(`modes.sea.tiers.${i}.uptoM3`)} label={t('admin_pricing.f_upto_m3')} unit="m³"
                  value={tier.uptoM3} onChange={(v) => edit((d) => { gridOf(d).modes.sea.tiers[i].uptoM3 = v; })} />
                <NumField {...fieldProps(`modes.sea.tiers.${i}.perM3Cents`)} label={t('admin_pricing.f_per_m3')} unit="€/m³" cents
                  value={tier.perM3Cents} onChange={(v) => edit((d) => { gridOf(d).modes.sea.tiers[i].perM3Cents = v; })} />
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3"
            onClick={() => edit((d) => { const last = gridOf(d).modes.sea.tiers[gridOf(d).modes.sea.tiers.length - 1]; gridOf(d).modes.sea.tiers.push({ uptoM3: NaN, perM3Cents: last ? last.perM3Cents : NaN }); })}>
            <Plus className="h-4 w-4" /> {t('admin_pricing.add_tier')}
          </Button>

          <h3 className="mt-6 text-sm font-semibold text-luna-navy">{t('admin_pricing.sec_cartons')}</h3>
          <p className="mt-1 mb-3 text-xs text-slate-500">{t('admin_pricing.cartons_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(grid.presets ?? []).map((p, i) => (
              p.seaFlatTransportCents != null || (p.lengthCm != null && p.key.startsWith('carton')) ? (
                <NumField key={p.key} {...fieldProps(`presets.${p.key}.seaFlatTransportCents`)}
                  label={t('admin_pricing.f_carton_transport', { name: presetName(p.key, t) })} unit="€" cents
                  value={p.seaFlatTransportCents} onChange={(v) => edit((d) => { gridOf(d).presets![i].seaFlatTransportCents = v; })} />
              ) : null
            ))}
          </div>

          {!isRoot && (
            <div className="mt-6 max-w-sm">
              <NumField {...fieldProps('seaWeightSurchargeCentsPerKg')} label={t('admin_pricing.f_sea_surcharge')} unit="€/kg" cents
                hint={t('admin_pricing.sea_surcharge_hint')}
                value={grid.seaWeightSurchargeCentsPerKg ?? 0}
                onChange={(v) => edit((d) => { gridOf(d).seaWeightSurchargeCentsPerKg = v; })} />
            </div>
          )}
        </section>

        {/* Fees */}
        <section className={card} aria-labelledby="pc-sec-fees">
          <h2 id="pc-sec-fees" className={cn(h2, 'mb-4')}>{t('admin_pricing.sec_fees')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumField {...fieldProps('handlingFeeCents')} label={t('admin_pricing.f_handling')} unit="€" cents
              hint={t('admin_pricing.handling_hint')}
              value={grid.handlingFeeCents} onChange={(v) => edit((d) => { gridOf(d).handlingFeeCents = v; })} />
            <NumField {...fieldProps('customsAdminFeeCents')} label={t('admin_pricing.f_customs')} unit="€" cents
              hint={t('admin_pricing.customs_hint')}
              value={grid.customsAdminFeeCents} onChange={(v) => edit((d) => { gridOf(d).customsAdminFeeCents = v; })} />
          </div>
        </section>

        {/* Quote thresholds */}
        <section className={card} aria-labelledby="pc-sec-thresholds">
          <h2 id="pc-sec-thresholds" className={h2}>{t('admin_pricing.sec_thresholds')}</h2>
          <p className={hint}>{t('admin_pricing.thresholds_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <NumField {...fieldProps('ratioQuote.thresholdKgPerM3')} label={t('admin_pricing.f_ratio_threshold')} unit="kg/m³"
                value={ratio.thresholdKgPerM3}
                onChange={(v) => edit((d) => { gridOf(d).ratioQuote = { thresholdKgPerM3: v, appliesTo: gridOf(d).ratioQuote?.appliesTo ?? [] }; })} />
              <div>
                <p className="text-[13px] font-medium text-luna-navy">{t('admin_pricing.ratio_applies')}</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {MODES.map((m) => (
                    <label key={m} className="flex items-center gap-2 text-sm">
                      <Switch checked={ratio.appliesTo.includes(m)} onCheckedChange={(on) => edit((d) => {
                        const base = gridOf(d).ratioQuote ?? { thresholdKgPerM3: NaN, appliesTo: [] };
                        const set = new Set(base.appliesTo);
                        if (on) set.add(m); else set.delete(m);
                        gridOf(d).ratioQuote = { thresholdKgPerM3: base.thresholdKgPerM3, appliesTo: MODES.filter((x) => set.has(x)) };
                      })} />
                      {t(`calc.mode_${m}`)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <NumField {...fieldProps('modes.sea.maxM3')} label={t('admin_pricing.f_max_m3')} unit="m³"
                hint={t('admin_pricing.max_m3_hint')}
                value={grid.modes.sea.maxM3} onChange={(v) => edit((d) => { gridOf(d).modes.sea.maxM3 = v; })} />
              <NumField {...fieldProps('modes.cargo.maxKg')} label={t('admin_pricing.f_max_kg', { mode: t('calc.mode_cargo') })} unit="kg"
                value={grid.modes.cargo.maxKg} onChange={(v) => edit((d) => { gridOf(d).modes.cargo.maxKg = v; })} />
              <NumField {...fieldProps('modes.express.maxKg')} label={t('admin_pricing.f_max_kg', { mode: t('calc.mode_express') })} unit="kg"
                value={grid.modes.express.maxKg} onChange={(v) => edit((d) => { gridOf(d).modes.express.maxKg = v; })} />
            </div>
          </div>
        </section>

        {/* Optional / currently-empty fields — root corridor only (these texts
            and the publish date apply to the whole document). */}
        {isRoot && (
        <section className={card} aria-labelledby="pc-sec-optional">
          <h2 id="pc-sec-optional" className={h2}>{t('admin_pricing.sec_optional')}</h2>
          <p className={hint}>{t('admin_pricing.optional_hint')}</p>

          <div className="grid gap-4 sm:grid-cols-3">
            {MODES.map((m) => (
              <TextField key={m} id={`pc-transit-${m}`} label={t('admin_pricing.f_transit', { mode: t(`calc.mode_${m}`) })}
                value={draft.transitTimes?.[m] ?? ''} placeholder={t('admin_pricing.transit_ph')}
                onChange={(v) => edit((d) => { d.transitTimes = { ...(d.transitTimes ?? { express: null, cargo: null, sea: null }), [m]: v || null }; })} />
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField id="pc-vat" label={t('admin_pricing.f_vat')} value={draft.vatStatus ?? ''} placeholder={t('admin_pricing.vat_ph')}
              onChange={(v) => edit((d) => { d.vatStatus = v || null; })} />
            <div>
              <Label htmlFor="pc-effective" className="text-luna-navy text-[13px]">{t('admin_pricing.f_effective_date')}</Label>
              <Input id="pc-effective" type="date" className={cn('mt-1.5', invalid.has('effectiveFrom') && 'border-red-500')}
                value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>

          <h3 className="mt-5 text-sm font-semibold text-luna-navy">{t('admin_pricing.includes_title')}</h3>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {INCLUDE_KEYS.map((k) => (
              <TextField key={k} id={`pc-inc-${k}`} label={t(`admin_pricing.inc_${k}`)} value={draft.includes?.[k] ?? ''}
                placeholder={t('admin_pricing.include_ph')}
                onChange={(v) => edit((d) => { d.includes = { ...(d.includes ?? {}), [k]: v || null }; })} />
            ))}
          </div>
        </section>
        )}

        {/* Validation errors */}
        {errors.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5" aria-labelledby="pc-sec-errors">
            <h2 id="pc-sec-errors" className="mb-2 text-lg font-semibold text-red-800">{t('admin_pricing.sec_errors')}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">
              {errors.map((e, i) => <li key={i}>{errorText(e, t)}</li>)}
            </ul>
          </section>
        )}

        {/* Simulator */}
        <section className={cn(card, 'bg-slate-50')} aria-labelledby="pc-sec-sim">
          <h2 id="pc-sec-sim" className={h2}>{t('admin_pricing.sec_simulator')}</h2>
          <PricingSimulator draft={errors.length ? null : candidate} live={state.live.config} lang={lang} destination={curSlug} />
        </section>

        {/* History */}
        <section className={card} aria-labelledby="pc-sec-history">
          <h2 id="pc-sec-history" className={cn(h2, 'mb-4')}>{t('admin_pricing.sec_history')}</h2>
          <PricingHistory rows={history} lang={lang} />
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
        <Button type="button" variant="outline" onClick={onRestore} disabled={saving}>
          <RotateCcw className="h-4 w-4" /> {t('admin_pricing.restore')}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn('text-sm', errors.length ? 'text-red-700' : 'text-slate-600')} aria-live="polite">
            {errors.length
              ? t('admin_pricing.fix_errors')
              : changes.length
                ? t('admin_pricing.pending_changes', { count: changes.length })
                : t('admin_pricing.no_changes')}
          </span>
          <Button type="button" variant="navy" disabled={!canPublish} onClick={() => setConfirmOpen(true)}>
            <Save className="h-4 w-4" /> {t('admin_pricing.save')}
          </Button>
        </div>
      </div>

      <PublishDialog open={confirmOpen} onOpenChange={setConfirmOpen} changes={changes} zeroPaths={zeroPaths}
        restoring={restoring} saving={saving} onConfirm={onPublish} lang={lang} />
    </div>
  );
}

function errorText(e: ConfigError, t: (k: string, o?: Record<string, unknown>) => string): string {
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (e.field) params.field = describePricingPath(e.field, t).label;
  if (typeof params.mode === 'string') params.mode = t(`calc.mode_${params.mode}`);
  return t(`admin_pricing.err_${e.code}`, params);
}

/** "18,5" / "18.5" → 18.5; blank or not a number → NaN (the validator then
 *  reports it — never silently 0). */
function parseNumber(raw: string): number {
  const s = raw.trim().replace(',', '.');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

function NumField({ id, label, unit, hint, invalid, value, onChange, cents = false }: {
  id: string; label: string; unit: string; hint?: string; invalid?: boolean;
  value: unknown; onChange: (v: number) => void;
  /** Stored in integer cents, edited in euros (2 decimals max). */
  cents?: boolean;
}) {
  const { i18n } = useTranslation();
  const fr = i18n.language !== 'en';
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const toText = (v: unknown) => {
    if (!finite(v)) return '';
    const s = String(cents ? v / 100 : v);
    return fr ? s.replace('.', ',') : s;
  };
  const parse = (raw: string) => {
    const n = parseNumber(raw);
    if (!cents || Number.isNaN(n)) return n;
    return /[.,]\d{3,}/.test(raw) ? NaN : Math.round(n * 100);
  };
  const [text, setText] = useState(() => toText(value));
  // Follow outside changes (restore defaults, reload) without fighting the typing.
  useEffect(() => {
    const p = parse(text);
    if (!(p === value || (Number.isNaN(p) && !finite(value)))) setText(toText(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Label htmlFor={id} className="text-luna-navy text-[13px]">{label}</Label>
      <div className="relative mt-1.5">
        <Input id={id} inputMode="decimal" autoComplete="off" value={text}
          onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }}
          aria-invalid={invalid || undefined} aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn('pr-16 tabular-nums', invalid && 'border-red-500 focus-visible:ring-red-400')} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{unit}</span>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

function TextField({ id, label, value, placeholder, onChange }: {
  id: string; label: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-luna-navy text-[13px]">{label}</Label>
      <Input id={id} className="mt-1.5" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
