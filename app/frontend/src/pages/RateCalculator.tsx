import { useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { SEO } from '@/components/SEO';
import { urlFor, blogPostUrl } from '@/lib/url/routes';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';
import { createConversation, sendMessage, guestCreateConversation, writeGuestToken } from '@/lib/support-chat';
import {
  computeQuote, formatEuros, transitTimeFor,
  type PricingConfig, type ModeResult, type PricedResult, type Mode, type QuoteReason,
} from '@/lib/pricing/engine';
import { fetchActivePricingConfig } from '@/lib/pricing/config';

/**
 * Shipping price calculator — Brussels → Kinshasa (/calculateur).
 *
 * Visual system from the Claude Design "Calculateur" project (2026-09-18):
 * elevated card overlapping the hero, tinted form panel + white results with a
 * cyan bar and column dividers, numbered "how" list, mode cards with top rules,
 * example cards, "+"-chevron FAQ. Logic is unchanged: all prices come from the
 * pure engine over the active pricing_config; quote panels open a support
 * conversation with the entered values; copy is admin-editable via useContent.
 * Only the PAGE content is rendered here — the shared Navbar/Footer (and their
 * logos) come from PublicLayout and are not touched.
 */

const P = 'calculator';
type DestChoice = 'kinshasa' | 'other';
const MODES: Mode[] = ['express', 'cargo', 'sea'];

const ICON_PATHS: Record<string, string> = {
  plane: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7',
  box: 'M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8zM3.3 7 12 12l8.7-5M12 22V12',
  ship: 'M3 19.5a5 5 0 0 0 2.5-1.3 5 5 0 0 1 6 0 5 5 0 0 0 6 0 5 5 0 0 0 .5.4M4.5 17 2.5 10h19l-2 7M12 10V4.5M8.5 7h7',
};
const MODE_ICON: Record<Mode, string> = { express: 'plane', cargo: 'box', sea: 'ship' };

function Icon({ name, color = '#2077C3', size = 21 }: { name: string; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const num = (s: string): number | null => {
  if (s == null || s.trim() === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const fmtKg = (n: number) => `${Number(n.toFixed(3))}`;
const fmtM3 = (n: number) => `${Number(n.toFixed(3))}`;

// Shared inline styles (mirroring the design's exact values).
const WRAP: React.CSSProperties = { maxWidth: 1200, margin: '0 auto', padding: 'clamp(56px,7vw,96px) clamp(20px,5vw,48px)' };
const H2: React.CSSProperties = { fontSize: 'clamp(28px,3.2vw,42px)', lineHeight: 1.1, fontWeight: 600, letterSpacing: '-.025em', margin: 0 };
const LABEL: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, letterSpacing: '.01em' };
const INPUT: React.CSSProperties = { marginTop: 8, width: '100%', padding: '12px 14px', border: '1px solid rgba(42,67,128,.24)', borderRadius: 10, background: '#fff', fontSize: 16, fontVariantNumeric: 'tabular-nums' };
const NOTE: React.CSSProperties = { marginTop: 8, fontSize: 13.5, lineHeight: 1.5, color: '#4A5A75' };
const HAIR = '1px solid rgba(42,67,128,.14)';

export default function RateCalculator() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language.startsWith('en') ? 'en' : 'fr';
  const { user } = useAuth();

  const metaTitle = useContent(P, 'meta_title', t('calc.meta_title'));
  const metaDescription = useContent(P, 'meta_description', t('calc.meta_description'));

  // FAQ — freight/transport Q&A. Each answer may carry ONE internal link (split
  // text + <Link>, since the project has no <Trans>). FaqJsonLd is fed the
  // plain-text version so the FAQPage schema always matches the visible answer.
  const BLOG = {
    send: { fr: 'envoyer-colis-belgique-kinshasa', en: 'send-parcel-belgium-kinshasa' },
    volweight: { fr: 'calcul-poids-volumetrique-colis', en: 'calculate-volumetric-weight-chargeable-weight' },
    airsea: { fr: 'fret-aerien-ou-maritime-choisir', en: 'air-or-sea-freight-how-to-choose' },
    incoterms: { fr: 'incoterms-dap-ddp-frais-transport-international', en: 'incoterms-dap-vs-ddp-international-shipping-costs' },
  };
  const blogHref = (b: { fr: string; en: string }) => blogPostUrl(lang === 'fr' ? b.fr : b.en, lang);
  const FAQ_DEFS: { k: string; link?: { href: string; labelKey: string } }[] = [
    { k: 'how_send', link: { href: blogHref(BLOG.send), labelKey: 'l_how_send' } },
    { k: 'price_calc' },
    { k: 'weight' },
    { k: 'volumetric' },
    { k: 'volume_calc', link: { href: blogHref(BLOG.volweight), labelKey: 'l_volume_calc' } },
    { k: 'air_vs_sea', link: { href: blogHref(BLOG.airsea), labelKey: 'l_air_vs_sea' } },
    { k: 'when_air' },
    { k: 'when_sea' },
    { k: 'multi' },
    { k: 'bulky', link: { href: urlFor('pricing', lang), labelKey: 'l_bulky' } },
    { k: 'pallet', link: { href: urlFor('pricing', lang), labelKey: 'l_pallet' } },
    { k: 'container', link: { href: urlFor('forwarding', lang), labelKey: 'l_container' } },
    { k: 'customs', link: { href: blogHref(BLOG.incoterms), labelKey: 'l_customs' } },
    { k: 'delay' },
    { k: 'deliver_kin' },
    { k: 'other_dest', link: { href: urlFor('pricing', lang), labelKey: 'l_other_dest' } },
    { k: 'devis', link: { href: urlFor('pricing', lang), labelKey: 'l_devis' } },
  ];
  const faq = FAQ_DEFS.map(({ k, link }) => {
    const aRaw = t(`calc.a_${k}`);
    const label = link ? t(`calc.${link.labelKey}`) : null;
    return {
      q: t(`calc.q_${k}`),
      aRaw,
      link: link && label ? { href: link.href, label } : null,
      aText: label ? `${aRaw} ${label}` : aRaw,
    };
  });
  const faqJsonLd = faq.map((f) => ({ q: f.q, a: f.aText }));

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

  const hasAnyInput = input.weightKg != null || input.volumeM3 != null
    || (input.lengthCm != null && input.widthCm != null && input.heightCm != null);

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

  const summaryLines = useMemo(() => {
    const lines: string[] = [`${t('calc.field_destination')}: ${destination === 'kinshasa' ? 'Kinshasa' : t('calc.dest_other')}`];
    lines.push(`${t('calc.sum_origin')}: Bruxelles`);
    if (input.weightKg != null) lines.push(`${t('calc.field_weight')}: ${fmtKg(input.weightKg)} kg`);
    if (input.lengthCm != null && input.widthCm != null && input.heightCm != null) lines.push(`${t('calc.sum_dims')}: ${input.lengthCm} × ${input.widthCm} × ${input.heightCm} cm`);
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

  const colResult = (m: Mode): ColState => {
    if (!config) return { kind: configError ? 'unavailable' : 'loading', mode: m };
    return (quote ? quote[m] : { kind: 'empty', mode: m }) as ColState;
  };

  return (
    <div className="luna-calc" style={{ background: '#fff', color: '#0A1650', fontFamily: "'Poppins',system-ui,sans-serif", fontSize: 17, lineHeight: 1.55 }}>
      <SEO title={metaTitle} description={metaDescription} />
      <FaqJsonLd items={faqJsonLd} />
      <style>{CALC_CSS}</style>
      <div aria-live="polite" className="sr-only">{live}</div>

      {/* ── Hero ── */}
      <section style={{ background: 'linear-gradient(135deg,#0A1650 0%,#0D2E6B 62%,#123A7E 100%)', color: '#fff' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(52px,7vw,92px) clamp(20px,5vw,48px) clamp(84px,9vw,120px)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 16px', border: '1px solid rgba(31,224,240,.45)', borderRadius: 999, fontSize: 14, fontWeight: 500, color: '#C9F7FC' }}>
            <span style={{ width: 22, height: 1, background: '#1FE0F0' }} />{t('calc.corridor_badge')}
          </span>
          <Ed page={P} field="hero_title" as="h1" className="block mt-[22px] max-w-[16ch] text-[clamp(34px,5vw,60px)] leading-[1.06] font-semibold tracking-[-0.028em]">
            {t('calc.hero_title')}
          </Ed>
          <Ed page={P} field="hero_intro" as="p" multiline className="block mt-5 max-w-[58ch] text-[clamp(17px,1.5vw,20px)] text-[#CBDDF2]">
            {t('calc.hero_intro')}
          </Ed>
        </div>
      </section>

      {/* ── Calculator (elevated card overlapping the hero) ── */}
      <section style={{ background: '#F4F7FB', borderBottom: HAIR }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,5vw,48px) clamp(56px,7vw,92px)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', background: '#fff', border: HAIR, borderRadius: 20, boxShadow: '0 26px 60px -30px rgba(10,22,80,.42),0 2px 6px rgba(10,22,80,.05)', overflow: 'hidden', marginTop: -60 }}>

            {/* Form */}
            <form style={{ flex: '1 1 440px', maxWidth: 600, background: '#F8FAFD', borderRight: HAIR, padding: 'clamp(22px,2.4vw,32px)' }} onSubmit={(e) => e.preventDefault()}>
              <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', margin: 0 }}>{t('calc.form_title')}</h2>
              <p style={{ marginTop: 6, fontSize: 14, color: '#4A5A75' }}>{t('calc.form_hint')}</p>

              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '18px 16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="luna-dest" style={LABEL}>{t('calc.field_destination')}</label>
                  <select id="luna-dest" value={destination} onChange={(e) => setDestination(e.target.value as DestChoice)} style={INPUT}>
                    <option value="kinshasa">{t('calc.dest_kinshasa')}</option>
                    <option value="other">{t('calc.dest_other')}</option>
                  </select>
                  <p style={NOTE}>{t('calc.dest_hint')}</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label htmlFor="luna-weight" style={LABEL}>{t('calc.field_weight')} <span style={{ fontWeight: 400, color: '#4A5A75' }}>(kg)</span></label>
                  <input id="luna-weight" inputMode="decimal" placeholder="6" value={weight} onChange={(e) => setWeight(e.target.value)} style={{ ...INPUT, marginTop: 'auto' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label htmlFor="luna-qty" style={LABEL}>{t('calc.field_parcels')}</label>
                  <input id="luna-qty" inputMode="numeric" placeholder="1" value={parcels} onChange={(e) => setParcels(e.target.value)} style={{ ...INPUT, marginTop: 'auto' }} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <span id="luna-dims-label" style={LABEL}>{t('calc.field_dims')} <span style={{ fontWeight: 400, color: '#4A5A75' }}>(cm)</span></span>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }} role="group" aria-labelledby="luna-dims-label">
                    <input aria-label={t('calc.dim_length')} inputMode="numeric" placeholder="60" value={length} onChange={(e) => setLength(e.target.value)} style={{ ...INPUT, marginTop: 0, padding: '12px 10px', textAlign: 'center' }} />
                    <input aria-label={t('calc.dim_width')} inputMode="numeric" placeholder="40" value={width} onChange={(e) => setWidth(e.target.value)} style={{ ...INPUT, marginTop: 0, padding: '12px 10px', textAlign: 'center' }} />
                    <input aria-label={t('calc.dim_height')} inputMode="numeric" placeholder="40" value={height} onChange={(e) => setHeight(e.target.value)} style={{ ...INPUT, marginTop: 0, padding: '12px 10px', textAlign: 'center' }} />
                  </div>
                  <p style={NOTE}>{t('calc.dims_hint')}</p>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="luna-vol" style={LABEL}>{t('calc.field_volume')} <span style={{ fontWeight: 400, color: '#4A5A75' }}>(m³)</span></label>
                  <input id="luna-vol" inputMode="decimal" placeholder="3" value={volume} onChange={(e) => setVolume(e.target.value)} style={INPUT} />
                  <p style={NOTE}>{t('calc.volume_hint')}</p>
                </div>
              </div>

              <div style={{ marginTop: 22, paddingTop: 20, borderTop: HAIR }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#4A5A75' }}>{t('calc.presets_title')}</span>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <PresetBtn label={t('calc.preset_carton_std')} onClick={() => applyPreset({ l: 60, w: 40, h: 40 })} />
                  <PresetBtn label={t('calc.preset_carton_small')} onClick={() => applyPreset({ l: 40, w: 30, h: 30 })} />
                  <PresetBtn label={t('calc.preset_suitcase')} onClick={() => applyPreset({ kg: 23 })} />
                  <PresetBtn label={t('calc.preset_move')} onClick={() => applyPreset({ m3: 3 })} />
                </div>
              </div>
            </form>

            {/* Results */}
            <div style={{ flex: '1.3 1 480px', minWidth: 0, padding: 'clamp(22px,2.4vw,32px)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', margin: 0 }}>{t('calc.results_title')}</h2>
                <span style={{ fontSize: 13.5, color: '#4A5A75' }}>{t('calc.results_meta')}</span>
              </div>
              {config && !hasAnyInput ? (
                <div style={{ marginTop: 18, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px dashed rgba(32,119,195,.4)', borderRadius: 14, background: '#F4F7FB', padding: 'clamp(28px,4vw,48px) 24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 14 }}>
                    <Icon name="plane" color="#2077C3" size={26} />
                    <Icon name="box" color="#2077C3" size={26} />
                    <Icon name="ship" color="#2077C3" size={26} />
                  </div>
                  <p style={{ margin: 0, fontSize: 16.5, fontWeight: 600, color: '#0D2E6B' }}>{t('calc.results_empty_title')}</p>
                  <p style={{ margin: '6px auto 0', maxWidth: '44ch', fontSize: 14.5, color: '#4A5A75' }}>{t('calc.enter_prompt')}</p>
                </div>
              ) : (
                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
                  {MODES.map((m, i) => (
                    <ModeColumn
                      key={m} mode={m} result={colResult(m)} index={i}
                      config={config} lang={lang} summaryLines={summaryLines} user={!!user} hasAnyInput={hasAnyInput}
                    />
                  ))}
                </div>
              )}
              {config?.effectiveFrom && <p style={{ marginTop: 14, fontSize: 13, color: '#4A5A75' }}>{t('calc.effective_since', { date: config.effectiveFrom })}</p>}
              {config?.vatStatus && <p style={{ marginTop: 4, fontSize: 13, color: '#4A5A75' }}>{config.vatStatus}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* ── How a freight price is built ── */}
      <Block name="calc-how">
        <section style={{ background: '#fff' }}>
          <div style={WRAP}>
            <div style={{ maxWidth: '70ch' }}>
              <Ed page={P} field="how_title" as="h2" className="block text-[clamp(28px,3.2vw,42px)] leading-[1.1] font-semibold tracking-[-0.025em]">{t('calc.how_title')}</Ed>
              <Ed page={P} field="how_body" as="p" multiline className="block mt-[18px] text-[clamp(17px,1.4vw,19px)] text-[#4A5A75]">{t('calc.how_body')}</Ed>
              <ul style={{ marginTop: 32, listStyle: 'none', padding: 0, margin: '32px 0 0' }}>
                {[1, 2, 3].map((n) => (
                  <li key={n} style={{ display: 'flex', gap: 18, padding: '18px 0', borderTop: HAIR }}>
                    <span style={{ flex: '0 0 auto', fontSize: 13, fontWeight: 600, letterSpacing: '.08em', color: '#2077C3', paddingTop: 4, fontVariantNumeric: 'tabular-nums' }}>{`0${n}`}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: '#0A1650' }}>{t(`calc.how_b${n}_title`)}</span>
                      <span style={{ display: 'block', marginTop: 4, fontSize: 16.5, color: '#4A5A75' }}>{t(`calc.how_b${n}_body`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: 28, padding: '18px 20px', borderLeft: '2px solid #1FA3C9', background: '#F4F7FB', fontSize: 16, lineHeight: 1.55, color: '#0A1650' }}>
                {t('calc.customs_note', { fee: config ? formatEuros(config.customsAdminFeeCents ?? 12500, lang) : '' })}
              </p>
            </div>
          </div>
        </section>
      </Block>

      {/* ── Three modes ── */}
      <Block name="calc-modes">
        <section style={{ background: '#F4F7FB', borderTop: HAIR, borderBottom: HAIR }}>
          <div style={WRAP}>
            <h2 style={H2}>{t('calc.modes_title')}</h2>
            <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 'clamp(20px,2.5vw,32px)' }}>
              {MODES.map((m) => {
                const transit = config ? transitTimeFor(config, m) : null;
                return (
                  <div key={m} style={{ padding: 22, background: '#EAF3FC', border: '1px solid rgba(32,119,195,.28)', borderTop: '3px solid #0D2E6B', borderRadius: 14, boxShadow: '0 12px 26px -20px rgba(10,22,80,.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name={MODE_ICON[m]} color="#002F67" size={22} />
                      <h3 style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-.01em', color: '#0D2E6B', margin: 0 }}>{t(`calc.mode_${m}`)}</h3>
                    </div>
                    <p style={{ marginTop: 12, fontSize: 16.5, color: '#4A5A75' }}>{t(`calc.mode_${m}_suits`)}</p>
                    <p style={{ marginTop: 16, fontSize: 20, fontWeight: 600, color: '#002F67', fontVariantNumeric: 'tabular-nums' }}>{t(`calc.mode_${m}_rate`)}</p>
                    {transit && (
                      <p style={{ marginTop: 18, paddingTop: 12, borderTop: '1px dashed rgba(42,67,128,.3)', fontSize: 14.5, color: '#4A5A75' }}>{t('calc.transit_label', { value: transit })}</p>
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
          <section style={{ background: '#fff' }}>
            <div style={WRAP}>
              <h2 style={H2}>{t('calc.examples_title')}</h2>
              <p style={{ marginTop: 14, maxWidth: '60ch', fontSize: 17, color: '#4A5A75' }}>{t('calc.examples_intro')}</p>
              <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 'clamp(20px,2.4vw,32px)' }}>
                <WorkedExample titleKey="ex_carton" mode="express" input={{ weightKg: 6, lengthCm: 60, widthCm: 40, heightCm: 40 }} config={config} lang={lang} />
                <WorkedExample titleKey="ex_express" mode="express" input={{ weightKg: 0.4 }} config={config} lang={lang} />
                <WorkedExample titleKey="ex_sea" mode="sea" input={{ volumeM3: 3 }} config={config} lang={lang} />
                <WorkedExample titleKey="ex_carton_sea" mode="sea" input={{ lengthCm: 60, widthCm: 40, heightCm: 40 }} config={config} lang={lang} />
              </div>
            </div>
          </section>
        </Block>
      )}

      {/* ── What's included (only confirmed entries) ── */}
      <IncludesBlock config={config} lang={lang} />

      {/* ── FAQ ── */}
      <Block name="calc-faq">
        <section style={{ background: '#F4F7FB', borderTop: HAIR }}>
          <div style={WRAP}>
            <h2 style={H2}>{t('calc.faq_title')}</h2>
            <p style={{ marginTop: 14, maxWidth: '70ch', fontSize: 17, color: '#4A5A75' }}>{t('calc.faq_intro')}</p>
            <div style={{ marginTop: 28, maxWidth: 860, borderTop: HAIR }}>
              {faq.map((f, i) => <FaqRow key={i} q={f.q} a={answerNode(f.aRaw, f.link)} />)}
            </div>
            <p style={{ marginTop: 24, maxWidth: '70ch', fontSize: 15, color: '#4A5A75' }}>
              {t('calc.faq_more_lead')}{' '}
              <Link to={urlFor('blogIndex', lang)} className="faq-link" style={FAQ_LINK}>{t('calc.faq_more_link')}</Link>.
            </p>
          </div>
        </section>
      </Block>
    </div>
  );
}

/* ── column state ── */
type ColState =
  | PricedResult
  | { kind: 'quote'; mode: Mode; reason: QuoteReason }
  | { kind: 'empty'; mode: Mode }
  | { kind: 'loading'; mode: Mode }
  | { kind: 'unavailable'; mode: Mode };

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="preset" onClick={onClick}
      style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid rgba(42,67,128,.24)', background: '#fff', color: '#0D2E6B', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
      {label}
    </button>
  );
}

function ModeColumn({ mode, result, index, config, lang, summaryLines, user, hasAnyInput }: {
  mode: Mode; result: ColState; index: number; config: PricingConfig | null; lang: 'fr' | 'en';
  summaryLines: string[]; user: boolean; hasAnyInput: boolean;
}) {
  const { t } = useTranslation();
  const transit = config ? transitTimeFor(config, mode) : null;
  const wrap: React.CSSProperties = { padding: '0 clamp(14px,1.6vw,22px)', borderLeft: index === 0 ? '0' : HAIR, minWidth: 0, marginBottom: 8 };

  return (
    <div style={wrap}>
      <div style={{ height: 2, width: 34, background: '#1FE0F0', borderRadius: 2 }} />
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon name={MODE_ICON[mode]} color="#2077C3" size={21} />
        <h3 style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '-.01em', color: '#0D2E6B', margin: 0 }}>{t(`calc.mode_${mode}`)}</h3>
      </div>

      {result.kind === 'price' && <PriceBody result={result} lang={lang} transit={transit} />}

      {result.kind === 'empty' && (
        <p style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.5, color: '#4A5A75' }}>
          {!hasAnyInput ? t('calc.enter_prompt') : mode === 'sea' ? t('calc.empty_sea') : t('calc.empty_air')}
        </p>
      )}

      {result.kind === 'loading' && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }} className="luna-skel">
          <span style={{ height: 32, width: '70%', borderRadius: 8, background: '#E4EDF7' }} />
          <span style={{ height: 12, width: '90%', borderRadius: 6, background: '#EDF2F9' }} />
          <span style={{ height: 12, width: '60%', borderRadius: 6, background: '#EDF2F9' }} />
          <span style={{ marginTop: 4, fontSize: 13, color: '#4A5A75' }}>{t('calc.loading')}</span>
        </div>
      )}

      {result.kind === 'unavailable' && (
        <div style={{ marginTop: 16, padding: 14, border: '1px dashed rgba(42,67,128,.3)', borderRadius: 12, background: '#F8FAFD' }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 500, color: '#0A1650' }}>{t('calc.config_unavailable_title')}</p>
          <p style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.5, color: '#4A5A75' }}>{t('calc.config_unavailable')}</p>
        </div>
      )}

      {result.kind === 'quote' && (
        <QuotePanel mode={mode} reason={result.reason} summaryLines={summaryLines} user={user} />
      )}
    </div>
  );
}

function PriceBody({ result, lang, transit }: { result: PricedResult; lang: 'fr' | 'en'; transit: string | null }) {
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
    <div>
      <p style={{ marginTop: 14, fontSize: 'clamp(30px,3vw,38px)', lineHeight: 1, fontWeight: 600, letterSpacing: '-.03em', color: '#002F67', fontVariantNumeric: 'tabular-nums' }}>{formatEuros(result.totalCents, lang)}</p>
      <p style={{ marginTop: 8, fontSize: 13.5, fontWeight: 500, color: '#2077C3' }}>{t(`calc.basis_${result.chargeableBasis}`)}</p>
      <ul style={{ marginTop: 16, paddingTop: 14, borderTop: HAIR, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11, margin: '16px 0 0' }}>
        {result.volumetricWeightKg != null && (
          <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 14.5, color: '#0A1650' }}>{t('calc.vol_weight')}</span>
            <span style={{ fontSize: 14.5, color: '#0A1650', fontVariantNumeric: 'tabular-nums' }}>{fmtKg(result.volumetricWeightKg)} kg</span>
          </li>
        )}
        {result.lines.map((l, i) => (
          <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, color: '#0A1650' }}>{t(`calc.line_${l.key}`)}</span>
              {detail(l) && <span style={{ display: 'block', fontSize: 12.5, color: '#4A5A75', fontVariantNumeric: 'tabular-nums' }}>{detail(l)}</span>}
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 500, color: '#0A1650', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatEuros(Math.round(l.cents), lang)}</span>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 16, fontSize: 12.5, color: '#4A5A75' }}>{t('calc.estimate_note')}</p>
      {transit && <p style={{ marginTop: 6, fontSize: 12.5, color: '#4A5A75' }}>{t('calc.transit_label', { value: transit })}</p>}
    </div>
  );
}

