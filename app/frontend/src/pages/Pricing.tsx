import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Calculator, ArrowRight, Clock, ShieldCheck } from 'lucide-react';
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
import {
  createConversation, sendMessage, guestCreateConversation, writeGuestToken,
} from '@/lib/support-chat';

/**
 * Quote request page (/tarifs).
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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Controlled fields — needed to compose the request body + subject.
  const prefilled = searchParams.has('weight') || searchParams.has('volume') || searchParams.has('mode') || searchParams.has('from');
  const fromParam = searchParams.get('from');
  const [origin, setOrigin] = useState<string>(fromParam && fromParam !== 'BE' ? OTHER : '');
  const [originOther, setOriginOther] = useState('');
  const [destination, setDestination] = useState('');
  const [weight, setWeight] = useState(searchParams.get('weight') ?? '');
  const [volume, setVolume] = useState(searchParams.get('volume') ?? '');
  const [mode, setMode] = useState<Mode>(modeFromParam(searchParams.get('mode')));

  useEffect(() => {
    fetchDestinationCities().then(setCities);
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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const message = String(form.get('message') ?? '').trim();
    if (!originLabel || !destinationLabel || !email) return;

    const subject = t('pricing.request_subject', { origin: originLabel, destination: destinationLabel });
    const lines = [
      `${t('pricing.origin_label')} : ${originLabel}`,
      `${t('pricing.destination_label')} : ${destinationLabel}`,
      weight ? `${t('pricing.weight_label')} : ${weight}` : null,
      volume ? `${t('pricing.volume_label')} : ${volume}` : null,
      `${t('pricing.mode_label')} : ${modeLabel(mode)}`,
      `${t('pricing.name_label')} : ${name}`,
      `${t('pricing.email_label')} : ${email}`,
      phone ? `${t('pricing.phone_label')} : ${phone}` : null,
      message ? `\n${message}` : null,
    ].filter(Boolean);
    const body = lines.join('\n');

    setSubmitting(true);
    try {
      if (user) {
        const conv = await createConversation(subject);
        await sendMessage(conv.id, body);
      } else {
        const row = await guestCreateConversation({ email, name, subject, body });
        writeGuestToken(row.guest_token);
      }
      setSubmitted(true);
      toast.success(t('pricing.success_title'));
      trackEvent('generate_lead', { form: 'pricing', route_type: `${origin === OTHER ? 'other' : origin} → ${destination}`, mode, has_account: !!user });
    } catch (err) {
      console.error('[pricing] quote request failed', err);
      toast.error(t('pricing.error_send', { email: supportEmail }));
    } finally {
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
            <div className="mt-8 rounded-2xl border-2 border-luna-cyan bg-white p-8 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-10 w-10 text-luna-blue" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-semibold text-luna-navy">{t('pricing.success_title')}</h2>
              <p className="mt-2 text-sm text-slate-600">{t('pricing.success_body')}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm grid gap-5">
              {prefilled && (
                <p className="rounded-xl bg-luna-cyan/10 border border-luna-cyan/40 px-4 py-2.5 text-sm text-luna-navy">
                  {t('pricing.prefilled_banner')}
                </p>
              )}

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

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="weight" className="text-luna-navy">{t('pricing.weight_label')}</Label>
                  <Input id="weight" name="weight" type="number" min="0" step="0.1" value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder={t('pricing.weight_placeholder')} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="volume" className="text-luna-navy">{t('pricing.volume_label')}</Label>
                  <Input id="volume" name="volume" type="number" min="0" step="0.01" value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder={t('pricing.volume_placeholder')} className="mt-2" />
                </div>
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

              <div>
                <Label htmlFor="message" className="text-luna-navy">{t('pricing.message_label')}</Label>
                <Textarea id="message" name="message" rows={4} className="mt-2" />
              </div>

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
        </div>
      </section>
    </>
  );
}
