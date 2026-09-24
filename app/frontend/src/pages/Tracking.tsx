import { useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Package, Info, ArrowRight, AlertTriangle,
  Receipt, Keyboard, Search, BellRing, Plus, Minus,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { fetchTrackingStatus, type TrackingResult } from '@/lib/tracking';
import { buildTrackingView } from '@/lib/tracking-view';
import { TrackingResultView, useIsDesktop } from '@/components/tracking/TrackingResultView';
import { TrackingMap, useTrackingMap } from '@/components/tracking/TrackingMap';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { urlFor } from '@/lib/url/routes';

/**
 * Suivi (tracking) — "Suivi Luna" redesign from Claude Design (2026-09-14),
 * rebuilt on the live stack. The real lookup is preserved: the input feeds
 * `fetchTrackingStatus` (UUID → native RPC, alphanum → legacy FileMaker
 * bridge) and the three result states (ok / not_found / unavailable) render
 * below the search card. New sections (how-to, transparency, FAQ) are i18n +
 * admin-editable via useContent; the term is "numéro de suivi" throughout.
 */
export default function Tracking() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const metaTitle       = useContent('tracking', 'meta_title',       t('tracking.meta_title'));
  const metaDescription = useContent('tracking', 'meta_description', t('tracking.meta_description'));
  const pageTitle       = useContent('tracking', 'page_title',       t('tracking.page_title'));
  const pageIntro       = useContent('tracking', 'page_intro',       t('tracking.page_intro'));
  const codeLabel       = useContent('tracking', 'password_label',   t('tracking.password_label'));
  const noAccountNote   = useContent('tracking', 'no_account_note',  t('tracking.no_account_note'));
  const unavailableTitle= useContent('tracking', 'unavailable_title',t('tracking.unavailable_title'));
  const unavailableBody = useContent('tracking', 'unavailable_body', t('tracking.unavailable_body'));
  const howTitle        = useContent('tracking', 'how_title',        t('tracking.how_title'));
  const transparencyEyebrow = useContent('tracking', 'transparency_eyebrow', t('tracking.transparency_eyebrow'));
  const transparencyBody    = useContent('tracking', 'transparency_body',    t('tracking.transparency_body'));
  const faqTitle        = useContent('tracking', 'faq_title',        t('tracking.faq_title'));

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [searched, setSearched] = useState('');
  // "Suivi Luna v2" result view when the result can be read confidently;
  // otherwise (null) the page keeps the plain list below, as before.
  const view = useMemo(() => (result ? buildTrackingView(result, searched) : null), [result, searched]);
  const [hint, setHint] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setHint(true); return; }
    setLoading(true);
    try {
      const r = await fetchTrackingStatus(code.trim(), lang);
      setSearched(code.trim());
      setResult(r);
      trackEvent('tracking_search', {
        found: r.status === 'ok',
        result: r.status,
        source: r.status === 'ok' ? r.source : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { key: '1', icon: Receipt,  title: useContent('tracking', 'step1_title', t('tracking.step1_title')), body: useContent('tracking', 'step1_body', t('tracking.step1_body')) },
    { key: '2', icon: Keyboard, title: useContent('tracking', 'step2_title', t('tracking.step2_title')), body: useContent('tracking', 'step2_body', t('tracking.step2_body')) },
    { key: '3', icon: Search,   title: useContent('tracking', 'step3_title', t('tracking.step3_title')), body: useContent('tracking', 'step3_body', t('tracking.step3_body')) },
    { key: '4', icon: BellRing, title: useContent('tracking', 'step4_title', t('tracking.step4_title')), body: useContent('tracking', 'step4_body', t('tracking.step4_body')) },
  ];

  // Unrolled (not .map) so each useContent is a top-level hook call in a fixed
  // order — calling hooks inside a callback breaks the rules of hooks.
  const faqs = [
    { q: useContent('tracking', 'faq1_q', t('tracking.faq1_q')), a: useContent('tracking', 'faq1_a', t('tracking.faq1_a')) },
    { q: useContent('tracking', 'faq2_q', t('tracking.faq2_q')), a: useContent('tracking', 'faq2_a', t('tracking.faq2_a')) },
    { q: useContent('tracking', 'faq3_q', t('tracking.faq3_q')), a: useContent('tracking', 'faq3_a', t('tracking.faq3_a')) },
    { q: useContent('tracking', 'faq4_q', t('tracking.faq4_q')), a: useContent('tracking', 'faq4_a', t('tracking.faq4_a')) },
  ];

  // No-search state: the route map is always there (neutral illustration —
  // both air corridors, no shipment's data), beside the search card on
  // desktop, under it on phones. A result replaces it with the real one.
  const desktop = useIsDesktop();
  const map = useTrackingMap(!view);
  const mapAlt = useContent('tracking', 'map_alt', t('tracking.map_alt'));
  const mapLabels = { bru: t('tracking_v2.bru'), anr: t('tracking_v2.anr'), be: t('tracking_v2.be'), cd: t('tracking_v2.cd'), matadi: 'Matadi' };

  const header = (
    <div className="max-w-[46em]">
      <div className="mb-[18px] flex items-center gap-3.5">
        <span className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[10px] border border-luna-hair bg-luna-ink">
          <Package className="h-6 w-6 text-luna-aqua" aria-hidden="true" />
        </span>
        <Ed page="tracking" field="page_title" as="h1" className="text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
          {pageTitle}
        </Ed>
      </div>
      <Ed page="tracking" field="page_intro" as="div" multiline markdown className="mb-[26px] block text-[20px] font-normal leading-[1.55] text-luna-muted-ink">
        {pageIntro}
      </Ed>
    </div>
  );

  const searchCard = (
    <div className="rounded-xl border border-[#DCE5F0] bg-white p-[clamp(24px,3vw,32px)] shadow-[0_10px_28px_rgba(10,22,80,.08)]">
      <form onSubmit={onSubmit}>
        <label htmlFor="track" className="mb-2.5 block text-[13px] font-semibold text-luna-royal">
          <Ed page="tracking" field="password_label">{codeLabel}</Ed>
        </label>
        <input
          id="track"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => { setCode(e.target.value); setHint(false); }}
          placeholder={t('tracking.password_placeholder')}
          required
          className="w-full rounded-lg border border-[#C6D4E6] bg-[#F7FAFE] px-4 py-[15px] text-[13px] tracking-[.04em] text-luna-ink outline-none transition-colors placeholder:text-slate-400 hover:border-luna-sky focus:border-luna-sky focus:bg-white focus:outline focus:outline-2 focus:outline-luna-aqua"
        />
        <p className="mb-5 mt-2.5 flex items-start gap-2 text-[11px] leading-[1.6] text-luna-body">
          <Info className="mt-px h-3.5 w-3.5 flex-none text-luna-sky" aria-hidden="true" /> {noAccountNote}
        </p>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-luna-royal bg-luna-royal px-6 py-[15px] text-[13px] font-semibold tracking-[.02em] text-white transition-colors hover:border-luna-azure hover:bg-luna-azure disabled:opacity-60"
        >
          {loading ? t('tracking.loading') : t('tracking.submit')} <ArrowRight className="h-[15px] w-[15px]" />
        </button>
        {hint && !result && (
          <p className="mt-3.5 rounded-lg border border-[#C6D4E6] bg-[#F7FAFE] px-3.5 py-3 text-[11px] leading-[1.6] text-luna-body">
            {t('tracking.hint')}
          </p>
        )}
      </form>

      {/* Results */}
      {result && (
        <div className="mt-5" role="status" aria-live="polite">
          {result.status === 'unavailable' && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" aria-hidden="true" />
                <div>
                  <Ed page="tracking" field="unavailable_title" as="h2" className="block font-semibold text-amber-900">
                    {unavailableTitle}
                  </Ed>
                  <Ed page="tracking" field="unavailable_body" as="p" multiline className="mt-1 block text-sm text-amber-900/90">
                    {result.message || unavailableBody}
                  </Ed>
                </div>
              </div>
            </div>
          )}
          {result.status === 'not_found' && (
            <div className="rounded-xl border border-slate-300 bg-slate-50 p-5">
              <p className="text-sm text-slate-700">{result.message || t('tracking.empty_result')}</p>
            </div>
          )}
          {result.status === 'ok' && (
            <div className="rounded-xl border border-[#DCE5F0] bg-white p-1">
              <ul className="divide-y divide-slate-100">
                {result.positions.map((p) => (
                  <li key={p.numeroColis} className="flex items-start justify-between gap-4 p-3">
                    <div>
                      <div className="font-mono text-sm text-luna-ink">{p.numeroColis}</div>
                      <div className="text-sm text-luna-body">{p.libelle}</div>
                    </div>
                    {p.date && <div className="shrink-0 text-xs text-slate-500">{p.date}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} image={`https://lunatrackinglogistics.com/brand/og-suivi-${lang}.jpg`} imageAlt={mapAlt} />

      {/* ── Search ── */}
      <div className="bg-luna-mist">
        <section className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: view ? 0 : 'clamp(40px,5vw,72px)', paddingBottom: 'clamp(48px,6vw,80px)' }}>
          {view ? (
            <TrackingResultView
              view={view}
              title={(
                <Ed page="tracking" field="page_title" as="h1" className="text-[26px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink lg:text-[32px]">
                  {pageTitle}
                </Ed>
              )}
              search={{ code, setCode: (v) => { setCode(v); setHint(false); }, onSubmit, loading }}
            />
          ) : desktop ? (
            <div>
              {header}
              <div className="relative flex min-h-[560px] items-start overflow-hidden rounded-2xl border border-[#C6D4E6] bg-[#E4EDF6]">
                {map && <TrackingMap data={map} view="preview" variant="desktop" lang={lang} labels={mapLabels} alt={mapAlt} />}
                <div className="absolute right-5 top-4 flex items-center gap-2 whitespace-nowrap rounded-lg border border-luna-hair bg-[rgba(10,22,80,.72)] px-3 py-[7px] text-[11px] text-[#B9C9E0]">
                  <Info className="h-3.5 w-3.5 text-luna-sky" aria-hidden="true" /> {t('tracking.map_preview_note')}
                </div>
                <div className="relative m-10 w-[440px]">{searchCard}</div>
              </div>
            </div>
          ) : (
            <div>
              {header}
              <div className="flex flex-wrap items-start gap-[clamp(16px,2.5vw,24px)]">
                <div className="min-w-0 flex-1 basis-[min(100%,340px)]">{searchCard}</div>
                {/* 5:6 keeps Brussels and Kinshasa both in frame of the vertical crop. */}
                <div className="relative aspect-[5/6] min-h-[420px] min-w-0 flex-1 basis-[min(100%,340px)] overflow-hidden rounded-[18px] border border-[#C6D4E6] bg-[#E4EDF6]">
                  {map && <TrackingMap data={map} view="preview" variant="mobile" lang={lang} labels={mapLabels} alt={mapAlt} />}
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-luna-hair bg-[rgba(10,22,80,.78)] px-2.5 py-[5px] text-[10px] text-[#B9C9E0]">
                    <Info className="h-3 w-3 text-luna-sky" aria-hidden="true" /> {t('tracking.map_preview_note')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── How to track ── */}
        <Block name="tracking-how">
          <section className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingBottom: 'clamp(56px,7vw,96px)' }}>
            <div className="mb-[clamp(40px,5vw,64px)] h-px" style={{ background: 'linear-gradient(90deg,rgba(10,22,80,0) 0%,#D3DEEC 12%,#D3DEEC 88%,rgba(10,22,80,0) 100%)' }} />
            <Ed page="tracking" field="how_title" as="h2" className="mb-[clamp(28px,4vw,48px)] block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
              {howTitle}
            </Ed>
            <div className="grid gap-[clamp(24px,3vw,40px)] sm:grid-cols-2 nav:grid-cols-4">
              {steps.map((s, i) => (
                <div key={s.key} className={`min-w-0 border-t-2 pt-6 ${i === 0 ? 'border-luna-aqua' : 'border-[#C6D4E6]'}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-[13px] font-semibold tracking-[.06em] text-luna-sky">0{s.key}</span>
                    <s.icon className="h-[22px] w-[22px] text-luna-royal" aria-hidden="true" />
                  </div>
                  <Ed page="tracking" field={`step${s.key}_title`} as="h3" className="mb-2.5 block text-[20px] font-semibold leading-[1.3] text-luna-ink">
                    {s.title}
                  </Ed>
                  <Ed page="tracking" field={`step${s.key}_body`} as="p" multiline className="block text-[13px] leading-[1.7] text-luna-body">
                    {s.body}
                  </Ed>
                </div>
              ))}
            </div>
          </section>
        </Block>
      </div>

      {/* ── Transparency band ── */}
      <Block name="tracking-transparency">
        <section className="relative bg-luna-ink">
          <svg viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-[-1px] block h-[clamp(40px,5vw,80px)] w-full">
            <path d="M0,52 C260,0 470,86 730,72 C980,59 1200,0 1440,30 L1440,0 L0,0 Z" fill="#F4F7FB" />
          </svg>
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(88px,11vw,152px)', paddingBottom: 'clamp(56px,7vw,96px)' }}>
            <div className="max-w-[40em]">
              <Ed page="tracking" field="transparency_eyebrow" as="p" className="mb-[18px] block text-[13px] font-semibold uppercase tracking-[0.2em] text-luna-aqua">
                {transparencyEyebrow}
              </Ed>
              <Ed page="tracking" field="transparency_body" as="p" multiline className="block text-[20px] font-normal leading-[1.6] text-white">
                {transparencyBody}
              </Ed>
            </div>
          </div>
        </section>
      </Block>

      {/* ── FAQ ── */}
      <Block name="tracking-faq">
        <section className="bg-white">
          <div className="mx-auto max-w-[1220px] px-5 sm:px-8" style={{ paddingTop: 'clamp(48px,6vw,88px)', paddingBottom: 'clamp(56px,7vw,104px)' }}>
            <Ed page="tracking" field="faq_title" as="h2" className="mb-[clamp(24px,3vw,40px)] block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
              {faqTitle}
            </Ed>
            <div className="flex max-w-[52em] flex-col gap-3">
              {faqs.map((f, i) => {
                const open = faqOpen === i;
                return (
                  <div key={i} className="overflow-hidden rounded-[10px] border border-[#DCE5F0] bg-[#F7FAFE]">
                    <button
                      type="button"
                      onClick={() => setFaqOpen(open ? null : i)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-4 px-5 py-[18px] text-left text-[13px] font-semibold text-luna-ink transition-colors hover:bg-[#EEF4FC]"
                    >
                      {f.q}
                      {open
                        ? <Minus className="h-[17px] w-[17px] flex-none text-luna-sky" aria-hidden="true" />
                        : <Plus className="h-[17px] w-[17px] flex-none text-luna-sky" aria-hidden="true" />}
                    </button>
                    {open && (
                      <p className="px-5 pb-5 text-[13px] leading-[1.75] text-luna-body">{f.a}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-[clamp(28px,3vw,40px)] text-[13px] leading-[1.7] text-luna-body">
              {t('tracking.faq_more')}{' '}
              <Link to={urlFor('contact', lang)} className="font-semibold text-luna-sky hover:underline">
                {t('tracking.faq_more_cta')}
              </Link>
            </p>
          </div>
        </section>
      </Block>
    </>
  );
}
