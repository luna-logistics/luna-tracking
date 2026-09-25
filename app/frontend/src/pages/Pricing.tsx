import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Calculator, ArrowRight, Clock, ShieldCheck, FileCheck2, UserPlus, Plus, Trash2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchDestinationCities, type DestinationCity } from '@/lib/cities';
import { useContent } from '@/contexts/SiteContentContext';
import { useAuth } from '@/contexts/AuthContext';
import { Ed } from '@/components/Ed';
import { toast } from '@/components/ui/sonner';
import { urlFor } from '@/lib/url/routes';
import { fetchActivePricingConfig } from '@/lib/pricing/config';
import { formatEuros, type Mode as GridMode, type PricingConfig, type QuoteResponse } from '@/lib/pricing/engine';
import {
  emptyTarifsLine, gridEstimateLines, quoteFor, tarifsEngineInput, tarifsLinesSize, type TarifsLine,
} from '@/lib/pricing/surfaces';
import { parseDecimal } from '@/lib/pricing/volume';
import { FormShield, useFormShield } from '@/components/FormShield';
import { submitErrorKey } from '@/lib/errors';
import {
  createConversation, sendMessage, guestCreateConversation, writeGuestToken,
} from '@/lib/support-chat';

/**
 * Quote builder (/tarifs): the visitor sizes the shipment, sees the public
 * grid's indicative price live (same engine, same pricing_config row and same
 * size rule as /calculateur and the pro tool — lib/pricing/surfaces), then
 * sends the request to the agency.
 *
 * The request is delivered as a support conversation (same pipeline as
 * the chat bubble): the team gets the e-mail notification, answers from
 * /admin/support, and the visitor sees the reply in the bubble + by
 * e-mail. No separate quotes table needed for the public flow.
 *
 * Accepts the calculator's hand-off in the query string
 * (?from=BE&to=CD&mode=air&weight=10&volume=0.15) so the visitor never
 * retypes what they just estimated.
 */

type Mode = 'any' | 'air' | 'sea' | 'ground';

/** Departure cities we serve from Belgium — a closed list, like the
 *  destination side, plus "other" with a free-text field. */
const ORIGIN_CITIES: { value: string; fr: string; en: string }[] = [
  { value: 'bruxelles', fr: 'Bruxelles', en: 'Brussels' },
  { value: 'anvers',    fr: 'Anvers',    en: 'Antwerp' },
  { value: 'liege',     fr: 'Liège',     en: 'Liège' },
  { value: 'charleroi', fr: 'Charleroi', en: 'Charleroi' },
  { value: 'gand',      fr: 'Gand',      en: 'Ghent' },
  { value: 'namur',     fr: 'Namur',     en: 'Namur' },
  { value: 'mons',      fr: 'Mons',      en: 'Mons' },
  { value: 'louvain',   fr: 'Louvain',   en: 'Leuven' },
  { value: 'bruges',    fr: 'Bruges',    en: 'Bruges' },
];

const OTHER = 'other';

/** Which grid products answer each requested transport mode. */
const GRID_MODES: Record<Mode, GridMode[]> = {
  any: ['express', 'cargo', 'sea'],
  air: ['express', 'cargo'],
  sea: ['sea'],
  ground: [],
};

const fmtNum = (n: number, digits: number) => `${Number(n.toFixed(digits))}`;