function QuotePanel({ mode, reason, summaryLines, user }: { mode: Mode; reason: QuoteReason; summaryLines: string[]; user: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!user && (!email.trim() || !name.trim())) return;
    const subject = t('calc.quote_subject', { mode: t(`calc.mode_${mode}`) });
    const body = [
      t('calc.quote_intro', { mode: t(`calc.mode_${mode}`) }), '',
      ...summaryLines,
      `${t('calc.quote_reason_label')}: ${t(`calc.quote_reason_${reason}`)}`,
      message.trim() ? `\n${message.trim()}` : null,
    ].filter((x) => x != null).join('\n');
    setBusy(true);
    try {
      if (user) { const conv = await createConversation(subject); await sendMessage(conv.id, body); }
      else { const row = await guestCreateConversation({ email: email.trim(), name: name.trim(), subject, body }); writeGuestToken(row.guest_token); }
      setSent(true);
      toast.success(t('calc.quote_success_title'));
      trackEvent('generate_lead', { form: 'calculator', mode, reason, has_account: !!user });
    } catch { toast.error(t('calc.quote_error')); }
    finally { setBusy(false); }
  };

  const qLabel: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#4A5A75' };
  const qInput: React.CSSProperties = { marginTop: 5, width: '100%', padding: '10px 12px', border: '1px solid rgba(42,67,128,.24)', borderRadius: 9, background: '#fff', fontSize: 15, fontWeight: 400, letterSpacing: 'normal', textTransform: 'none', color: '#0A1650' };

  return (
    <div style={{ marginTop: 14, padding: 16, border: '1px solid rgba(32,119,195,.3)', borderRadius: 12, background: '#EFF6FD' }}>
      <p style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: '#0D2E6B' }}>{t('calc.quote_title')}</p>
      <p style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.5, color: '#4A5A75' }}>{t(`calc.quote_reason_${reason}`)}</p>

      {sent ? (
        <p style={{ marginTop: 14, padding: '11px 13px', borderRadius: 10, background: '#fff', border: '1px solid rgba(32,119,195,.3)', fontSize: 13.5, color: '#0D2E6B' }}>{t('calc.quote_success_body')}</p>
      ) : !open ? (
        <button type="button" className="qbtn" onClick={() => setOpen(true)}
          style={{ marginTop: 14, width: '100%', padding: '11px 16px', border: 0, borderRadius: 10, background: '#002F67', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
          {t('calc.quote_cta')}
        </button>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!user && (
            <>
              <label style={qLabel}>{t('calc.quote_name')}
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('calc.quote_name')} style={qInput} required />
              </label>
              <label style={qLabel}>{t('calc.quote_email')}
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('calc.quote_email')} style={qInput} required />
              </label>
            </>
          )}
          <label style={qLabel}>{t('calc.quote_message')}
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('calc.quote_message')} style={{ ...qInput, resize: 'vertical' }} />
          </label>
          <button type="button" onClick={submit} disabled={busy}
            style={{ padding: '11px 16px', border: 0, borderRadius: 10, background: '#1FE0F0', color: '#002F67', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? t('calc.quote_sending') : t('calc.quote_submit')}
          </button>
        </div>
      )}
    </div>
  );
}

