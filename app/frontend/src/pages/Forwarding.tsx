import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plane, ArrowRight, Plus, Minus, Ban, Paperclip } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { useContent, useSiteImage } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { toast } from '@/components/ui/sonner';
import { urlFor } from '@/lib/url/routes';
import { submitForwardingRequest } from '@/lib/forwarding';
import { reexpData } from '@/lib/reexpedition-data';

/**
 * Réexpédition — "Reexpedition Luna" redesign from Claude Design (2026-09-14),
 * rebuilt on the live stack. Interactive route selector, filterable case
 * studies, comparison table, glossary, FAQ accordion, and a rich quote form
 * that still submits through the real backend (submitForwardingRequest →
 * /admin/demandes-reexpedition). Structural copy is i18n + admin-editable
 * (forwarding.*); the long-form editorial content is bilingual data in
 * lib/reexpedition-data.ts.
 */
export default function Forwarding() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const data = useMemo(() => reexpData(lang), [lang]);

  const metaTitle       = useContent('forwarding', 'meta_title',       t('forwarding.meta_title'));
  const metaDescription = useContent('forwarding', 'meta_description', t('forwarding.meta_description'));
  const pageTitle       = useContent('forwarding', 'page_title',       t('forwarding.page_title'));
  const pageIntro       = useContent('forwarding', 'intro',            t('forwarding.intro'));
  const ogImage         = useSiteImage('forwarding_og', '') || undefined;

  const [origin, setOrigin] = useState('US');
  const [dest, setDest] = useState('CD-KIN');
  const [filter, setFilter] = useState<'tous' | 'vers' | 'depuis'>('tous');
  const [openCase, setOpenCase] = useState('');
  const [faqOpen, setFaqOpen] = useState(-1);

  // Quote form
  const [chips, setChips] = useState<string[]>([]);
  const [what, setWhat] = useState('');
  const [quantity, setQuantity] = useState('');
  const [estValue, setEstValue] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [detail, setDetail] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ name?: boolean; email?: boolean; consent?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [reference, setReference] = useState('');

  const routeId = data.routeMap[`${origin}|${dest}`] || '';
  const routeCase = data.cases.find((c) => c.id === routeId);
  const visibleCases = data.cases.filter((c) => filter === 'tous' || c.dir === filter);
  const originShort = origin === 'XX' ? '?' : origin;
  const destShort = dest.indexOf('CD-') === 0 ? 'CD' : dest;

  const openRouteCase = () => {
    if (!routeId) return;
    setFilter('tous');
    setOpenCase(routeId);
    document.getElementById('cas')?.scrollIntoView({ behavior: 'smooth' });
  };

  const submit = async () => {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = true;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) errs.email = true;
    if (!consent) errs.consent = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      const originLabel = data.origins.find((o) => o.code === origin)?.label ?? origin;
      const destLabel = data.destinations.find((d) => d.code === dest)?.label ?? dest;
      const whatText = [what.trim(), chips.length ? `[${chips.join(', ')}]` : ''].filter(Boolean).join(' ');
      const description = [
        `${t('forwarding.f_dest_label')} ${destLabel}`,
        whatText ? `${t('forwarding.f_what_label')} ${whatText}` : '',
        quantity ? `${t('forwarding.f_qty_label')} ${quantity}` : '',
        detail.trim() ? `${t('forwarding.f_detail_label')} ${detail.trim()}` : '',
      ].filter(Boolean).join('\n');
      await submitForwardingRequest({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        origin_country: originLabel,
        description,
        estimated_value: estValue.trim() ? (Number(estValue.replace(/[^\d.]/g, '')) || null) : null,
      });
      setReference(`REX-${Math.floor(Math.random() * 9000) + 1000}`);
      setErrors({});
      setSent(true);
      trackEvent('reexpedition_requested', { origin_country: origin, destination: dest });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[forwarding] submit failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSent(false); setReference(''); setChips([]); setWhat(''); setQuantity('');
    setEstValue(''); setName(''); setEmail(''); setPhone(''); setDetail(''); setConsent(false); setErrors({});
  };

  const selectCls = 'w-full appearance-none rounded-lg border px-3.5 py-3 pr-10 text-[15px] outline-none transition-colors';
  const H2 = 'text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink';

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} image={ogImage} />

      {/* ── Hero + route selector ── */}
      <section style={{ background: 'linear-gradient(135deg,#0A1650 0%,#0D2E6B 62%,#123A7E 100%)' }}>
        <div className="mx-auto flex max-w-[1220px] flex-wrap gap-[clamp(28px,4vw,56px)] px-5 sm:px-8" style={{ paddingTop: 'clamp(44px,6vw,84px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
          <div className="min-w-0 flex-1 basis-[min(100%,460px)]">
            <Ed page="forwarding" field="page_title" as="h1" className="mb-5 block max-w-[22em] text-[clamp(30px,4.4vw,48px)] font-semibold leading-[1.1] tracking-[-.015em] text-white">
              {pageTitle}
            </Ed>
            <Ed page="forwarding" field="intro" as="div" multiline markdown className="block max-w-[34em] text-[17px] leading-[1.65] text-[#D7E4F5]">
              {pageIntro}
            </Ed>
          </div>

          <div className="min-w-0 flex-1 basis-[min(100%,420px)] rounded-[14px] border border-[#4A6FA0]/75 bg-luna-ink/60 p-[clamp(20px,2.5vw,28px)]">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 flex-1 basis-[150px]">
                <label htmlFor="origin" className="mb-2 block text-[13px] font-medium text-[#B9C9E0]">{t('forwarding.sel_origin_label')}</label>
                <div className="relative">
                  <select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)} className={`${selectCls} border-[#4A6FA0] bg-luna-ink text-white hover:border-luna-sky`}>
                    {data.origins.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-luna-aqua" aria-hidden="true" />
                </div>
              </div>
              <div className="min-w-0 flex-1 basis-[150px]">
                <label htmlFor="dest" className="mb-2 block text-[13px] font-medium text-[#B9C9E0]">{t('forwarding.sel_dest_label')}</label>
                <div className="relative">
                  <select id="dest" value={dest} onChange={(e) => setDest(e.target.value)} className={`${selectCls} border-[#4A6FA0] bg-luna-ink text-white hover:border-luna-sky`}>
                    {data.destinations.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-luna-aqua" aria-hidden="true" />
                </div>
              </div>
            </div>

            <div className="my-5 flex items-center gap-3">
              <span className="text-[13px] font-medium tracking-[.06em] text-white">{originShort}</span>
              <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#1FE0F0 0%,#4A6FA0 100%)' }} />
              <Plane className="h-[18px] w-[18px] -rotate-45 text-luna-sky" aria-hidden="true" />
              <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#4A6FA0 0%,#1FE0F0 100%)' }} />
              <span className="text-[13px] font-medium tracking-[.06em] text-white">{destShort}</span>
            </div>

            <p className="mb-1.5 text-[15px] font-medium leading-[1.5] text-white">{routeCase ? routeCase.heroTitle : t('forwarding.route_fallback_title')}</p>
            <p className="mb-[18px] text-[15px] leading-[1.6] text-[#D7E4F5]">{routeCase ? routeCase.heroText : t('forwarding.route_fallback_text')}</p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={openRouteCase} disabled={!routeId} className="inline-flex items-center gap-2 rounded-lg border border-luna-sky bg-transparent px-[18px] py-3 text-[15px] font-medium text-white transition-colors hover:bg-luna-sky/20 disabled:opacity-50">
                {t('forwarding.route_case_cta')}
              </button>
              <a href="#devis" className="inline-flex items-center gap-2 rounded-lg bg-luna-aqua px-[18px] py-3 text-[15px] font-semibold text-luna-ink transition-colors hover:bg-luna-aqua2">
                {t('forwarding.route_quote_cta')} <ArrowRight className="h-[15px] w-[15px]" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── What is forwarding ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
          <Ed page="forwarding" field="quoi_title" as="h2" className={`mb-6 block ${H2}`}>{t('forwarding.quoi_title')}</Ed>
          <Ed page="forwarding" field="quoi_p1" as="p" className="mb-[18px] block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.quoi_p1')}</Ed>
          <Ed page="forwarding" field="quoi_p2" as="p" multiline className="mb-[clamp(32px,4vw,48px)] block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.quoi_p2')}</Ed>
          <div className="grid max-w-[62em] gap-[clamp(24px,3vw,48px)] sm:grid-cols-2">
            <div className="min-w-0 border-t border-[#D9E2EC] pt-5">
              <p className="mb-3 text-[22px] font-medium leading-[1.3] text-luna-ink">{t('forwarding.quoi_card1_title')}</p>
              <p className="mb-3.5 text-[17px] leading-[1.6] text-[#0F1B33]">{t('forwarding.quoi_card1_body')}</p>
              <Link to={urlFor('shopAndShip', lang)} className="text-[15px] font-medium text-luna-sky hover:underline">{t('forwarding.quoi_card1_cta')}</Link>
            </div>
            <div className="min-w-0 border-t-2 border-luna-sky pt-5">
              <p className="mb-3 text-[22px] font-medium leading-[1.3] text-luna-ink">{t('forwarding.quoi_card2_title')}</p>
              <p className="mb-3.5 text-[17px] leading-[1.6] text-[#0F1B33]">{t('forwarding.quoi_card2_body')}</p>
              <p className="text-[15px] font-medium text-luna-royal">{t('forwarding.quoi_card2_note')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <Block name="forwarding-how">
        <section className="bg-luna-mist">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="how_title" as="h2" className={`mb-[clamp(32px,4vw,56px)] block ${H2}`}>{t('forwarding.how_title')}</Ed>
            <div className="grid gap-[clamp(28px,3vw,40px)] sm:grid-cols-2 nav:grid-cols-4">
              {data.steps.map((s) => (
                <div key={s.n} className="min-w-0">
                  <div className="mb-[18px] flex items-center">
                    <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border-2 border-luna-aqua bg-luna-ink text-[13px] font-semibold text-white">{s.n}</span>
                    <span className="h-0.5 flex-1" style={{ background: 'linear-gradient(90deg,#1FE0F0 0%,rgba(31,163,201,.25) 100%)' }} />
                  </div>
                  <h3 className="mb-2.5 text-[22px] font-medium leading-[1.3] text-luna-ink">{s.title}</h3>
                  <p className="text-[15px] leading-[1.6] text-[#0F1B33]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Block>

      {/* ── Case studies ── */}
      <Block name="forwarding-cases">
        <section id="cas" className="bg-white">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="cases_title" as="h2" className={`mb-4 block ${H2}`}>{t('forwarding.cases_title')}</Ed>
            <Ed page="forwarding" field="cases_intro" as="p" multiline className="mb-[clamp(28px,3vw,40px)] block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.cases_intro')}</Ed>

            <div className="mb-[clamp(24px,3vw,32px)] flex flex-wrap gap-2.5">
              {([['tous', t('forwarding.filter_all')], ['vers', t('forwarding.filter_to')], ['depuis', t('forwarding.filter_from')]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
                  className={`rounded-full border px-[18px] py-2.5 text-[15px] transition-colors ${filter === id ? 'border-luna-royal bg-luna-royal font-medium text-white' : 'border-[#D9E2EC] bg-white text-[#0F1B33] hover:border-luna-sky hover:bg-luna-mist'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div>
              {visibleCases.map((c) => {
                const open = openCase === c.id;
                return (
                  <article key={c.id} className="border-t border-[#D9E2EC] py-[clamp(24px,3vw,32px)]">
                    <div className="mb-3.5 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2.5 rounded-full bg-luna-ink px-3.5 py-1.5 text-[13px] font-medium tracking-[.06em] text-white">
                        {c.fromCode}
                        <span className="inline-block h-0.5 w-7" style={{ background: 'linear-gradient(90deg,#1FE0F0 0%,#1FA3C9 100%)' }} />
                        {c.toCode}
                      </span>
                      <span className="text-[13px] font-medium tracking-[.04em] text-luna-body">{c.mode}</span>
                    </div>
                    <h3 className="mb-3 max-w-[30em] text-[22px] font-medium leading-[1.35] text-luna-ink">{c.title}</h3>
                    <p className="mb-4 max-w-[40em] text-[17px] leading-[1.65] text-[#0F1B33]">{c.situation}</p>

                    <button type="button" onClick={() => setOpenCase(open ? '' : c.id)} aria-expanded={open}
                      className="inline-flex items-center gap-2 border-0 bg-transparent p-0 text-[15px] font-medium text-luna-blue transition-colors hover:text-luna-ink">
                      {open ? t('forwarding.case_collapse') : t('forwarding.case_do')}
                      {open ? <Minus className="h-[15px] w-[15px]" /> : <Plus className="h-[15px] w-[15px]" />}
                    </button>

                    {open && (
                      <div className="mt-5 grid max-w-[64em] gap-[clamp(20px,2.5vw,36px)] sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="mb-3 text-[13px] font-semibold tracking-[.1em] text-luna-royal">{t('forwarding.case_do_label')}</p>
                          <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-[15px] leading-[1.6] text-[#0F1B33]">
                            {c.actions.map((a, i) => <li key={i}>{a}</li>)}
                          </ol>
                        </div>
                        <div className="flex min-w-0 flex-col gap-5">
                          <div>
                            <p className="mb-2.5 text-[13px] font-semibold tracking-[.1em] text-luna-royal">{t('forwarding.case_see_label')}</p>
                            <p className="text-[15px] leading-[1.6] text-[#0F1B33]">{c.tracking}</p>
                          </div>
                          <div className="border-l-2 border-luna-sky bg-luna-mist px-4 py-4">
                            <p className="mb-2 text-[13px] font-semibold tracking-[.1em] text-luna-royal">{t('forwarding.case_note_label')}</p>
                            <p className="text-[15px] leading-[1.6] text-[#0F1B33]">{c.note}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              <div className="border-t border-[#D9E2EC]" />
            </div>
          </div>
        </section>
      </Block>

      {/* ── Air vs sea ── */}
      <Block name="forwarding-compare">
        <section className="bg-luna-mist">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="compare_title" as="h2" className={`mb-[clamp(24px,3vw,36px)] block ${H2}`}>{t('forwarding.compare_title')}</Ed>
            <div className="max-w-[64em] overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
                <thead>
                  <tr>
                    <th className="border-b-2 border-luna-ink py-3.5 pr-4" />
                    <th className="border-b-2 border-luna-ink px-4 py-3.5 text-[17px] font-semibold text-luna-ink">{t('forwarding.compare_col_air')}</th>
                    <th className="border-b-2 border-luna-ink px-4 py-3.5 text-[17px] font-semibold text-luna-ink">{t('forwarding.compare_col_sea')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.compare.map((r, i) => (
                    <tr key={i}>
                      <th className="border-b border-[#D9E2EC] py-4 pr-4 align-top text-[15px] font-medium text-luna-royal">{r.label}</th>
                      <td className="border-b border-[#D9E2EC] p-4 align-top leading-[1.6] text-[#0F1B33]">{r.air}</td>
                      <td className="border-b border-[#D9E2EC] p-4 align-top leading-[1.6] text-[#0F1B33]">{r.sea}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Ed page="forwarding" field="compare_note" as="p" multiline className="mt-[clamp(24px,3vw,32px)] block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.compare_note')}</Ed>
          </div>
        </section>
      </Block>

      {/* ── Glossary ── */}
      <Block name="forwarding-glossary">
        <section className="bg-white">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="glossary_title" as="h2" className={`mb-[clamp(24px,3vw,36px)] block ${H2}`}>{t('forwarding.glossary_title')}</Ed>
            <dl className="grid max-w-[58em] gap-[clamp(24px,3vw,40px)] sm:grid-cols-2">
              {data.glossary.map((g, i) => (
                <div key={i} className="min-w-0">
                  <dt className="mb-2 text-[17px] font-semibold text-luna-ink">{g.term}</dt>
                  <dd className="text-[15px] leading-[1.65] text-[#0F1B33]">{g.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </Block>

      {/* ── What we don't carry ── */}
      <Block name="forwarding-refused">
        <section className="bg-luna-mist">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="refused_title" as="h2" className={`mb-5 block ${H2}`}>{t('forwarding.refused_title')}</Ed>
            <p className="mb-7 max-w-[38em] text-[15px] leading-[1.6] text-luna-body">{t('forwarding.refused_disclaimer')}</p>
            <ul className="mb-7 grid max-w-[58em] list-none grid-cols-1 gap-x-8 gap-y-3 p-0 sm:grid-cols-2 nav:grid-cols-3">
              {data.refused.map((x, i) => (
                <li key={i} className="flex items-start gap-2.5 border-b border-[#D9E2EC] pb-3 text-[15px] leading-[1.6] text-[#0F1B33]">
                  <Ban className="mt-0.5 h-[17px] w-[17px] flex-none text-luna-body" aria-hidden="true" /> {x}
                </li>
              ))}
            </ul>
            <Ed page="forwarding" field="refused_note" as="p" multiline className="block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.refused_note')}</Ed>
          </div>
        </section>
      </Block>

      {/* ── Your Luna account (tracking mock) ── */}
      <Block name="forwarding-space">
        <section className="bg-luna-ink">
          <div className="mx-auto flex max-w-[1220px] flex-wrap gap-[clamp(28px,4vw,56px)] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <div className="min-w-0 flex-1 basis-[min(100%,360px)]">
              <Ed page="forwarding" field="space_title" as="h2" className="mb-5 block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-white">{t('forwarding.space_title')}</Ed>
              <Ed page="forwarding" field="space_body" as="p" multiline className="mb-6 block max-w-[32em] text-[17px] leading-[1.65] text-[#D7E4F5]">{t('forwarding.space_body')}</Ed>
              <Link to={urlFor('tracking', lang)} className="inline-flex items-center gap-2 rounded-lg border border-luna-sky px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-luna-sky/20">
                {t('forwarding.space_cta')}
              </Link>
            </div>
            <div className="min-w-0 flex-1 basis-[min(100%,380px)] rounded-xl bg-white p-[clamp(20px,2.5vw,28px)]">
              <div className="flex flex-wrap items-baseline justify-between gap-2.5 border-b border-[#D9E2EC] pb-4">
                <span className="text-[15px] font-semibold text-luna-ink">{t('forwarding.space_mock_ref')}</span>
                <span className="rounded-full border border-[#D9E2EC] bg-luna-mist px-2.5 py-1 text-[13px] font-medium text-luna-body">{t('forwarding.space_mock_badge')}</span>
              </div>
              <div className="flex flex-col pt-[18px]">
                {data.mock.map((m, i) => (
                  <div key={i} className="flex min-h-[54px] gap-3.5">
                    <div className="flex w-4 flex-none flex-col items-center">
                      <span className="mt-[5px] h-[11px] w-[11px] flex-none rounded-full" style={{ background: m.active ? '#1FA3C9' : '#D9E2EC' }} />
                      {i < data.mock.length - 1 && <span className="w-0.5 flex-1 bg-[#D9E2EC]" />}
                    </div>
                    <div className="min-w-0 pb-3.5">
                      <p className="mb-0.5 text-[15px] font-medium leading-[1.4] text-luna-ink">{m.label}</p>
                      <p className="text-[13px] leading-[1.5] text-luna-body">{m.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </Block>

      {/* ── Quote form ── */}
      <section id="devis" className="bg-white">
        <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
          <Ed page="forwarding" field="devis_title" as="h2" className={`mb-4 block ${H2}`}>{t('forwarding.devis_title')}</Ed>
          <Ed page="forwarding" field="devis_intro" as="p" multiline className="mb-[clamp(28px,3vw,40px)] block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.devis_intro')}</Ed>

          {sent ? (
            <div className="max-w-[44em] rounded-xl border border-luna-sky bg-luna-mist p-[clamp(24px,3vw,32px)]">
              <p className="mb-3.5 text-[22px] font-medium text-luna-ink">{t('forwarding.sent_title')}</p>
              <p className="text-[17px] leading-[1.65] text-[#0F1B33]">
                {t('forwarding.sent_body', { reference }).split(reference).map((part, i, arr) => (
                  <span key={i}>{part}{i < arr.length - 1 && <strong className="font-semibold text-luna-ink">{reference}</strong>}</span>
                ))}
              </p>
              <button type="button" onClick={resetForm} className="mt-3 rounded-lg border border-[#D9E2EC] bg-white px-[18px] py-3 text-[15px] font-medium text-[#0F1B33] transition-colors hover:border-luna-sky">
                {t('forwarding.sent_again')}
              </button>
            </div>
          ) : (
            <div className="max-w-[52em] rounded-xl border border-[#D9E2EC] p-[clamp(24px,3vw,36px)] shadow-[0_10px_28px_rgba(10,22,80,.07)]">
              <div className="mb-6 flex flex-wrap gap-[18px]">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <label htmlFor="f-origin" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_origin_label')}</label>
                  <div className="relative">
                    <select id="f-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} className={`${selectCls} border-[#D9E2EC] bg-luna-mist text-[#0F1B33] hover:border-luna-sky`}>
                      {data.origins.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-luna-sky" aria-hidden="true" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 basis-[220px]">
                  <label htmlFor="f-dest" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_dest_label')}</label>
                  <div className="relative">
                    <select id="f-dest" value={dest} onChange={(e) => setDest(e.target.value)} className={`${selectCls} border-[#D9E2EC] bg-luna-mist text-[#0F1B33] hover:border-luna-sky`}>
                      {data.destinations.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-luna-sky" aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label htmlFor="f-what" className="mb-2.5 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_what_label')}</label>
                <div className="mb-3 flex flex-wrap gap-2">
                  {data.chips.map((label) => {
                    const active = chips.includes(label);
                    return (
                      <button key={label} type="button" aria-pressed={active}
                        onClick={() => setChips((prev) => prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label])}
                        className={`rounded-full border px-3.5 py-2 text-[15px] transition-colors ${active ? 'border-luna-royal bg-luna-royal text-white' : 'border-[#D9E2EC] bg-white text-[#0F1B33] hover:border-luna-sky hover:bg-luna-mist'}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <textarea id="f-what" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} placeholder={t('forwarding.f_what_ph')}
                  className="w-full resize-y rounded-lg border border-[#D9E2EC] bg-luna-mist px-3.5 py-3 text-[15px] leading-[1.6] text-[#0F1B33] outline-none focus:border-luna-sky" />
              </div>

              <div className="mb-6">
                <p className="mb-2.5 text-[15px] font-medium text-luna-royal">{t('forwarding.f_qty_label')}</p>
                <div className="flex flex-wrap gap-2">
                  {data.quantities.map((label) => (
                    <button key={label} type="button" aria-pressed={quantity === label} onClick={() => setQuantity(label)}
                      className={`rounded-lg border px-[17px] py-2.5 text-[15px] transition-colors ${quantity === label ? 'border-luna-royal bg-luna-royal text-white' : 'border-[#D9E2EC] bg-white text-[#0F1B33] hover:border-luna-sky hover:bg-luna-mist'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6 max-w-[22em]">
                <label htmlFor="f-value" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_value_label')}</label>
                <input id="f-value" type="text" value={estValue} onChange={(e) => setEstValue(e.target.value)} placeholder={t('forwarding.f_value_ph')}
                  className="w-full rounded-lg border border-[#D9E2EC] bg-luna-mist px-3.5 py-3 text-[15px] text-[#0F1B33] outline-none focus:border-luna-sky" />
                <p className="mt-2 text-[13px] leading-[1.5] text-luna-body">{t('forwarding.f_value_hint')}</p>
              </div>

              <div className="mb-6 flex flex-wrap gap-[18px]">
                <div className="min-w-0 flex-1 basis-[200px]">
                  <label htmlFor="f-name" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_name')}</label>
                  <input id="f-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[#D9E2EC] bg-luna-mist px-3.5 py-3 text-[15px] text-[#0F1B33] outline-none focus:border-luna-sky" />
                  {errors.name && <p className="mt-2 text-[13px] leading-[1.5] text-[#B3261E]">{t('forwarding.err_name')}</p>}
                </div>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <label htmlFor="f-email" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_email')}</label>
                  <input id="f-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#D9E2EC] bg-luna-mist px-3.5 py-3 text-[15px] text-[#0F1B33] outline-none focus:border-luna-sky" />
                  {errors.email && <p className="mt-2 text-[13px] leading-[1.5] text-[#B3261E]">{t('forwarding.err_email')}</p>}
                </div>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <label htmlFor="f-phone" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_phone')}</label>
                  <input id="f-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-[#D9E2EC] bg-luna-mist px-3.5 py-3 text-[15px] text-[#0F1B33] outline-none focus:border-luna-sky" />
                  <p className="mt-2 text-[13px] leading-[1.5] text-luna-body">{t('forwarding.f_phone_hint')}</p>
                </div>
              </div>

              <div className="mb-6">
                <label htmlFor="f-detail" className="mb-2 block text-[15px] font-medium text-luna-royal">{t('forwarding.f_detail_label')}</label>
                <textarea id="f-detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={t('forwarding.f_detail_ph')}
                  className="w-full resize-y rounded-lg border border-[#D9E2EC] bg-luna-mist px-3.5 py-3 text-[15px] leading-[1.6] text-[#0F1B33] outline-none focus:border-luna-sky" />
                <p className="mt-2.5 flex items-center gap-2 text-[13px] text-luna-body"><Paperclip className="h-[15px] w-[15px] text-luna-body" aria-hidden="true" /> {t('forwarding.f_detail_hint')}</p>
              </div>

              <label htmlFor="f-rgpd" className="mb-1.5 flex cursor-pointer items-start gap-2.5 text-[15px] leading-[1.6] text-[#0F1B33]">
                <input id="f-rgpd" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-[19px] w-[19px] flex-none accent-luna-royal" />
                {t('forwarding.f_consent')}
              </label>
              {errors.consent && <p className="mt-1.5 text-[13px] leading-[1.5] text-[#B3261E]">{t('forwarding.err_consent')}</p>}

              <button type="button" onClick={submit} disabled={submitting}
                className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-lg border border-luna-royal bg-luna-royal px-7 py-[15px] text-[15px] font-semibold text-white transition-colors hover:border-luna-azure hover:bg-luna-azure disabled:opacity-60">
                {t('forwarding.f_submit')}
              </button>
              <p className="mt-3.5 text-[13px] leading-[1.5] text-luna-body">{t('forwarding.f_submit_hint')}</p>
            </div>
          )}
        </div>
      </section>

      {/* ── FAQ ── */}
      <Block name="forwarding-faq">
        <section className="bg-luna-mist">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="faq_title" as="h2" className={`mb-[clamp(24px,3vw,36px)] block ${H2}`}>{t('forwarding.faq_title')}</Ed>
            <div className="max-w-[52em]">
              {data.faqs.map((f, i) => {
                const open = faqOpen === i;
                return (
                  <div key={i} className="border-b border-[#D9E2EC]">
                    <h3 className="m-0">
                      <button type="button" onClick={() => setFaqOpen(open ? -1 : i)} aria-expanded={open}
                        className="flex w-full items-center justify-between gap-4 border-0 bg-transparent px-1 py-[18px] text-left text-[17px] font-medium text-luna-ink transition-colors hover:text-luna-blue">
                        {f.q}
                        {open ? <Minus className="h-[17px] w-[17px] flex-none text-luna-blue" /> : <Plus className="h-[17px] w-[17px] flex-none text-luna-blue" />}
                      </button>
                    </h3>
                    {open && <p className="max-w-[40em] px-1 pb-[22px] text-[15px] leading-[1.7] text-[#0F1B33]">{f.a}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </Block>

      {/* ── Contact ── */}
      <Block name="forwarding-contact">
        <section id="contact" className="bg-white">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(48px,6vw,88px)' }}>
            <Ed page="forwarding" field="contact_title" as="h2" className={`mb-5 block ${H2}`}>{t('forwarding.contact_title')}</Ed>
            <Ed page="forwarding" field="contact_intro" as="p" multiline className="mb-[clamp(28px,3vw,40px)] block max-w-[38em] text-[17px] leading-[1.65] text-[#0F1B33]">{t('forwarding.contact_intro')}</Ed>
            <div className="grid max-w-[62em] gap-[clamp(24px,3vw,40px)] sm:grid-cols-2 nav:grid-cols-4">
              <div className="min-w-0 border-t border-[#D9E2EC] pt-[18px]">
                <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[.1em] text-luna-royal">{t('forwarding.contact_addr_label')}</p>
                <p className="text-[17px] leading-[1.6] text-[#0F1B33]">{t('footer.address')}</p>
              </div>
              <div className="min-w-0 border-t border-[#D9E2EC] pt-[18px]">
                <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[.1em] text-luna-royal">{t('forwarding.contact_phone_label')}</p>
                <p className="text-[17px] leading-[1.6]"><a href="tel:+3222419672" className="text-luna-sky hover:underline">+32 2 241 96 72</a></p>
              </div>
              <div className="min-w-0 border-t border-[#D9E2EC] pt-[18px]">
                <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[.1em] text-luna-royal">{t('forwarding.contact_email_label')}</p>
                <p className="break-words text-[17px] leading-[1.6]"><a href={`mailto:${t('footer.email')}`} className="text-luna-sky hover:underline">{t('footer.email')}</a></p>
              </div>
              <div className="min-w-0 border-t border-[#D9E2EC] pt-[18px]">
                <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[.1em] text-luna-royal">{t('forwarding.contact_insta_label')}</p>
                <p className="text-[17px] leading-[1.6]"><a href="https://www.instagram.com/Luna_TrackingLogistics/" target="_blank" rel="noopener noreferrer" className="text-luna-sky hover:underline">{t('footer.instagram_handle')}</a></p>
              </div>
            </div>
          </div>
        </section>
      </Block>
    </>
  );
}
