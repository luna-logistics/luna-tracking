import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Phone, Mail, MessageCircle, Instagram, MapPin, Clock, ShieldCheck,
  Building2, ArrowRight, ChevronDown, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Ed } from '@/components/Ed';
import { useContent } from '@/contexts/SiteContentContext';
import { urlFor } from '@/lib/url/routes';
import { useLegalIdentity } from '@/hooks/useLegalIdentity';
import { guestCreateConversation, writeGuestToken } from '@/lib/support-chat';
import {
  contactData, computeOpeningStatus, kinshasaWindow, brusselsWindow,
  formatHour, weekdayName, OPEN_HOUR,
} from '@/lib/contact-data';

/**
 * Contact — content rewrite + three new behaviours over the existing live page
 * (brief-claude-design-luna-contact.md, "Contact Luna" handoff, 2026-09-14):
 *   1. a hero intent router (6 expandable options),
 *   2. a real contact form (subject preselected from the hero; tracking number
 *      required only for "Envoi en cours" / "Réclamation"), and
 *   3. a live, timezone-correct opening-hours status (Brussels + Kinshasa).
 *
 * It reuses everything already in place: PublicLayout shell, the shared SEO +
 * global HreflangTags, the URL registry, useContent/<Ed> admin-editable copy,
 * useLegalIdentity, and the existing support-chat backend for submissions
 * (guest_create_support_conversation → admin support inbox + email). No new
 * table or edge function. Editorial content lives in lib/contact-data.ts,
 * chrome in the `contact.*` i18n keys. Values still unconfirmed (WhatsApp,
 * per-channel delays, chat hours, office drop-off) are omitted, never invented.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INSTAGRAM = 'https://www.instagram.com/Luna_TrackingLogistics/';

export default function Contact() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const data = useMemo(() => contactData(lang), [lang]);
  const legal = useLegalIdentity();

  const metaTitle = useContent('contact', 'meta_title', t('contact.meta_title'));
  const metaDescription = useContent('contact', 'meta_description', t('contact.meta_description'));
  const pageTitle = useContent('contact', 'page_title', t('contact.page_title'));
  const pageIntro = useContent('contact', 'page_intro', t('contact.page_intro'));
  const phone = useContent('contact', 'phone', t('contact.phone')).trim();
  const email = t('footer.email');

  const [params] = useSearchParams();
  // Deep link (?objet=…) accepts either a hero intent id (opens its panel and
  // preselects its subject) or a form subject id (preselects that subject).
  // Unknown values are ignored silently.
  const deepValue = params.get('objet') ?? '';
  const deepIntent = data.intents.find((i) => i.id === deepValue);
  const deepSubject = data.subjects.find((s) => s.id === deepValue);
  const deepSubjectId = deepIntent?.subjectId ?? deepSubject?.id ?? '';

  // ── Behaviour 3: live clock, refreshed every 30s (no full re-render churn) ──
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const status = useMemo(() => computeOpeningStatus(clock), [clock]);
  const kinshasa = useMemo(() => kinshasaWindow(clock), [clock]);

  // ── Behaviour 1: intent router ──
  const [openIntent, setOpenIntent] = useState<string>(deepIntent ? deepIntent.id : '');

  // ── Behaviour 2: form ──
  const [subjectId, setSubjectId] = useState<string>(deepSubjectId);
  const [activeIntent, setActiveIntent] = useState<string>(deepIntent?.id ?? '');
  const [tracking, setTracking] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState(''); // honeypot
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [reference, setReference] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [showMap, setShowMap] = useState(false);

  const formRef = useRef<HTMLElement>(null);
  const subjectRef = useRef<HTMLSelectElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const selectedSubject = data.subjects.find((s) => s.id === subjectId);
  const needsRef = !!selectedSubject?.needsRef;

  useEffect(() => { if (sent) successRef.current?.focus(); }, [sent]);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => subjectRef.current?.focus(), 350);
  };

  const changeSubject = (id: string) => {
    setSubjectId(id);
    setTracking('');
    setErrors((e) => ({ ...e, tracking: false }));
  };

  const chooseSubjectFromIntent = (intentId: string, subjId: string) => {
    setActiveIntent(intentId);
    changeSubject(subjId);
    scrollToForm();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (company.trim()) return; // honeypot tripped
    const errs: Record<string, boolean> = {};
    if (!subjectId) errs.subject = true;
    if (needsRef && !tracking.trim()) errs.tracking = true;
    if (!message.trim()) errs.message = true;
    if (!name.trim()) errs.name = true;
    if (!EMAIL_RE.test(emailInput.trim())) errs.email = true;
    if (!consent) errs.consent = true;
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = ['subject', 'tracking', 'message', 'name', 'email', 'consent'].find((k) => errs[k]);
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const subjectLabel = selectedSubject?.label ?? t('contact.f_subject_label');
      const lines = [message.trim()];
      const extra: string[] = [];
      if (needsRef && tracking.trim()) extra.push(`${t('contact.f_tracking_label')} : ${tracking.trim()}`);
      if (location) extra.push(`${t('contact.f_location_label')} ${location}`);
      if (formPhone.trim()) extra.push(`${t('contact.f_phone_label')} : ${formPhone.trim()}`);
      if (activeIntent) extra.push(`(${activeIntent})`);
      const body = extra.length ? `${lines[0]}\n\n— ${extra.join('\n— ')}` : lines[0];

      const { conversation_id, guest_token } = await guestCreateConversation({
        email: emailInput.trim(),
        name: name.trim(),
        subject: subjectLabel,
        body,
      });
      writeGuestToken(guest_token);
      setReplyEmail(emailInput.trim());
      setReference(conversation_id.replace(/-/g, '').slice(0, 8).toUpperCase());
      setSent(true);
    } catch {
      setErrors({ submit: true });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSent(false); setReference(''); setReplyEmail('');
    setSubjectId(''); setActiveIntent(''); setTracking(''); setMessage('');
    setName(''); setEmailInput(''); setFormPhone(''); setLocation(''); setConsent(false); setErrors({});
  };

  // Reopen / status wording.
  const statusText = (() => {
    if (status.open) return t('contact.status_open');
    const time = formatHour(status.reopenHour);
    if (status.reopenOffset === 0) return t('contact.reopen_today', { time });
    if (status.reopenOffset === 1) return t('contact.reopen_tomorrow', { time });
    if (status.reopenOffset >= 2) return t('contact.reopen_day', { day: weekdayName(status.reopenWeekday, lang), time });
    return t('contact.reopen_generic');
  })();

  const legalRows = [
    { label: t('contact.legal_label_name'), value: legal.companyName },
    { label: t('contact.legal_label_form'), value: legal.legalForm },
    { label: t('contact.legal_label_office'), value: legal.registeredOffice },
    { label: t('contact.legal_label_number'), value: legal.companyNumber },
    { label: t('contact.legal_label_vat'), value: legal.vatNumber },
  ].filter((r) => (r.value ?? '').toString().trim().length > 0);

  const jsonLd = useMemo(() => {
    const obj: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Luna Tracking Logistics',
      url: `https://lunatrackinglogistics.com${urlFor('contact', lang)}`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Rue de l’Automne 59',
        postalCode: '1050',
        addressLocality: 'Ixelles',
        addressRegion: 'Bruxelles-Capitale',
        addressCountry: 'BE',
      },
      telephone: '+3222419672',
      email,
      sameAs: [INSTAGRAM],
      openingHoursSpecification: [{
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: `${String(OPEN_HOUR).padStart(2, '0')}:00`,
        closes: `${String(18).padStart(2, '0')}:00`,
      }],
      contactPoint: [{
        '@type': 'ContactPoint',
        telephone: '+3222419672',
        contactType: 'customer service',
        availableLanguage: ['fr', 'en'],
        areaServed: ['BE', 'CD'],
      }],
    };
    return obj;
  }, [lang, email]);

  const mapsQuery = encodeURIComponent(t('contact.office_address'));

  // Shared class fragments.
  const ringLight = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-luna-royal';
  const ringDark = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-luna-ink focus-visible:ring-luna-aqua';
  const wrap = 'mx-auto max-w-[1120px] px-5 sm:px-8';
  const H2 = 'text-[clamp(24px,3vw,32px)] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink';
  const inputCls = `w-full rounded-lg border border-luna-hair/40 bg-white px-3.5 py-3 text-[15px] text-luna-ink outline-none transition-colors hover:border-luna-azure focus:border-luna-azure ${ringLight}`;
  const iconFor: Record<string, typeof Phone> = { phone: Phone, email: Mail, chat: MessageCircle, instagram: Instagram };

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── 1. Hero + intent router ── */}
      <section style={{ background: 'linear-gradient(135deg,#0A1650 0%,#0D2E6B 62%,#123A7E 100%)' }}>
        <div className={wrap} style={{ paddingTop: 'clamp(44px,6vw,84px)', paddingBottom: 'clamp(40px,5vw,72px)' }}>
          <Ed page="contact" field="page_title" as="h1" className="block max-w-[20em] text-[clamp(30px,4.4vw,48px)] font-semibold leading-[1.1] tracking-[-.015em] text-white">
            {pageTitle}
          </Ed>
          <Ed page="contact" field="page_intro" as="p" className="mt-4 block max-w-[36em] text-[17px] leading-[1.65] text-[#D7E4F5]">
            {pageIntro}
          </Ed>

          <p className="mt-8 text-[13px] font-medium uppercase tracking-[.08em] text-luna-aqua2">{t('contact.hero_prompt')}</p>
          <ul className="mt-3 space-y-2.5">
            {data.intents.map((intent) => {
              const isOpen = openIntent === intent.id;
              const panelId = `intent-panel-${intent.id}`;
              return (
                <li key={intent.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIntent((cur) => (cur === intent.id ? '' : intent.id))}
                    className={`flex w-full items-center justify-between gap-3 rounded-[12px] border px-5 py-4 text-left text-[16px] font-medium transition-colors ${ringDark} ${
                      isOpen ? 'border-luna-aqua bg-luna-ink/70 text-white' : 'border-[#4A6FA0]/70 bg-luna-ink/40 text-[#E4ECF8] hover:border-luna-sky hover:bg-luna-ink/60'
                    }`}
                  >
                    <span>{intent.label}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-luna-aqua transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <div id={panelId} role="region" hidden={!isOpen} className="mt-2 rounded-[12px] border-l-2 border-luna-aqua bg-luna-ink/45 p-5">
                    {intent.body.map((para, i) => (
                      <p key={i} className="mb-2.5 text-[15px] leading-[1.6] text-[#CDD9EE] last:mb-0">{para}</p>
                    ))}
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {intent.actions.map((a, i) => {
                        const cls = a.kind === 'primary'
                          ? `inline-flex items-center gap-1.5 rounded-full bg-luna-aqua px-4 py-2 text-[14px] font-semibold text-luna-ink2 hover:bg-luna-aqua2 ${ringDark}`
                          : `inline-flex items-center gap-1.5 rounded-full border border-luna-sky/70 px-4 py-2 text-[14px] font-semibold text-luna-aqua2 hover:border-luna-aqua ${ringDark}`;
                        if (a.route) {
                          const to = urlFor(a.route as never, lang) + (a.hash ? `#${a.hash}` : '');
                          return <Link key={i} to={to} className={cls}>{a.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>;
                        }
                        if (a.href) return <a key={i} href={a.href} className={cls}>{a.label}</a>;
                        return (
                          <button key={i} type="button" onClick={() => chooseSubjectFromIntent(intent.id, a.subjectId!)} className={cls}>
                            {a.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── 2. Quick answers ── */}
      <section className="bg-white">
        <div className={wrap} style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(24px,3vw,40px)' }}>
          <h2 className={H2}>{t('contact.quick_title')}</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {data.quickAnswers.map((qa, i) => {
              const to = urlFor(qa.route as never, lang) + (qa.hash ? `#${qa.hash}` : '');
              return (
                <div key={i} className="border-t border-luna-hair/25 pt-4">
                  <dt className="text-[16px] font-semibold text-luna-ink">{qa.q}</dt>
                  <dd className="mt-1 text-[15px] leading-[1.6] text-luna-body">
                    {qa.a}{' '}
                    <Link to={to} className={`inline-flex items-center gap-1 font-medium text-luna-azure hover:underline ${ringLight}`}>
                      {qa.link}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      {/* ── 3. Channels ── */}
      <section className="bg-luna-mist">
        <div className={wrap} style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(40px,5vw,64px)' }}>
          <h2 className={H2}>{t('contact.channels_title')}</h2>

          <table className="mt-6 hidden w-full border-collapse text-left md:table">
            <thead>
              <tr className="border-b border-luna-hair/40 text-[12px] uppercase tracking-[.06em] text-luna-muted-ink">
                <th className="py-2 pr-4 font-semibold">{t('contact.th_channel')}</th>
                <th className="py-2 pr-4 font-semibold">{t('contact.th_use')}</th>
                <th className="py-2 font-semibold">{t('contact.th_delay')}</th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((ch) => {
                const Icon = iconFor[ch.id] ?? Mail;
                return (
                  <tr key={ch.id} className="border-b border-luna-hair/20 align-top">
                    <td className="py-4 pr-4">
                      <div className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-luna-azure" aria-hidden="true" />
                        <div>
                          <div className="text-[13px] font-semibold text-luna-ink">{ch.name}</div>
                          {ch.href
                            ? <a href={ch.href} target={ch.external ? '_blank' : undefined} rel={ch.external ? 'noopener noreferrer' : undefined} className={`text-[14px] font-medium text-luna-azure hover:underline ${ringLight}`}>{ch.value}</a>
                            : <span className="text-[14px] text-luna-body">{ch.value}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-[14px] leading-[1.55] text-luna-body">{ch.use}</td>
                    <td className="py-4 text-[14px] text-luna-body">{ch.delay || <span className="text-luna-muted-ink/40" aria-hidden="true">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile stacked list — never a horizontally scrolling table (brief §9) */}
          <ul className="mt-6 space-y-3 md:hidden">
            {data.channels.map((ch) => {
              const Icon = iconFor[ch.id] ?? Mail;
              return (
                <li key={ch.id} className="rounded-[12px] border border-luna-hair/40 bg-white p-4">
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-luna-azure" aria-hidden="true" />
                    <span className="text-[14px] font-semibold text-luna-ink">{ch.name}</span>
                  </div>
                  <div className="mt-1.5">
                    {ch.href
                      ? <a href={ch.href} target={ch.external ? '_blank' : undefined} rel={ch.external ? 'noopener noreferrer' : undefined} className={`text-[15px] font-medium text-luna-azure hover:underline ${ringLight}`}>{ch.value}</a>
                      : <span className="text-[15px] text-luna-body">{ch.value}</span>}
                  </div>
                  <p className="mt-2 text-[14px] leading-[1.55] text-luna-body">{ch.use}</p>
                  {ch.delay && <p className="mt-1 text-[13px] text-luna-muted-ink">{ch.delay}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── 4. Form ── */}
      <section ref={formRef} id="contact-form" className="scroll-mt-24 bg-white">
        <div className={wrap} style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(40px,5vw,64px)' }}>
          <div className="mx-auto max-w-[680px] rounded-[16px] border border-luna-hair/30 bg-white p-6 shadow-[0_2px_24px_rgba(10,22,80,.06)] sm:p-8">
            <h2 className={H2}>{t('contact.form_title')}</h2>
            <p className="mt-2 text-[15px] leading-[1.6] text-luna-body">{t('contact.form_intro')}</p>

            {sent ? (
              <div ref={successRef} role="status" tabIndex={-1} className={`mt-6 rounded-[14px] border border-emerald-200 bg-emerald-50 p-6 ${ringLight}`}>
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[18px] font-semibold">{t('contact.success_title')}</span>
                </div>
                <p className="mt-2 text-[15px] leading-[1.6] text-luna-body">
                  {t('contact.success_body', { ref: reference, email: replyEmail })}
                </p>
                <button type="button" onClick={resetForm} className={`mt-5 inline-flex items-center gap-1.5 rounded-full border border-luna-azure px-4 py-2 text-[14px] font-semibold text-luna-azure hover:bg-luna-azure hover:text-white ${ringLight}`}>
                  {t('contact.success_new')}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="mt-6 space-y-5">
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
                  <label htmlFor="f-company">Company</label>
                  <input id="f-company" name="company" type="text" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>

                <div>
                  <label htmlFor="f-subject" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_subject_label')}</label>
                  <div className="relative">
                    <select id="f-subject" ref={subjectRef} value={subjectId} onChange={(e) => changeSubject(e.target.value)}
                      aria-invalid={!!errors.subject} aria-describedby={errors.subject ? 'e-subject' : undefined}
                      className={`${inputCls} appearance-none pr-10 ${errors.subject ? 'border-red-400' : ''}`}>
                      <option value="">{t('contact.f_subject_placeholder')}</option>
                      {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-luna-azure" aria-hidden="true" />
                  </div>
                  {errors.subject && <p id="e-subject" className="mt-1 text-[13px] text-red-600">{t('contact.f_subject_placeholder')}</p>}
                </div>

                {needsRef && (
                  <div>
                    <label htmlFor="f-tracking" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_tracking_label')}</label>
                    <input id="f-tracking" type="text" value={tracking} onChange={(e) => setTracking(e.target.value)}
                      aria-invalid={!!errors.tracking} aria-describedby={errors.tracking ? 'e-tracking' : 'h-tracking'}
                      className={`${inputCls} ${errors.tracking ? 'border-red-400' : ''}`} />
                    <p id="h-tracking" className="mt-1 text-[13px] text-luna-muted-ink">{t('contact.f_tracking_help')}</p>
                    {errors.tracking && <p id="e-tracking" className="mt-1 text-[13px] text-red-600">{t('contact.f_tracking_error')}</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="f-message" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_message_label')}</label>
                  <textarea id="f-message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
                    aria-invalid={!!errors.message} aria-describedby={selectedSubject ? 'h-message' : (errors.message ? 'e-message' : undefined)}
                    className={`${inputCls} resize-y ${errors.message ? 'border-red-400' : ''}`} />
                  {selectedSubject && <p id="h-message" className="mt-1 text-[13px] text-luna-muted-ink">{selectedSubject.hint}</p>}
                  {errors.message && <p id="e-message" className="mt-1 text-[13px] text-red-600">{t('contact.f_message_error')}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-name" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_name_label')}</label>
                    <input id="f-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
                      aria-invalid={!!errors.name} aria-describedby={errors.name ? 'e-name' : undefined}
                      className={`${inputCls} ${errors.name ? 'border-red-400' : ''}`} />
                    {errors.name && <p id="e-name" className="mt-1 text-[13px] text-red-600">{t('contact.f_name_error')}</p>}
                  </div>
                  <div>
                    <label htmlFor="f-email" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_email_label')}</label>
                    <input id="f-email" type="email" autoComplete="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                      aria-invalid={!!errors.email} aria-describedby={errors.email ? 'e-email' : undefined}
                      className={`${inputCls} ${errors.email ? 'border-red-400' : ''}`} />
                    {errors.email && <p id="e-email" className="mt-1 text-[13px] text-red-600">{t('contact.f_email_error')}</p>}
                  </div>
                  <div>
                    <label htmlFor="f-phone" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_phone_label')}</label>
                    <input id="f-phone" type="tel" autoComplete="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className={inputCls} aria-describedby="h-phone" />
                    <p id="h-phone" className="mt-1 text-[13px] text-luna-muted-ink">{t('contact.f_phone_help')}</p>
                  </div>
                  <div>
                    <label htmlFor="f-location" className="mb-1.5 block text-[14px] font-medium text-luna-ink">{t('contact.f_location_label')}</label>
                    <div className="relative">
                      <select id="f-location" value={location} onChange={(e) => setLocation(e.target.value)} className={`${inputCls} appearance-none pr-10`}>
                        <option value="">{t('contact.f_location_placeholder')}</option>
                        {data.places.map((p, i) => <option key={i} value={p}>{p}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-luna-azure" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-start gap-2.5 text-[14px] leading-[1.5] text-luna-body">
                    <input id="f-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                      aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'e-consent' : undefined}
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded border-luna-hair text-luna-azure ${ringLight}`} />
                    <span>{t('contact.f_consent_label')}</span>
                  </label>
                  {errors.consent && <p id="e-consent" className="mt-1 text-[13px] text-red-600">{t('contact.f_consent_error')}</p>}
                </div>

                {errors.submit && <p role="alert" className="text-[14px] text-red-600">{t('common.error_generic')}</p>}

                <button type="submit" disabled={submitting}
                  className={`inline-flex items-center gap-2 rounded-full bg-luna-royal px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-luna-azure disabled:opacity-60 ${ringLight}`}>
                  {submitting ? t('contact.f_sending') : t('contact.f_submit')}
                  {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── 5 + 6. Office/map + hours ── */}
      <section className="bg-luna-mist">
        <div className={`${wrap} grid gap-8 lg:grid-cols-2`} style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(40px,5vw,64px)' }}>
          <div>
            <h2 className={H2}>{t('contact.office_title')}</h2>
            <div className="mt-4 flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-luna-azure" aria-hidden="true" />
              <div>
                <p className="text-[15px] font-medium text-luna-ink">{t('contact.office_address')}</p>
                <p className="mt-1 text-[14px] text-luna-body">{t('contact.office_note')}</p>
                <a href={`https://www.google.com/maps?q=${mapsQuery}`} target="_blank" rel="noopener noreferrer"
                  className={`mt-2 inline-flex items-center gap-1 text-[14px] font-medium text-luna-azure hover:underline ${ringLight}`}>
                  {t('contact.map_open')}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-[14px] border border-luna-hair/40 bg-white">
              {showMap ? (
                <iframe title={t('contact.map_alt')} src={`https://www.google.com/maps?q=${mapsQuery}&output=embed`}
                  className="h-[280px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <button type="button" onClick={() => setShowMap(true)}
                  className={`flex h-[280px] w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#EAF1FB,#F4F7FB)] ${ringLight}`}>
                  <MapPin className="h-8 w-8 text-luna-azure" aria-hidden="true" />
                  <span className="rounded-full bg-luna-royal px-5 py-2.5 text-[14px] font-semibold text-white">{t('contact.map_button')}</span>
                  <span className="max-w-[24em] px-4 text-center text-[12px] leading-[1.5] text-luna-muted-ink">{t('contact.map_hint')}</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <h2 className={H2}>{t('contact.hours_when_title')}</h2>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
              style={status.open
                ? { color: '#12855F', background: '#E8F6F0', border: '1px solid #12855F' }
                : { color: '#4A5A75', background: '#F6F8FB', border: '1px solid #D9E2EC' }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: status.open ? '#12855F' : '#4A5A75' }} aria-hidden="true" />
              {statusText}
            </div>

            <dl className="mt-5 space-y-4">
              <div className="rounded-[12px] border border-luna-hair/40 bg-white p-4">
                <dt className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.05em] text-luna-muted-ink">
                  <Clock className="h-4 w-4 text-luna-azure" aria-hidden="true" />{t('contact.hours_days_label')}
                </dt>
                <dd className="mt-2 flex items-baseline justify-between gap-4">
                  <span className="text-[15px] font-medium text-luna-ink">{brusselsWindow()}</span>
                  <span className="text-[13px] text-luna-muted-ink">{t('contact.hours_brussels')}</span>
                </dd>
                <dd className="mt-1 flex items-baseline justify-between gap-4">
                  <span className="text-[15px] font-medium text-luna-ink">{kinshasa}</span>
                  <span className="text-[13px] text-luna-muted-ink">{t('contact.hours_kinshasa')}</span>
                </dd>
              </div>
              <p className="text-[14px] text-luna-body">{t('contact.hours_closed_note')}</p>
              <p className="text-[13px] leading-[1.55] text-luna-muted-ink">{t('contact.hours_tz_note')}</p>
            </dl>
          </div>
        </div>
      </section>

      {/* ── 7. Anti-fraud / trust ── */}
      <section className="bg-white">
        <div className={wrap} style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(40px,5vw,64px)' }}>
          <div className="mx-auto max-w-[820px]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-luna-azure" aria-hidden="true" />
              <h2 className={H2}>{t('contact.trust_title')}</h2>
            </div>
            <ul className="mt-5 space-y-3">
              {data.trust.map((b, i) => (
                <li key={i} className="flex items-start gap-3 rounded-[12px] border border-luna-hair/40 bg-luna-mist/60 p-4 text-[15px] leading-[1.6] text-luna-body">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-luna-azure" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 8. Business ── */}
      <section style={{ background: 'linear-gradient(135deg,#0A1650 0%,#0D2E6B 100%)' }}>
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-6`} style={{ paddingTop: 'clamp(40px,5vw,64px)', paddingBottom: 'clamp(40px,5vw,64px)' }}>
          <div className="min-w-0 max-w-[38em]">
            <div className="flex items-center gap-2.5">
              <Building2 className="h-6 w-6 text-luna-aqua" aria-hidden="true" />
              <h2 className="text-[clamp(24px,3vw,32px)] font-semibold leading-[1.2] tracking-[-.01em] text-white">{t('contact.business_title')}</h2>
            </div>
            <p className="mt-3 text-[16px] leading-[1.65] text-[#D7E4F5]">{t('contact.business_body')}</p>
            <Link to={urlFor('apiDocs', lang)} className={`mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-luna-aqua2 hover:underline ${ringDark}`}>
              {t('contact.business_tools')}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <button type="button" onClick={() => chooseSubjectFromIntent('entreprise', 'entreprise')}
            className={`inline-flex items-center gap-2 rounded-full bg-luna-aqua px-6 py-3 text-[15px] font-semibold text-luna-ink2 hover:bg-luna-aqua2 ${ringDark}`}>
            {t('contact.business_cta')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* ── 9. Legal identity — only the fields that are filled ── */}
      {legalRows.length > 0 && (
        <section className="bg-luna-mist">
          <div className={wrap} style={{ paddingTop: 'clamp(32px,4vw,52px)', paddingBottom: 'clamp(32px,4vw,52px)' }}>
            <h2 className={H2}>{t('contact.legal_title')}</h2>
            <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">
              {legalRows.map((r) => (
                <div key={r.label} className="flex flex-wrap gap-2 text-[14px]">
                  <dt className="font-semibold text-luna-ink">{r.label} :</dt>
                  <dd className="text-luna-body">{r.value}</dd>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 text-[14px]">
                <dt className="font-semibold text-luna-ink">{t('contact.legal_label_email')} :</dt>
                <dd><a href={`mailto:${email}`} className={`text-luna-azure hover:underline ${ringLight}`}>{email}</a></dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
              <Link to={urlFor('terms', lang)} className={`text-luna-azure hover:underline ${ringLight}`}>{t('contact.legal_terms')}</Link>
              <Link to={urlFor('privacy', lang)} className={`text-luna-azure hover:underline ${ringLight}`}>{t('contact.legal_privacy')}</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
