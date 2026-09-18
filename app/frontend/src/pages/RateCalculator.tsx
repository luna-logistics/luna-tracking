import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import {
  Plane, Ship, Package, Calculator, ArrowRight, Info, Clock,
  CheckCircle2, Loader2, ChevronDown, Ruler, Weight, Boxes,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { createConversation, sendMessage, guestCreateConversation, writeGuestToken } from '@/lib/support-chat';
import {
  computeQuote, formatEuros, transitTimeFor,
  type PricingConfig, type ModeResult, type PricedResult, type Mode, type QuoteReason,
} from '@/lib/pricing/engine';
import { fetchActivePricingConfig } from '@/lib/pricing/config';

/**
 * Shipping price calculator — Brussels → Kinshasa (/calculateur).
 *
 * One set of inputs, three prices side by side (express / cargo / sea), each with a
 * line-by-line breakdown so the customer sees HOW the price forms. When a confirmed
 * rule doesn't cover the case, that mode shows a quote request (one click → a
 * support conversation with the entered values attached) — never a guessed price.
 *
 * All business rules come from the active `pricing_config` row; the engine
 * (lib/pricing/engine.ts) does the maths in integer cents. Copy/examples/FAQ are
 * admin-editable through useContent/site_content. This REPLACES the previous
 * generic multi-country calculator on this route (see the handoff report).
 */

const P = 'calculator'; // useContent page key

type DestChoice = 'kinshasa' | 'other';

const num = (s: string): number | null => {
  if (s == null || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const fmtKg = (n: number) => `${Number(n.toFixed(3))}`;
const fmtM3 = (n: number) => `${Number(n.toFixed(3))}`;
const MODES: Mode[] = ['express', 'cargo', 'sea'];
const MODE_ICON = { express: Plane, cargo: Package, sea: Ship } as const;

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-royal focus-visible:ring-offset-1';

export default function RateCalculator() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr';
  const { user } = useAuth();

  const metaTitle = useContent(P, 'meta_title', t('calc.meta_title'));
  const metaDescription = useContent(P, 'meta_description', t('calc.meta_description'));

  // FAQ copy resolved ONCE (admin overrides + i18n fallback), so the visible
  // accordion and the FAQPage JSON-LD are guaranteed identical, word for word.
  const q_weight = useContent(P, 'q_weight', t('calc.q_weight'));
  const a_weight = useContent(P, 'a_weight', t('calc.a_weight'));
  const q_volumetric = useContent(P, 'q_volumetric', t('calc.q_volumetric'));
  const a_volumetric = useContent(P, 'a_volumetric', t('calc.a_volumetric'));
  const q_customs = useContent(P, 'q_customs', t('calc.q_customs'));
  const a_customs = useContent(P, 'a_customs', t('calc.a_customs'));
  const q_delay = useContent(P, 'q_delay', t('calc.q_delay'));
  const a_delay = useContent(P, 'a_delay', t('calc.a_delay'));
  const q_other = useContent(P, 'q_other_dest', t('calc.q_other_dest'));
  const a_other = useContent(P, 'a_other_dest', t('calc.a_other_dest'));
  const faqItems = [
    { q: q_weight, a: a_weight },
    { q: q_volumetric, a: a_volumetric },
    { q: q_customs, a: a_customs },
    { q: q_delay, a: a_delay },
    { q: q_other, a: a_other },
  ];

  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [configError, setConfigError] = useState(false);

  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [parcels, setParcels] = useState('1');
  const [volume, setVolume] = useState('');
  const [destination, setDestination] = useState<DestChoice>('kinshasa');
  const [live, setLive] = useState('');

  useEffect(() => {
    let alive = true;
    fetchActivePricingConfig()
      .then((c) => { if (alive) { if (c) setConfig(c); else setConfigError(true); } })
      .catch(() => { if (alive) setConfigError(true); });
    return () => { alive = false; };
  }, []);

  const input = useMemo(() => ({
    weightKg: num(weight),
    lengthCm: num(length), widthCm: num(width), heightCm: num(height),
    parcels: num(parcels) || 1,
    volumeM3: num(volume),
    destination: destination === 'kinshasa' ? 'kinshasa' : 'autre',
  }), [weight, length, width, height, parcels, volume, destination]);

  const quote = useMemo(() => (config ? computeQuote(input, config) : null), [config, input]);

  // Announce the three results in a live region whenever they change.
  useEffect(() => {
    if (!quote) return;
    const parts = MODES.map((m) => {
      const r = quote[m];
      const name = t(`calc.mode_${m}`);
      if (r.kind === 'price') return `${name}: ${formatEuros(r.totalCents, lang)}`;
      if (r.kind === 'quote') return `${name}: ${t('calc.live_quote')}`;
      return null;
    }).filter(Boolean);
    setLive(parts.length ? t('calc.live_prefix') + ' ' + parts.join(' · ') : '');
  }, [quote, lang, t]);

  const hasAnyInput = input.weightKg != null || input.volumeM3 != null
    || (input.lengthCm != null && input.widthCm != null && input.heightCm != null);

  // Shipment summary lines, attached to any quote request.
  const summaryLines = useMemo(() => {
    const lines: string[] = [`${t('calc.field_destination')}: ${destination === 'kinshasa' ? 'Kinshasa' : t('calc.dest_other')}`];
    lines.push(`${t('calc.sum_origin')}: Bruxelles`);
    if (input.weightKg != null) lines.push(`${t('calc.field_weight')}: ${fmtKg(input.weightKg)} kg`);
    if (input.lengthCm != null && input.widthCm != null && input.heightCm != null) {
      lines.push(`${t('calc.sum_dims')}: ${input.lengthCm} × ${input.widthCm} × ${input.heightCm} cm`);
    }
    if ((num(parcels) || 1) > 1) lines.push(`${t('calc.field_parcels')}: ${num(parcels)}`);
    if (input.volumeM3 != null) lines.push(`${t('calc.field_volume')}: ${fmtM3(input.volumeM3)} m³`);
    return lines;
  }, [input, destination, parcels, t]);

  const applyPreset = (p: { l?: number; w?: number; h?: number; kg?: number; m3?: number }) => {
    setLength(p.l != null ? String(p.l) : '');
    setWidth(p.w != null ? String(p.w) : '');
    setHeight(p.h != null ? String(p.h) : '');
    setWeight(p.kg != null ? String(p.kg) : '');
    setVolume(p.m3 != null ? String(p.m3) : '');
    setParcels('1');
  };

  const container = 'mx-auto max-w-[1220px] px-5 sm:px-8';
  const H2 = 'text-[clamp(24px,3vw,32px)] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink';

  return (
    <div className="text-[17px] text-luna-ink">
      <SEO title={metaTitle} description={metaDescription} />
      <FaqJsonLd items={faqItems} />

      {/* live region for screen readers */}
      <div aria-live="polite" className="sr-only">{live}</div>

      {/* ── Hero ── */}
      <section style={{ background: 'linear-gradient(135deg,#0A1650 0%,#0D2E6B 62%,#123A7E 100%)' }} className="text-white">
        <div className={cn(container, 'py-[clamp(40px,6vw,72px)]')}>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/90">
            <Calculator className="h-4 w-4" aria-hidden="true" /> {t('calc.corridor_badge')}
          </p>
          <Ed page={P} field="hero_title" as="h1" className="mt-4 block text-[clamp(28px,4.5vw,44px)] font-bold leading-[1.08]">
            {t('calc.hero_title')}
          </Ed>
          <Ed page={P} field="hero_intro" as="p" multiline className="mt-3 block max-w-2xl text-[17px] text-white/90">
            {t('calc.hero_intro')}
          </Ed>
        </div>
      </section>

      {/* ── Calculator ── */}
      <section className="bg-luna-mist">
        <div className={cn(container, 'py-[clamp(32px,5vw,56px)]')}>
          {configError && (
            <div role="alert" className="mb-6 rounded-xl border-2 border-luna-navy/20 bg-white p-4 text-[15px]">
              {t('calc.config_unavailable')}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] items-start">
            {/* Inputs — the only elevated object on the page */}
            <form
              className="rounded-2xl border border-luna-hair/30 bg-white p-5 sm:p-6 shadow-[0_18px_40px_-24px_rgba(10,22,80,.5)]"
              onSubmit={(e) => e.preventDefault()}
              aria-labelledby="calc-form-title"
            >
              <h2 id="calc-form-title" className="text-lg font-semibold text-luna-ink">{t('calc.form_title')}</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="destination" className="text-luna-ink">{t('calc.field_destination')}</Label>
                  <Select value={destination} onValueChange={(v) => setDestination(v as DestChoice)}>
                    <SelectTrigger id="destination" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kinshasa">{t('calc.dest_kinshasa')}</SelectItem>
                      <SelectItem value="other">{t('calc.dest_other')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[13px] text-luna-body">{t('calc.dest_hint')}</p>
                </div>

                <div>
                  <Label htmlFor="weight" className="text-luna-ink">{t('calc.field_weight')} <span className="text-luna-body font-normal">({t('calc.unit_kg')})</span></Label>
                  <Input id="weight" type="number" inputMode="decimal" min="0" step="0.001" value={weight}
                    onChange={(e) => setWeight(e.target.value)} placeholder="6" className="mt-1.5" />
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-luna-ink flex items-center gap-1.5"><Ruler className="h-4 w-4 text-luna-sky" aria-hidden="true" />{t('calc.field_dims')} <span className="text-luna-body font-normal">({t('calc.unit_cm')})</span></legend>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <Input aria-label={t('calc.dim_length')} type="number" inputMode="decimal" min="0" step="1" value={length} onChange={(e) => setLength(e.target.value)} placeholder="60" />
                    <Input aria-label={t('calc.dim_width')} type="number" inputMode="decimal" min="0" step="1" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="40" />
                    <Input aria-label={t('calc.dim_height')} type="number" inputMode="decimal" min="0" step="1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="40" />
                  </div>
                  <p className="mt-1 text-[13px] text-luna-body">{t('calc.dims_hint')}</p>
                </fieldset>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="parcels" className="text-luna-ink">{t('calc.field_parcels')}</Label>
                    <Input id="parcels" type="number" inputMode="numeric" min="1" step="1" value={parcels} onChange={(e) => setParcels(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="volume" className="text-luna-ink">{t('calc.field_volume')} <span className="text-luna-body font-normal">({t('calc.unit_m3')})</span></Label>
                    <Input id="volume" type="number" inputMode="decimal" min="0" step="0.01" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="3" className="mt-1.5" />
                  </div>
                </div>
                <p className="text-[13px] text-luna-body">{t('calc.volume_hint')}</p>
              </div>

              {/* Presets */}
              <div className="mt-5 border-t border-luna-hair/20 pt-4">
                <p className="text-sm font-medium text-luna-ink flex items-center gap-1.5"><Boxes className="h-4 w-4 text-luna-sky" aria-hidden="true" />{t('calc.presets_title')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PresetBtn label={t('calc.preset_carton_std')} onClick={() => applyPreset({ l: 60, w: 40, h: 40 })} />
                  <PresetBtn label={t('calc.preset_carton_small')} onClick={() => applyPreset({ l: 40, w: 30, h: 30 })} />
                  <PresetBtn label={t('calc.preset_suitcase')} onClick={() => applyPreset({ kg: 23 })} />
                  <PresetBtn label={t('calc.preset_move')} onClick={() => applyPreset({ m3: 3 })} />
                </div>
              </div>
            </form>

            {/* Results */}
            <div>
              <h2 className="sr-only">{t('calc.results_title')}</h2>
              {!config ? (
                <div className="rounded-2xl border border-luna-hair/30 bg-white p-8 text-center text-luna-body">
                  {configError ? (
                    <p className="text-[15px]">{t('calc.config_unavailable')}</p>
                  ) : (
                    <>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-luna-royal" aria-hidden="true" />
                      <p className="mt-2">{t('calc.loading')}</p>
                    </>
                  )}
                </div>
              ) : !hasAnyInput ? (
                <div className="rounded-2xl border border-dashed border-luna-hair/50 bg-white/60 p-8 text-center text-luna-body">
                  <Info className="mx-auto h-6 w-6 text-luna-sky" aria-hidden="true" />
                  <p className="mt-2 text-[15px]">{t('calc.enter_prompt')}</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {MODES.map((m) => (
                    <ModeCard
                      key={m}
                      mode={m}
                      result={quote ? quote[m] : { mode: m, kind: 'empty' }}
                      config={config!}
                      lang={lang}
                      summaryLines={summaryLines}
                      user={!!user}
                    />
                  ))}
                </div>
              )}

              {config?.effectiveFrom && (
                <p className="mt-4 text-[13px] text-luna-body">{t('calc.effective_since', { date: config.effectiveFrom })}</p>
              )}
              {config?.vatStatus && (
                <p className="mt-1 text-[13px] text-luna-body">{config.vatStatus}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── How a freight price is built ── */}
      <Block name="calc-how">
        <section className="bg-white">
          <div className={cn(container, 'py-[clamp(40px,6vw,72px)] max-w-3xl')}>
            <Ed page={P} field="how_title" as="h2" className={cn(H2, 'block')}>{t('calc.how_title')}</Ed>
            <Ed page={P} field="how_body" as="p" multiline className="mt-4 block text-luna-body leading-relaxed">
              {t('calc.how_body')}
            </Ed>
            <ul className="mt-5 space-y-3 text-[15px]">
              <li className="flex gap-3"><Weight className="h-5 w-5 shrink-0 text-luna-sky" aria-hidden="true" /><span>{t('calc.how_actual')}</span></li>
              <li className="flex gap-3"><Ruler className="h-5 w-5 shrink-0 text-luna-sky" aria-hidden="true" /><span>{t('calc.how_volumetric')}</span></li>
              <li className="flex gap-3"><Info className="h-5 w-5 shrink-0 text-luna-sky" aria-hidden="true" /><span>{t('calc.how_handling')}</span></li>
            </ul>
            <p className="mt-5 rounded-xl bg-luna-mist p-4 text-[14px] text-luna-body">{t('calc.customs_note', { fee: config ? formatEuros(config.customsAdminFeeCents ?? 12500, lang) : '' })}</p>
          </div>
        </section>
      </Block>

      {/* ── Three modes compared ── */}
      <Block name="calc-modes">
        <section className="bg-luna-mist">
          <div className={cn(container, 'py-[clamp(40px,6vw,72px)]')}>
            <h2 className={H2}>{t('calc.modes_title')}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {MODES.map((m) => {
                const Icon = MODE_ICON[m];
                const transit = config ? transitTimeFor(config, m) : null;
                return (
                  <div key={m} className="rounded-2xl border border-luna-hair/30 bg-white p-5">
                    <Icon className="h-7 w-7 text-luna-royal" aria-hidden="true" />
                    <h3 className="mt-3 text-lg font-semibold text-luna-ink">{t(`calc.mode_${m}`)}</h3>
                    <p className="mt-1.5 text-[15px] text-luna-body">{t(`calc.mode_${m}_suits`)}</p>
                    <p className="mt-3 text-[14px] font-medium text-luna-ink">{t(`calc.mode_${m}_rate`)}</p>
                    {transit && (
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-luna-body"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t('calc.transit_label', { value: transit })}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </Block>

      {/* ── Worked examples ── */}
      {config && (
        <Block name="calc-examples">
          <section className="bg-white">
            <div className={cn(container, 'py-[clamp(40px,6vw,72px)]')}>
              <h2 className={H2}>{t('calc.examples_title')}</h2>
              <p className="mt-3 max-w-2xl text-luna-body">{t('calc.examples_intro')}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <WorkedExample titleKey="ex_carton" mode="express" input={{ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }} config={config} lang={lang} />
                <WorkedExample titleKey="ex_express" mode="express" input={{ weightKg: 0.4 }} config={config} lang={lang} />
                <WorkedExample titleKey="ex_sea" mode="sea" input={{ volumeM3: 3 }} config={config} lang={lang} />
                <WorkedExample titleKey="ex_suitcase" mode="cargo" input={{ weightKg: 23 }} config={config} lang={lang} />
              </div>
            </div>
          </section>
        </Block>
      )}

      {/* ── What's included (only confirmed entries) ── */}
      <IncludesBlock config={config} />

      {/* ── FAQ ── */}
      <Block name="calc-faq">
        <section className="bg-luna-mist">
          <div className={cn(container, 'py-[clamp(40px,6vw,72px)] max-w-3xl')}>
            <h2 className={H2}>{t('calc.faq_title')}</h2>
            <div className="mt-6 divide-y divide-luna-hair/25 rounded-2xl border border-luna-hair/30 bg-white">
              {faqItems.map((f, i) => <FaqRow key={i} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>
      </Block>
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('rounded-full border border-luna-hair/40 bg-luna-mist px-3 py-1.5 text-[13px] font-medium text-luna-ink hover:border-luna-sky hover:bg-white', ring)}>
      {label}
    </button>
  );
}

function ModeCard({ mode, result, config, lang, summaryLines, user }: {
  mode: Mode; result: ModeResult; config: PricingConfig; lang: 'fr' | 'en'; summaryLines: string[]; user: boolean;
}) {
  const { t } = useTranslation();
  const Icon = MODE_ICON[mode];
  const transit = transitTimeFor(config, mode);

  return (
    <div className={cn(
      'flex flex-col rounded-2xl border bg-white p-4 min-w-0',
      result.kind === 'quote' ? 'border-luna-sky/50' : 'border-luna-hair/30',
    )}>
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-luna-mist p-2 text-luna-royal"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <h3 className="font-semibold text-luna-ink">{t(`calc.mode_${mode}`)}</h3>
      </div>

      {result.kind === 'empty' && (
        <p className="mt-4 text-[14px] text-luna-body">
          {mode === 'sea' ? t('calc.empty_sea') : t('calc.empty_air')}
        </p>
      )}

      {result.kind === 'price' && (
        <>
          <p className="mt-4 text-[28px] font-bold leading-none text-luna-ink">{formatEuros(result.totalCents, lang)}</p>
          <p className="mt-1 text-[12px] text-luna-body">{t(`calc.basis_${result.chargeableBasis}`)}</p>
          <Breakdown result={result} lang={lang} />
          {transit && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-luna-body"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t('calc.transit_label', { value: transit })}</p>}
          <p className="mt-2 text-[11px] text-luna-body">{t('calc.estimate_note')}</p>
        </>
      )}

      {result.kind === 'quote' && (
        <ModeQuotePanel mode={mode} reason={result.reason} summaryLines={summaryLines} lang={lang} user={user} />
      )}
    </div>
  );
}

function Breakdown({ result, lang }: { result: PricedResult; lang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  const detail = (l: PricedResult['lines'][number]): string | null => {
    if (l.key === 'weight') {
      const expected = result.actualWeightKg * (l.rateCentsPerKg ?? 0);
      if (l.cents > expected + 0.5) return t('calc.line_weight_min');
      return `${fmtKg(l.qtyKg ?? 0)} kg × ${formatEuros(l.rateCentsPerKg ?? 0, lang)}/kg`;
    }
    if (l.key === 'volumetric_diff') return `${fmtKg(l.qtyKg ?? 0)} kg × ${formatEuros(l.rateCentsPerKg ?? 0, lang)}/kg`;
    if (l.key === 'volume') return `${fmtM3(l.qtyM3 ?? 0)} m³ × ${formatEuros(l.rateCentsPerM3 ?? 0, lang)}/m³`;
    return null;
  };
  return (
    <dl className="mt-3 space-y-1.5 border-t border-luna-hair/20 pt-3 text-[13px]">
      {result.volumetricWeightKg != null && (
        <div className="flex justify-between text-luna-body">
          <dt>{t('calc.vol_weight')}</dt>
          <dd>{fmtKg(result.volumetricWeightKg)} kg</dd>
        </div>
      )}
      {result.lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-2">
          <dt className="text-luna-body">
            {t(`calc.line_${l.key}`)}
            {detail(l) && <span className="block text-[11px] text-luna-body/80">{detail(l)}</span>}
          </dt>
          <dd className="whitespace-nowrap font-medium text-luna-ink">{formatEuros(Math.round(l.cents), lang)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModeQuotePanel({ mode, reason, summaryLines, lang, user }: {
  mode: Mode; reason: QuoteReason; summaryLines: string[]; lang: 'fr' | 'en'; user: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user && (!email.trim() || !name.trim())) return;
    const subject = t('calc.quote_subject', { mode: t(`calc.mode_${mode}`) });
    const body = [
      t('calc.quote_intro', { mode: t(`calc.mode_${mode}`) }),
      '',
      ...summaryLines,
      `${t('calc.quote_reason_label')}: ${t(`calc.quote_reason_${reason}`)}`,
      message.trim() ? `\n${message.trim()}` : null,
    ].filter((x) => x != null).join('\n');
    setBusy(true);
    try {
      if (user) {
        const conv = await createConversation(subject);
        await sendMessage(conv.id, body);
      } else {
        const row = await guestCreateConversation({ email: email.trim(), name: name.trim(), subject, body });
        writeGuestToken(row.guest_token);
      }
      setDone(true);
      toast.success(t('calc.quote_success_title'));
    } catch {
      toast.error(t('calc.quote_error'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-4 rounded-xl border border-luna-sky/40 bg-luna-mist p-3 text-[13px]">
        <CheckCircle2 className="h-5 w-5 text-luna-royal" aria-hidden="true" />
        <p className="mt-1 font-medium text-luna-ink">{t('calc.quote_success_title')}</p>
        <p className="mt-0.5 text-luna-body">{t('calc.quote_success_body')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-1 flex-col">
      <p className="text-[13px] font-medium text-luna-ink">{t('calc.quote_title')}</p>
      <p className="mt-1 text-[12px] text-luna-body">{t(`calc.quote_reason_${reason}`)}</p>
      {!open ? (
        <Button type="button" variant="brand" size="sm" className={cn('mt-3 self-start', ring)} onClick={() => setOpen(true)}>
          {t('calc.quote_cta')} <ArrowRight className="h-4 w-4" />
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {!user && (
            <>
              <Input aria-label={t('calc.quote_name')} placeholder={t('calc.quote_name')} value={name} onChange={(e) => setName(e.target.value)} required />
              <Input aria-label={t('calc.quote_email')} type="email" placeholder={t('calc.quote_email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </>
          )}
          <textarea
            aria-label={t('calc.quote_message')} placeholder={t('calc.quote_message')} rows={2} value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={cn('w-full rounded-md border border-luna-hair/40 bg-white px-3 py-2 text-[14px]', ring)}
          />
          <Button type="submit" variant="navy" size="sm" disabled={busy} className={cn('w-full', ring)}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" />{t('calc.quote_sending')}</> : t('calc.quote_submit')}
          </Button>
        </form>
      )}
    </div>
  );
}

function WorkedExample({ titleKey, mode, input, config, lang }: {
  titleKey: string; mode: Mode; input: Parameters<typeof computeQuote>[0]; config: PricingConfig; lang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const q = computeQuote(input, config);
  const r = q[mode];
  return (
    <div className="rounded-2xl border border-luna-hair/30 bg-luna-mist/60 p-5">
      <h3 className="font-semibold text-luna-ink">{t(`calc.${titleKey}_title`)}</h3>
      <p className="mt-1 text-[14px] text-luna-body">{t(`calc.${titleKey}_input`)}</p>
      {r.kind === 'price' ? (
        <>
          <div className="mt-3"><Breakdown result={r} lang={lang} /></div>
          <p className="mt-3 text-[15px] font-semibold text-luna-ink">
            {t(`calc.mode_${mode}`)} — {formatEuros(r.totalCents, lang)}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[14px] text-luna-body">{t('calc.quote_title')}</p>
      )}
    </div>
  );
}

function IncludesBlock({ config }: { config: PricingConfig | null }) {
  const { t } = useTranslation();
  const includes = config?.includes ?? null;
  const entries = includes ? Object.entries(includes).filter(([, v]) => v != null && String(v).trim() !== '') : [];
  if (entries.length === 0) return null; // nothing confirmed → omit the whole block
  return (
    <Block name="calc-included">
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-[clamp(40px,6vw,72px)]">
          <h2 className="text-[clamp(24px,3vw,32px)] font-semibold text-luna-ink">{t('calc.included_title')}</h2>
          <ul className="mt-5 space-y-2.5">
            {entries.map(([k, v]) => (
              <li key={k} className="flex gap-3 text-[15px]">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-luna-royal" aria-hidden="true" />
                <span>{String(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Block>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={cn('flex w-full items-center justify-between gap-3 px-5 py-4 text-left', ring)}>
        <span className="font-medium text-luna-ink">{q}</span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-luna-body transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <p className="px-5 pb-4 -mt-1 text-[15px] text-luna-body leading-relaxed">{a}</p>}
    </div>
  );
}

/** FAQPage JSON-LD, mirrored word-for-word from the visible FAQ (the same resolved
 *  copy is passed in). No Offer/Product data — prices change and stale rich results
 *  are worse than none. */
function FaqJsonLd({ items }: { items: { q: string; a: string }[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
}