function WorkedExample({ titleKey, mode, input, config, lang }: {
  titleKey: string; mode: Mode; input: Parameters<typeof computeQuote>[0]; config: PricingConfig; lang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const r = computeQuote(input, config)[mode];
  return (
    <div style={{ padding: '24px 26px', background: '#EAF3FC', border: '1px solid rgba(32,119,195,.28)', borderTop: '3px solid #1FA3C9', borderRadius: 14, boxShadow: '0 12px 26px -20px rgba(10,22,80,.4)' }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-.01em', color: '#0D2E6B', margin: 0 }}>{t(`calc.${titleKey}_title`)}</h3>
      <p style={{ marginTop: 8, fontSize: 15.5, lineHeight: 1.5, color: '#4A5A75' }}>{t(`calc.${titleKey}_input`)}</p>
      {r.kind === 'price' && (
        <>
          <ul style={{ marginTop: 18, paddingTop: 16, borderTop: HAIR, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11, margin: '18px 0 0' }}>
            {r.volumetricWeightKg != null && (
              <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 15, color: '#0A1650' }}>{t('calc.vol_weight')}</span>
                <span style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmtKg(r.volumetricWeightKg)} kg</span>
              </li>
            )}
            {r.lines.map((l, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ minWidth: 0, fontSize: 15, color: '#0A1650' }}>{t(`calc.line_${l.key}`)}</span>
                <span style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatEuros(Math.round(l.cents), lang)}</span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 18, paddingTop: 14, borderTop: HAIR, fontSize: 17, fontWeight: 600, color: '#002F67', fontVariantNumeric: 'tabular-nums' }}>
            {t(`calc.mode_${mode}`)} — {formatEuros(r.totalCents, lang)}
          </p>
        </>
      )}
    </div>
  );
}