function modeFromParam(v: string | null): Mode {
  if (v === 'air' || v === 'sea') return v;
  if (v === 'road' || v === 'ground') return 'ground';
  return 'any';
}

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const metaTitle       = useContent('pricing', 'meta_title',       t('pricing.meta_title'));
  const metaDescription = useContent('pricing', 'meta_description', t('pricing.meta_description'));
  const pageTitle       = useContent('pricing', 'page_title',       t('pricing.page_title'));
  const pageIntro       = useContent('pricing', 'page_intro',       t('pricing.page_intro'));
  const supportEmail    = t('footer.email');

  const [cities, setCities] = useState<DestinationCity[]>([]);
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const shield = useFormShield();

  // Controlled fields — needed to compose the request body + subject.
  const prefilled = searchParams.has('weight') || searchParams.has('volume') || searchParams.has('mode') || searchParams.has('from');
  const fromParam = searchParams.get('from');
  const [origin, setOrigin] = useState<string>(fromParam && fromParam !== 'BE' ? OTHER : '');
  const [originOther, setOriginOther] = useState('');
  const [destination, setDestination] = useState('');
  // Package lines (colisage): 3 empty lines by default, more on demand. The
  // calculator hand-off weight lands in the first line.
  const [lines, setLines] = useState<TarifsLine[]>(() => {
    const init = [emptyTarifsLine(), emptyTarifsLine(), emptyTarifsLine()];
    const w = searchParams.get('weight');
    if (w) init[0] = { ...init[0], weight: w };
    return init;
  });
  // A volume handed off by the calculator (?volume=) is never shown or typed
  // here; it prices only while no line has dimensions of its own.
  const handoffVolume = parseDecimal(searchParams.get('volume'));
  const [mode, setMode] = useState<Mode>(modeFromParam(searchParams.get('mode')));
  const [isBusiness, setIsBusiness] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [vatNumber, setVatNumber] = useState('');

  // Totals + engine size fields from the lines (shared rule: surfaces.tarifsLinesSize).
  const size = useMemo(() => tarifsLinesSize(lines), [lines]);
  const anyDims = lines.some((l) => [l.length, l.width, l.height].some((v) => v.trim() !== ''));
  const useHandoffVolume = handoffVolume != null && !anyDims;
  const sizeFields = useHandoffVolume ? { ...size.fields, volume: handoffVolume } : size.fields;
  const shownVolumeM3 = size.totalVolumeM3 ?? (useHandoffVolume ? handoffVolume : null);
  const updateLine = (i: number, patch: Partial<TarifsLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  useEffect(() => {
    fetchDestinationCities().then(setCities);
    // The live estimate is a bonus: without the grid the form still works.
    fetchActivePricingConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const originLabel = useMemo(() => {
    if (origin === OTHER) return originOther.trim();
    const c = ORIGIN_CITIES.find((x) => x.value === origin);
    return c ? (lang === 'en' ? c.en : c.fr) : '';
  }, [origin, originOther, lang]);

  const destinationLabel = useMemo(
    () => cities.find((c) => c.slug === destination)?.name ?? '',
    [cities, destination],
  );

  const modeLabel = (m: Mode) => t(`pricing.mode_${m}`);

  const sized = size.used > 0 || useHandoffVolume;
  const estimate = useMemo<QuoteResponse | null>(() => {
    if (!config || !origin || !destination || !sized) return null;
    return quoteFor(tarifsEngineInput({ originValue: origin, destinationSlug: destination, ...sizeFields }, config), config);
  }, [config, origin, destination, sized, sizeFields]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const message = String(form.get('message') ?? '').trim();
    if (!originLabel || !destinationLabel || !email) return;

    // Every filled package line, then the totals — the office sees exactly
    // what was priced.
    const q = (v: string) => v.trim() || '?';
    const pkgLines = lines
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => [l.length, l.width, l.height, l.weight].some((v) => v.trim() !== ''))
      .map(({ l, n }) => t('pricing.pkg_message_line', {
        n, dims: `${q(l.length)} × ${q(l.width)} × ${q(l.height)} cm`, weight: `${q(l.weight)} kg`,
      }));
    const subject = t('pricing.request_subject', { origin: originLabel, destination: destinationLabel });
    const msgLines = [
      `${t('pricing.origin_label')} : ${originLabel}`,
      `${t('pricing.destination_label')} : ${destinationLabel}`,
      ...pkgLines,
      size.totalWeightKg != null ? `${t('pricing.pkg_total_weight')} : ${fmtNum(size.totalWeightKg, 3)} kg` : null,
      shownVolumeM3 != null ? `${t('pricing.volume_label')} : ${fmtNum(shownVolumeM3, 4)} m³ (${t(useHandoffVolume ? 'pricing.volume_from_calculator' : 'calc.volume_from_dims')})` : null,
      `${t('pricing.mode_label')} : ${modeLabel(mode)}`,
      `${t('pricing.name_label')} : ${name}`,
      isBusiness && companyName.trim() ? `${t('pricing.company_label')} : ${companyName.trim()}` : null,
      isBusiness && vatNumber.trim() ? `${t('pricing.vat_label')} : ${vatNumber.trim()}` : null,
      `${t('pricing.email_label')} : ${email}`,
      phone ? `${t('pricing.phone_label')} : ${phone}` : null,
      message ? `\n${message}` : null,
    ].filter(Boolean) as string[];
    // Grid figures for the office — the SAME estimate the visitor saw.
    if (estimate && origin !== OTHER) {
      const est = gridEstimateLines(estimate, t, lang);
      if (est.length) msgLines.push('', ...est);
    }
    const body = msgLines.join('\n');

    setSubmitting(true);
    try {
      if (user) {
        const conv = await createConversation(subject);
        await sendMessage(conv.id, body);
      } else {
        const proof = await shield.getProof();
        const row = await guestCreateConversation({ email, name, subject, body, captcha: proof.captcha, hp: proof.hp });
        writeGuestToken(row.guest_token);
      }
      setSubmitted(true);
      toast.success(t('pricing.success_title'));
      trackEvent('generate_lead', { form: 'pricing', route_type: `${origin === OTHER ? 'other' : origin} → ${destination}`, mode, has_account: !!user });
    } catch (err) {
      console.error('[pricing] quote request failed', err);
      const key = submitErrorKey(err, '');
      toast.error(key ? t(key) : t('pricing.error_send', { email: supportEmail }));
    } finally {
      shield.reset();
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Ed page="pricing" field="page_title" as="h1" className="text-3xl font-bold text-luna-navy block">
            {pageTitle}
          </Ed>
          <Ed page="pricing" field="page_intro" as="p" multiline className="mt-3 text-slate-600 block">
            {pageIntro}
          </Ed>

          {/* The menu says "Tarifs": give the visitor who only wants an
              order of magnitude a one-click route to the calculator. */}
          <div className="mt-8 rounded-2xl bg-luna-gradient text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Calculator className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">{t('pricing.calc_card_title')}</h2>
              <p className="mt-1 text-sm text-white/90">{t('pricing.calc_card_body')}</p>
            </div>
            <Button asChild variant="brand" className="shrink-0">
              <Link to={urlFor('rateCalculator', lang)}>
                {t('pricing.calc_card_cta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {submitted ? (
            <div className="mt-8 grid gap-4">
              <div className="rounded-2xl border-2 border-luna-cyan bg-white p-8 text-center shadow-sm">
                <CheckCircle2 className="mx-auto h-10 w-10 text-luna-blue" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-semibold text-luna-navy">{t('pricing.success_title')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('pricing.success_body')}</p>
              </div>
              {!user && (
                <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-6">
                  <div className="flex items-start gap-3">
                    <UserPlus className="h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
                    <div>
                      <h2 className="font-semibold text-luna-navy">{t('pricing.account_cta_title')}</h2>
                      <ul className="mt-2 space-y-1 text-sm text-slate-700 list-disc pl-5">
                        <li>{t('pricing.account_cta_replies')}</li>
                        <li>{t('pricing.account_cta_tracking')}</li>
                        <li>{t('pricing.account_cta_reports')}</li>
                      </ul>
                      <p className="mt-2 text-xs text-slate-600">{t('pricing.account_cta_note')}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button asChild variant="navy" size="sm">
                          <Link to={urlFor('signup', lang)}>{t('pricing.account_cta_signup')}</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link to={urlFor('login', lang)}>{t('pricing.account_cta_login')}</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="relative mt-8 rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm grid gap-6">
              {!user && <FormShield shield={shield} />}
              {prefilled && (
                <p className="rounded-xl bg-luna-cyan/10 border border-luna-cyan/40 px-4 py-2.5 text-sm text-luna-navy">
                  {t('pricing.prefilled_banner')}
                </p>
              )}

              <fieldset className="grid gap-4">
                <legend className="text-sm font-semibold uppercase tracking-wide text-luna-blue mb-3">{t('pricing.section_route')}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="origin" className="text-luna-navy">{t('pricing.origin_label')}</Label>
                    <Select value={origin} onValueChange={setOrigin} required>
                      <SelectTrigger id="origin" className="mt-2">
                        <SelectValue placeholder={t('pricing.destination_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {ORIGIN_CITIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{lang === 'en' ? c.en : c.fr}</SelectItem>
                        ))}
                        <SelectItem value={OTHER}>{t('pricing.origin_other')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {origin === OTHER && (
                      <div className="mt-2">
                        <Label htmlFor="origin_other" className="sr-only">{t('pricing.origin_other_label')}</Label>
                        <Input
                          id="origin_other"
                          value={originOther}
                          onChange={(e) => setOriginOther(e.target.value)}
                          placeholder={t('pricing.origin_other_placeholder')}
                          required
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="destination" className="text-luna-navy">{t('pricing.destination_label')}</Label>
                    <Select value={destination} onValueChange={setDestination} required>
                      <SelectTrigger id="destination" className="mt-2">
                        <SelectValue placeholder={t('pricing.destination_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((c) => (
                          <SelectItem
                            key={c.id}
                            value={c.slug}
                            disabled={c.status !== 'active'}
                          >
                            {c.name}
                            {c.status !== 'active' && (
                              <span className="ml-2 text-xs text-slate-500">
                                — {t('pricing.destination_coming_soon')}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              <fieldset className="grid gap-4">
                <legend className="text-sm font-semibold uppercase tracking-wide text-luna-blue mb-3">{t('pricing.section_goods')}</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="mode" className="text-luna-navy">{t('pricing.mode_label')}</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                      <SelectTrigger id="mode" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">{t('pricing.mode_any')}</SelectItem>
                        <SelectItem value="air">{t('pricing.mode_air')}</SelectItem>
                        <SelectItem value="sea">{t('pricing.mode_sea')}</SelectItem>
                        <SelectItem value="ground">{t('pricing.mode_ground')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Colisage: one line per package (L × l × H + weight). The
                    volume is computed from the dimensions behind the scenes —
                    never typed nor shown here (only in the estimate, when it
                    drives the price). */}
                <div role="group" aria-labelledby="pkg-legend">
                  <p id="pkg-legend" className="text-sm font-medium text-luna-navy">{t('pricing.pkg_legend')}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t('pricing.pkg_hint')}</p>
                  <div className="mt-2 hidden sm:grid grid-cols-[4.5rem_repeat(4,minmax(0,1fr))_2.5rem] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500" aria-hidden="true">
                    <span />
                    <span>{t('pricing.dim_l')}</span><span>{t('pricing.dim_w')}</span><span>{t('pricing.dim_h')}</span>
                    <span>{t('pricing.pkg_weight')}</span><span />
                  </div>
                  <ol className="mt-1 space-y-2">
                    {lines.map((l, i) => {
                      const n = i + 1;
                      const field = (k: keyof TarifsLine, labelKey: string, placeholder: string) => (
                        <Input aria-label={`${t(labelKey)} — ${t('pricing.pkg_line', { n })}`} placeholder={placeholder}
                          type="number" min="0" step="any" inputMode="decimal" value={l[k]}
                          onChange={(e) => updateLine(i, { [k]: e.target.value })} className="text-center" />
                      );
                      return (
                        <li key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_2.5rem] sm:grid-cols-[4.5rem_repeat(4,minmax(0,1fr))_2.5rem] items-center gap-2">
                          <span className="col-span-5 sm:col-span-1 text-xs font-semibold text-luna-navy">{t('pricing.pkg_line', { n })}</span>
                          {field('length', 'calc.dim_length', t('pricing.dim_l'))}
                          {field('width', 'calc.dim_width', t('pricing.dim_w'))}
                          {field('height', 'calc.dim_height', t('pricing.dim_h'))}
                          {field('weight', 'pricing.pkg_weight', 'kg')}
                          <Button type="button" variant="ghost" size="sm" className="h-10 px-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            disabled={lines.length === 1}
                            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                            aria-label={t('pricing.pkg_remove', { n })} title={t('pricing.pkg_remove', { n })}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyTarifsLine()])}>
                      <Plus className="h-4 w-4" aria-hidden="true" />{t('pricing.pkg_add')}
                    </Button>
                    {size.used > 0 && (
                      <p className="text-sm text-slate-700 tabular-nums" aria-live="polite">
                        {t('pricing.pkg_totals', {
                          count: size.used,
                          weight: size.totalWeightKg != null ? `${fmtNum(size.totalWeightKg, 3)} kg` : '—',
                        })}
                      </p>
                    )}
                  </div>
                  {size.used > 0 && (size.missingWeight || size.missingDims) && (
                    <p className="mt-1 text-xs text-amber-800">
                      {size.missingWeight ? t('pricing.pkg_missing_weight') : t('pricing.pkg_missing_dims')}
                    </p>
                  )}
                </div>

                {estimate && <EstimatePanel estimate={estimate} mode={mode} lang={lang} volumeM3={shownVolumeM3} />}
              </fieldset>

              <fieldset className="grid gap-4">
                <legend className="text-sm font-semibold uppercase tracking-wide text-luna-blue mb-3">{t('pricing.section_contact')}</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="name" className="text-luna-navy">{t('pricing.name_label')}</Label>
                    <Input id="name" name="name" autoComplete="name" required className="mt-2" />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-luna-navy">{t('pricing.email_label')}</Label>
                    <Input id="email" name="email" type="email" autoComplete="email" required className="mt-2" />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-luna-navy">{t('pricing.phone_label')}</Label>
                    <Input id="phone" name="phone" type="tel" autoComplete="tel" className="mt-2" />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer w-fit">
                  <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)}
                    className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
                  {t('pricing.business_toggle')}
                </label>
                {isBusiness && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="company" className="text-luna-navy">{t('pricing.company_label')}</Label>
                      <Input id="company" autoComplete="organization" value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)} className="mt-2" />
                    </div>
                    <div>
                      <Label htmlFor="vat" className="text-luna-navy">{t('pricing.vat_label')}</Label>
                      <Input id="vat" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)}
                        placeholder={t('pricing.vat_placeholder')} className="mt-2" />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="message" className="text-luna-navy">{t('pricing.message_label')}</Label>
                  <Textarea id="message" name="message" rows={4} className="mt-2" />
                </div>
              </fieldset>

              <div>
                <Button type="submit" variant="navy" size="lg" disabled={submitting}>
                  {submitting ? t('pricing.sending') : t('pricing.submit')}
                </Button>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-luna-blue" aria-hidden="true" />
                    <span>{t('pricing.response_time_note')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-luna-blue" aria-hidden="true" />
                    <span>{t('pricing.privacy_note')}</span>
                  </li>
                </ul>
              </div>
            </form>
          )}

          {/* Customs clearance — part of the service; below the form so it
              never interrupts filling it in. Editable like the intro. */}
          <section className="mt-10 rounded-2xl border-2 border-amber-500 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <FileCheck2 className="h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <Ed page="pricing" field="customs_title" as="h2" className="text-lg font-semibold text-luna-navy block">
                  {t('pricing.customs_title')}
                </Ed>
                <Ed page="pricing" field="customs_body" as="p" multiline className="mt-2 text-sm leading-relaxed text-slate-700 block">
                  {t('pricing.customs_body')}
                </Ed>
              </div>
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

/** Compact live estimate from the public grid, for the modes the visitor
 *  asked about. Indicative — the agency's quote confirms the price. */
function EstimatePanel({ estimate, mode, lang, volumeM3 }: {
  estimate: QuoteResponse; mode: Mode; lang: 'fr' | 'en'; volumeM3: number | null;
}) {
  const { t } = useTranslation();
  const modes = GRID_MODES[mode];
  // The volume is only worth showing when it changes the price: an air
  // estimate billed on volumetric weight (volumetric > actual weight).
  const volumetric = modes
    .map((m) => estimate[m])
    .find((r) => r.kind === 'price' && r.chargeableBasis === 'volumetric' && r.volumetricWeightKg != null);
  return (
    <div className="rounded-xl border border-luna-blue/25 bg-luna-blue/5 p-4" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-luna-blue">{t('pricing.estimate_title')}</p>
      {modes.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">{t('pricing.estimate_ground')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-luna-blue/10">
          {modes.map((m) => {
            const r = estimate[m];
            return (
              <li key={m} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="text-luna-navy">{t(`calc.mode_${m}`)}</span>
                {r.kind === 'price' && (
                  <span className="font-semibold tabular-nums text-luna-navy">{formatEuros(r.totalCents, lang)}</span>
                )}
                {r.kind === 'quote' && (
                  <span className="text-right text-xs text-slate-600">
                    <span className="font-medium">{t('grid_estimate.sur_devis')}</span> — {t(`calc.quote_reason_${r.reason}`)}
                  </span>
                )}
                {r.kind === 'empty' && (
                  <span className="text-right text-xs text-slate-500">{t(m === 'sea' ? 'calc.empty_sea' : 'calc.empty_air')}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {volumetric && volumetric.kind === 'price' && volumeM3 != null && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700">
          {t('pricing.estimate_volumetric', {
            volume: fmtNum(volumeM3, 4),
            vw: fmtNum(volumetric.volumetricWeightKg ?? 0, 2),
            w: fmtNum(volumetric.actualWeightKg, 2),
          })}
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{t('pricing.estimate_note')}</p>
    </div>
  );
}
