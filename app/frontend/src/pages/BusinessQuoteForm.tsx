import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2, Calculator, X } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  emptyQuote, fetchQuote, upsertQuote, professionalMargin,
  type QuoteInput,
} from '@/lib/quotes';
import { fetchActivePricingConfig } from '@/lib/pricing/config';
import { formatEuros, type PricingConfig } from '@/lib/pricing/engine';
import { suggestFromGrid, type ProLine, type ProOption } from '@/lib/pricing/pro-suggest';
import { fetchCustomers, type BusinessCustomer } from '@/lib/customers';
import { CURRENCIES, type Currency } from '@/lib/businesses';
import { SHIPMENT_DIRECTIONS, SHIPMENT_MODES } from '@/lib/shipment-status';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { InfoHint } from '@/components/InfoHint';
import { CountrySelect } from '@/components/CountrySelect';

/**
 * Quote form. Full pricing panel with cost / customer price / platform
 * fee / professional margin — computed live, only shown to team members.
 * "Suggest a rate" prices the quote with the SAME engine + active
 * pricing_config row as the public /calculateur (lib/pricing/pro-suggest),
 * shows every applicable product with its breakdown — or "sur devis" when
 * the grid doesn't cover it — and copies the chosen price into transport_cost.
 */
export default function BusinessQuoteForm() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const { current } = useBusiness();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [f, setF] = useState<QuoteInput>(emptyQuote(current?.currency as Currency ?? 'EUR'));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [suggesting, setSuggesting] = useState(false);
  const [gridConfig, setGridConfig] = useState<PricingConfig | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);

  // Live: re-priced as the weight / volume / route / customs flag change.
  const suggestion = useMemo(() => {
    if (!showSuggest || !gridConfig) return null;
    return suggestFromGrid({
      mode: f.mode as 'air' | 'sea' | 'road',
      originCountry: f.origin_country, destinationCountry: f.destination_country,
      originCity: f.origin_city, destinationCity: f.destination_city,
      weightKg: f.weight_kg, volumeM3: f.volume_m3, underCustoms: f.under_customs,
    }, gridConfig);
  }, [showSuggest, gridConfig, f.mode, f.origin_country, f.destination_country, f.origin_city,
      f.destination_city, f.weight_kg, f.volume_m3, f.under_customs]);

  useEffect(() => {
    if (!current) return;
    void fetchCustomers(current.id).then(setCustomers);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    void fetchQuote(id).then((q) => {
      if (q) setF({ ...q });
      setLoading(false);
    });
  }, [id]);

  if (!current) return null;
  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;

  const num = (v: string) => v === '' ? null : Number(v);
  const marginNow = professionalMargin(f as unknown as { customer_price: number; transport_cost: number; platform_fee: number });
  // A blank form has customer_price 0 → the margin would read as a scary
  // negative number before anything was typed. Judge it only once a price exists.
  const priceEntered = Number(f.customer_price) > 0;
  const marginNegative = priceEntered && marginNow < 0;

  const suggestRate = async () => {
    if (!f.origin_country || !f.destination_country) {
      toast.error(t('business_quote_form.suggest_needs_countries'));
      return;
    }
    if (gridConfig) { setShowSuggest(true); return; }
    setSuggesting(true);
    try {
      const cfg = await fetchActivePricingConfig();
      if (!cfg) { toast.error(t('business_quote_form.suggest_config_error')); return; }
      setGridConfig(cfg);
      setShowSuggest(true);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setSuggesting(false);
    }
  };

  const applyOption = (o: Extract<ProOption, { kind: 'price' }>) => {
    setF((p) => ({ ...p, transport_cost: o.totalCents / 100, currency: 'EUR', provider_code: `grille-${o.mode}` }));
    toast.success(t('business_quote_form.suggest_applied', {
      code: t(`calc.mode_${o.mode}`), price: formatEuros(o.totalCents, lang), currency: '',
    }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await upsertQuote(current.id, f);
      toast.success(t('business_quote_form.saved'));
      navigate(`../${saved.id}`);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SEO title={isEdit ? f.notes || t('business_quote_form.title_edit') : t('business_quote_form.title_new')} noindex />
      <div className="flex items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={isEdit ? '..' : '../..'}><ArrowLeft className="h-4 w-4" />{t('business_quote_form.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy">
          {isEdit ? t('business_quote_form.title_edit') : t('business_quote_form.title_new')}
        </h1>
      </div>

      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        {/* Basics + route */}
        <div className="lg:col-span-2 space-y-4">
          <Section title={t('business_quote_form.section_basics')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('business_quote_form.field_client')}>
                <Select value={f.customer_id ?? '__none__'} onValueChange={(v) => setF((p) => ({ ...p, customer_id: v === '__none__' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('business_quote_form.field_client_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— {t('business_quote_form.no_client')} —</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('business_quote_form.field_valid_until')} hint={t('business_quote_form.help_valid_until')}>
                <Input type="date" value={f.valid_until ?? ''} onChange={(e) => setF((p) => ({ ...p, valid_until: e.target.value || null }))} />
              </Field>
              <Field label={t('business_quote_form.field_direction')} hint={t('business_quote_form.help_direction')}>
                <Select value={f.direction} onValueChange={(v) => setF((p) => ({ ...p, direction: v as typeof p.direction }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIPMENT_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{t(`shipment_direction.${d}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t('business_quote_form.field_mode')}>
                <Select value={f.mode} onValueChange={(v) => setF((p) => ({ ...p, mode: v as typeof p.mode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIPMENT_MODES.map((m) => <SelectItem key={m} value={m}>{t(`shipment_mode.${m}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title={t('business_quote_form.section_route')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('business_quote_form.field_origin_country')} htmlFor="quote-origin-country">
                <CountrySelect id="quote-origin-country" value={f.origin_country}
                  onChange={(code) => setF((p) => ({ ...p, origin_country: code }))} />
              </Field>
              <Field label={t('business_quote_form.field_origin_city')}>
                <Input value={f.origin_city ?? ''} onChange={(e) => setF((p) => ({ ...p, origin_city: e.target.value || null }))} />
              </Field>
              <Field label={t('business_quote_form.field_dest_country')} htmlFor="quote-dest-country">
                <CountrySelect id="quote-dest-country" value={f.destination_country}
                  onChange={(code) => setF((p) => ({ ...p, destination_country: code }))} />
              </Field>
              <Field label={t('business_quote_form.field_dest_city')}>
                <Input value={f.destination_city ?? ''} onChange={(e) => setF((p) => ({ ...p, destination_city: e.target.value || null }))} />
              </Field>
            </div>
          </Section>

          <Section title={t('business_quote_form.section_measure')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('business_quote_form.field_weight')} hint={t('business_quote_form.help_weight')}>
                <Input type="number" step="0.01" value={f.weight_kg ?? ''} onChange={(e) => setF((p) => ({ ...p, weight_kg: num(e.target.value) }))} />
              </Field>
              <Field label={t('business_quote_form.field_volume')} hint={t('business_quote_form.help_volume')}>
                <Input type="number" step="0.001" value={f.volume_m3 ?? ''} onChange={(e) => setF((p) => ({ ...p, volume_m3: num(e.target.value) }))} />
              </Field>
              <Field label={t('business_quote_form.field_pieces')}>
                <Input type="number" step="1" min="0" value={f.package_count ?? ''} onChange={(e) => setF((p) => ({ ...p, package_count: e.target.value === '' ? null : parseInt(e.target.value, 10) }))} />
              </Field>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={f.under_customs}
                onChange={(e) => setF((p) => ({ ...p, under_customs: e.target.checked }))}
                className="mt-0.5 rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
              <span>
                <span className="font-medium text-luna-navy">{t('business_quote_form.field_under_customs')}</span>
                <span className="block text-[11px] leading-snug text-slate-500">{t('business_quote_form.field_under_customs_hint')}</span>
              </span>
            </label>
          </Section>

          <Section title={t('business_quote_form.section_notes')}>
            <Textarea rows={3} value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value || null }))} />
          </Section>
        </div>

        {/* Pricing sidebar */}
        <div className="space-y-4">
          <Section title={t('business_quote_form.section_pricing')}>
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={suggestRate} disabled={suggesting}>
                  {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {t('business_quote_form.suggest_rate')}
                </Button>
              </div>
              {suggestion && (
                <SuggestionPanel suggestion={suggestion} lang={lang} onApply={applyOption} onClose={() => setShowSuggest(false)} />
              )}
              <Field label={t('business_quote_form.field_transport_cost')} hint={t('business_quote_form.help_transport_cost')}>
                <Input type="number" step="0.01" min="0" value={f.transport_cost} onChange={(e) => setF((p) => ({ ...p, transport_cost: Number(e.target.value) }))} required />
              </Field>
              <Field label={t('business_quote_form.field_customer_price')} hint={t('business_quote_form.help_customer_price')}>
                <Input type="number" step="0.01" min="0" value={f.customer_price} onChange={(e) => setF((p) => ({ ...p, customer_price: Number(e.target.value) }))} required />
              </Field>
              <Field label={t('business_quote_form.field_platform_fee')} hint={t('business_quote_form.help_platform_fee')}>
                <Input type="number" step="0.01" min="0" value={f.platform_fee} onChange={(e) => setF((p) => ({ ...p, platform_fee: Number(e.target.value) }))} />
              </Field>
              <Field label={t('business_quote_form.field_currency')}>
                <Select value={f.currency} onValueChange={(v) => setF((p) => ({ ...p, currency: v as Currency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className={cn(
                'mt-2 rounded-xl border p-3 text-sm',
                !priceEntered ? 'border-slate-200 bg-slate-50 text-slate-700'
                  : marginNegative ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900',
              )} aria-live="polite">
                <p className="text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5">
                  {t('business_quote_form.professional_margin')}
                  <InfoHint text={t('business_quote_form.margin_help')} label={t('common.more_info')} />
                </p>
                {priceEntered ? (
                  <p className="mt-1 text-lg font-bold">
                    {marginNow.toLocaleString()} {f.currency}
                  </p>
                ) : (
                  <p className="mt-1 text-xs">{t('business_quote_form.margin_pending')}</p>
                )}
                {marginNegative && (
                  <p className="mt-1 text-xs">{t('business_quote_form.margin_negative_warning')}</p>
                )}
              </div>
              {f.provider_code && (
                <p className="text-[11px] text-slate-500">
                  {t('business_quote_form.provider_stamp', { code: f.provider_code })}
                </p>
              )}
            </div>
          </Section>
        </div>

        <div className="lg:col-span-3 flex justify-end gap-2">
          <Button asChild variant="ghost" type="button">
            <Link to={isEdit ? '..' : '../..'}>{t('business_quote_form.cancel')}</Link>
          </Button>
          <Button type="submit" variant="navy" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('business_quote_form.save')}
          </Button>
        </div>
      </form>
    </>
  );
}

function lineLabel(l: ProLine, t: (k: string) => string): string {
  const qty = (n?: number) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  switch (l.key) {
    case 'weight': return `${t('calc.line_weight')} · ${qty(l.qtyKg)} kg`;
    case 'volumetric_diff': return `${t('calc.line_volumetric_diff')} · ${qty(l.qtyKg)} kg`;
    case 'volume': return `${t('calc.line_volume')} · ${qty(l.qtyM3)} m³`;
    case 'carton_flat': return t('calc.line_carton_flat');
    case 'handling': return t('calc.line_handling');
    case 'customs_admin': return t('business_quote_form.line_customs_admin');
  }
}

/** The grid's answer for this quote: one card per applicable product with the
 *  line-by-line breakdown, or an explicit "sur devis" when the grid doesn't
 *  cover it — never a silent 0. */
function SuggestionPanel({ suggestion, lang, onApply, onClose }: {
  suggestion: ReturnType<typeof suggestFromGrid>;
  lang: 'fr' | 'en';
  onApply: (o: Extract<ProOption, { kind: 'price' }>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug text-slate-600">{t('business_quote_form.suggest_source')}</p>
        <button type="button" onClick={onClose} aria-label={t('common.close')}
          className="text-slate-400 hover:text-luna-navy rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-navy/30">
          <X className="h-4 w-4" />
        </button>
      </div>
      {suggestion.kind === 'no_grid_for_mode' ? (
        <SurDevis text={t('business_quote_form.suggest_no_grid_road')} />
      ) : suggestion.options.map((o) => (
        <div key={o.mode} className="rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-xs font-semibold text-luna-navy">{t(`calc.mode_${o.mode}`)}</p>
          {o.kind === 'empty' && <p className="mt-1 text-xs text-slate-600">{t('business_quote_form.suggest_empty')}</p>}
          {o.kind === 'quote' && <SurDevis text={t(`business_quote_form.suggest_reason_${o.reason}`)} />}
          {o.kind === 'price' && (
            <>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                {o.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{lineLabel(l, t)}</span>
                    <span className="tabular-nums">{formatEuros(Math.round(l.cents), lang)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-luna-navy tabular-nums">{formatEuros(o.totalCents, lang)}</span>
                <Button type="button" size="sm" variant="navy" className="h-7" onClick={() => onApply(o)}>
                  {t('business_quote_form.suggest_apply')}
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SurDevis({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
      <span className="font-semibold">{t('business_quote_form.suggest_sur_devis')}</span> — {text}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** `hint` = one always-visible sentence under the input (readable on touch
 *  screens); `info` = the same kind of sentence behind an ⓘ tooltip. */
function Field({ label, hint, info, htmlFor, children }: { label: string; hint?: string; info?: string; htmlFor?: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-luna-navy text-xs uppercase tracking-wide inline-flex items-center gap-1.5">
        {label}
        {info && <InfoHint text={info} label={t('common.more_info')} />}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}