function IncludesBlock({ config, lang }: { config: PricingConfig | null; lang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  void lang;
  const includes = config?.includes ?? null;
  const entries = includes ? Object.entries(includes).filter(([, v]) => v != null && String(v).trim() !== '') : [];
  if (entries.length === 0) return null;
  return (
    <Block name="calc-included">
      <section style={{ background: '#F4F7FB', borderTop: HAIR }}>
        <div style={WRAP}>
          <h2 style={H2}>{t('calc.included_title')}</h2>
          <ul style={{ marginTop: 32, listStyle: 'none', padding: 0, margin: '32px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '14px 32px', maxWidth: 900 }}>
            {entries.map(([k, v]) => (
              <li key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: HAIR }}>
                <Icon name="ship" color="#1FA3C9" size={18} />
                <span style={{ fontSize: 15, color: '#0A1650' }}>{String(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Block>
  );
}

const FAQ_LINK: React.CSSProperties = { color: '#2077C3', fontWeight: 500, textDecoration: 'none' };
const FAQ_P: React.CSSProperties = { fontSize: 16.5, lineHeight: 1.6, color: '#4A5A75', margin: 0 };

/** Build a FAQ answer as paragraphs (split on blank lines), with an optional
 *  internal <Link> appended to the last paragraph (split-text pattern, no <Trans>). */
function answerNode(aRaw: string, link: { href: string; label: string } | null): React.ReactNode {
  const paras = aRaw.split('\n\n');
  return (
    <>
      {paras.map((p, i) => {
        const last = i === paras.length - 1;
        return (
          <p key={i} style={{ ...FAQ_P, marginTop: i ? '0.75em' : 0 }}>
            {p}
            {last && link ? <>{' '}<Link to={link.href} className="faq-link" style={FAQ_LINK}>{link.label}</Link></> : null}
          </p>
        );
      })}
    </>
  );
}

function FaqRow({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: HAIR }}>
      <button type="button" className="faq-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 4px', background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer', fontSize: 'clamp(17px,1.5vw,19px)', fontWeight: 500, color: '#0D2E6B' }}>
        <span style={{ minWidth: 0 }}>{q}</span>
        <span style={{ flex: '0 0 auto', width: 28, height: 28, display: 'grid', placeItems: 'center', border: '1px solid rgba(42,67,128,.24)', borderRadius: 999, fontSize: 18, color: '#2077C3', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .18s ease' }} className="faq-chev">+</span>
      </button>
      {open && <div style={{ padding: '0 4px 24px', maxWidth: '66ch' }}>{a}</div>}
    </div>
  );
}

function FaqJsonLd({ items }: { items: { q: string; a: string }[] }) {
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })),
  };
  return <Helmet><script type="application/ld+json">{JSON.stringify(jsonLd)}</script></Helmet>;
}

const CALC_CSS = `
.luna-calc input:focus,.luna-calc select:focus,.luna-calc textarea:focus{outline:2px solid #0D2E6B;outline-offset:1px;border-color:#0D2E6B}
.luna-calc .preset:hover{border-color:#2077C3;color:#0D2E6B;background:#EAF3FC}
.luna-calc .preset:focus-visible,.luna-calc .qbtn:focus-visible,.luna-calc .faq-btn:focus-visible{outline:2px solid #0D2E6B;outline-offset:2px}
.luna-calc .qbtn:hover{background:#0D2E6B}
.luna-calc .faq-btn:hover{color:#002F67}
.luna-calc .faq-link:hover{text-decoration:underline;color:#0D2E6B}
@keyframes lunaSkeleton{0%{opacity:.45}50%{opacity:.9}100%{opacity:.45}}
.luna-calc .luna-skel{animation:lunaSkeleton 1.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.luna-calc .luna-skel{animation:none}.luna-calc .faq-chev{transition:none}}
`;
