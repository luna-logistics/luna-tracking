import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plane, Ship, Truck, Search, Home, PackagePlus,
  ArrowRight, Package, ClipboardList, HandCoins, MapPinned,
  ChevronRight, Phone,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { urlFor } from '@/lib/url/routes';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { useState, useRef, useCallback } from 'react';

export default function Index() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();

  const metaTitle       = useContent('home', 'meta_title',       t('home.meta_title'));
  const metaDescription = useContent('home', 'meta_description', t('home.meta_description'));
  const heroTitle       = useContent('home', 'hero_title',       t('home.hero_title'));
  const heroSubtitle    = useContent('home', 'hero_subtitle',    t('home.hero_subtitle'));
  const heroSubtitleShort = t('home.hero_subtitle_short');
  const pillarsTitle    = useContent('home', 'pillars_title',    t('home.pillars_title'));
  const pillarsSubtitle = useContent('home', 'pillars_subtitle', t('home.pillars_subtitle'));
  const howTitle        = useContent('home', 'how_title',        t('home.how_title'));
  const ctaText         = useContent('home', 'cta_text',         t('home.cta_text'));

  // Tracking field state
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingMsg, setTrackingMsg] = useState('');

  const handleTrack = () => {
    const val = trackingNumber.trim();
    if (!val) {
      setTrackingMsg(t('home.track_empty_hint'));
      return;
    }
    navigate(`${urlFor('tracking', lang)}?q=${encodeURIComponent(val)}`);
  };

  // Carousel ref + scroll
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollCarousel = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 4) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      el.scrollTo({ left: el.scrollLeft + 150, behavior: 'smooth' });
    }
  }, []);

  // Capability strip — 6 short labels + links
  const caps = [
    { icon: Plane,       label: t('home.cap_air'),      shortLabel: t('home.cap_air_short'),      href: `${urlFor('pricing', lang)}?mode=air` },
    { icon: Ship,        label: t('home.cap_sea'),      shortLabel: t('home.cap_sea_short'),      href: `${urlFor('pricing', lang)}?mode=sea` },
    { icon: Truck,       label: t('home.cap_ground'),   shortLabel: t('home.cap_ground_short'),   href: `${urlFor('pricing', lang)}?mode=ground` },
    { icon: Search,      label: t('home.cap_tracking'), shortLabel: t('home.cap_tracking_short'), href: urlFor('tracking', lang) },
    { icon: Home,        label: t('home.cap_home'),     shortLabel: t('home.cap_home_short'),     href: urlFor('pricing', lang) },
    { icon: PackagePlus, label: t('home.cap_pickup'),   shortLabel: t('home.cap_pickup_short'),   href: urlFor('pricing', lang) },
  ];

  // Six "expertises" cards with short body for mobile
  const cards = [
    { key: 'air',      icon: Plane,       image: '/images/services/service-air-freight.webp',      alt: t('home.pillar_air_alt'),      title: useContent('home', 'pillar_air_title',      t('home.pillar_air_title')),      body: useContent('home', 'pillar_air_body',      t('home.pillar_air_body')),      shortBody: t('home.pillar_air_short'),      href: `${urlFor('pricing', lang)}?mode=air` },
    { key: 'sea',      icon: Ship,        image: '/images/services/service-sea-freight.webp',      alt: t('home.pillar_sea_alt'),      title: useContent('home', 'pillar_sea_title',      t('home.pillar_sea_title')),      body: useContent('home', 'pillar_sea_body',      t('home.pillar_sea_body')),      shortBody: t('home.pillar_sea_short'),      href: `${urlFor('pricing', lang)}?mode=sea` },
    { key: 'ground',   icon: Truck,       image: '/images/services/service-ground-transport.webp', alt: t('home.pillar_ground_alt'),   title: useContent('home', 'pillar_ground_title',   t('home.pillar_ground_title')),   body: useContent('home', 'pillar_ground_body',   t('home.pillar_ground_body')),   shortBody: t('home.pillar_ground_short'),   href: `${urlFor('pricing', lang)}?mode=ground` },
    { key: 'tracking', icon: Search,      image: lang === 'en' ? '/images/services/online-parcel-tracking-luna-tracking.webp?v=2' : '/images/services/suivi-colis-en-ligne-luna-tracking.webp?v=2', alt: t('home.pillar_tracking_alt'), title: useContent('home', 'pillar_tracking_title', t('home.pillar_tracking_title')), body: useContent('home', 'pillar_tracking_body', t('home.pillar_tracking_body')), shortBody: t('home.pillar_tracking_short'), href: urlFor('tracking', lang) },
    { key: 'home',     icon: Home,        image: '/images/services/livraison-domicile-luna-tracking.webp', alt: t('home.pillar_home_alt'),     title: useContent('home', 'pillar_home_title',     t('home.pillar_home_title')),     body: useContent('home', 'pillar_home_body',     t('home.pillar_home_body')),     shortBody: t('home.pillar_home_short'),     href: urlFor('pricing', lang) },
    { key: 'pickup',   icon: PackagePlus, image: '/images/services/enlevement-colis-camionnette-luna-tracking.webp', alt: t('home.pillar_pickup_alt'),   title: useContent('home', 'pillar_pickup_title',   t('home.pillar_pickup_title')),   body: useContent('home', 'pillar_pickup_body',   t('home.pillar_pickup_body')),   shortBody: t('home.pillar_pickup_short'),   href: urlFor('pricing', lang) },
  ];

  const steps = [
    { key: '1', icon: ClipboardList, title: useContent('home', 'how_step1_title', t('home.how_step1_title')), body: useContent('home', 'how_step1_body', t('home.how_step1_body')) },
    { key: '2', icon: HandCoins,     title: useContent('home', 'how_step2_title', t('home.how_step2_title')), body: useContent('home', 'how_step2_body', t('home.how_step2_body')) },
    { key: '3', icon: MapPinned,     title: useContent('home', 'how_step3_title', t('home.how_step3_title')), body: useContent('home', 'how_step3_body', t('home.how_step3_body')) },
  ];

  return (
    <>
      <SEO
        title={metaTitle}
        description={metaDescription}
        ogTitle={metaTitle}
        ogDescription={metaDescription}
      />

      {/* ── Hero — navy panel over the Belgium→Congo map ── */}
      <section
        className="relative bg-luna-ink"
        style={{
          backgroundImage:
            "linear-gradient(100deg,rgba(10,22,80,.97) 0%,rgba(10,22,80,.9) 38%,rgba(13,46,107,.5) 66%,rgba(13,46,107,.1) 92%), url('/brand/hero-map.webp')",
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, right center',
          backgroundRepeat: 'no-repeat, no-repeat',
        }}
      >
        {/* Hero content */}
        <div className="relative mx-auto max-w-[1220px] px-4 pt-5 pb-[18px] md:px-[26px] md:py-10 lg:px-10 lg:pt-[84px] lg:pb-[100px]">
          <div className="min-w-0 max-w-full lg:max-w-[min(560px,58%)]">
            {/* Eyebrow */}
            <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-luna-aqua lg:mb-5 lg:text-[13px]">
              {t('home.hero_eyebrow').toUpperCase()}
            </p>

            {/* H1 */}
            <Ed page="home" field="hero_title" as="h1" className="mb-[7px] block text-[25px] font-semibold leading-[1.18] tracking-[-.01em] text-white md:mb-3.5 md:text-[30px] lg:mb-5 lg:text-[32px] lg:leading-[1.2]">
              {heroTitle}
            </Ed>

            {/* Subtitle — short on mobile, full on lg */}
            <div className="mb-3 text-[13.5px] leading-[1.5] text-[#D7E4F5] md:mb-[22px] md:text-[17px] lg:mb-[34px] lg:text-[20px] lg:leading-[1.55] max-w-[34em]">
              <span className="lg:hidden">{heroSubtitleShort}</span>
              <Ed page="home" field="hero_subtitle" as="span" multiline markdown className="hidden lg:inline">
                {heroSubtitle}
              </Ed>
            </div>

            {/* Tracking field — mobile/tablet primary action */}
            <div className="mb-3 lg:hidden">
              <div className="flex items-center gap-[9px] rounded-[10px] border border-[rgba(31,224,240,.45)] bg-[rgba(6,12,38,.55)] pl-3 pr-1">
                <Search className="h-4 w-4 shrink-0 text-luna-aqua" />
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => { setTrackingNumber(e.target.value); setTrackingMsg(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                  placeholder={t('home.track_placeholder')}
                  className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleTrack}
                  className="flex h-[34px] w-[38px] shrink-0 items-center justify-center rounded-[7px] bg-luna-aqua text-luna-ink transition-colors hover:bg-luna-aqua2"
                  aria-label={t('home.track_cta')}
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {trackingMsg && (
                <div className="mt-3 rounded-lg border border-[rgba(31,224,240,.35)] bg-[rgba(31,224,240,.12)] px-[11px] py-[9px] text-[12px] text-[#9BF0FA]">
                  {trackingMsg}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Quote button — outline on mobile (tracking field is primary), solid aqua on lg */}
              <Link
                to={urlFor('pricing', lang)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/55 px-[14px] text-[12.5px] font-semibold tracking-[.02em] text-white transition-colors hover:bg-white/10 lg:h-auto lg:border-0 lg:bg-luna-aqua lg:px-[26px] lg:py-[15px] lg:text-[13px] lg:text-luna-ink lg:hover:bg-luna-aqua2"
              >
                {t('home.hero_cta_quote')} <ArrowRight className="h-[15px] w-[15px]" />
              </Link>
              {/* Track button — desktop only (mobile has the field) */}
              <Link
                to={urlFor('tracking', lang)}
                className="hidden lg:inline-flex items-center gap-2.5 rounded-lg border border-white/50 px-6 py-[15px] text-[13px] font-semibold tracking-[.02em] text-white transition-colors hover:bg-white/10"
              >
                <Package className="h-[17px] w-[17px]" /> {t('home.hero_cta_track')}
              </Link>
              {/* Calculate rate link — mobile/tablet */}
              <Link
                to={urlFor('rateCalculator', lang)}
                className="text-[12.5px] font-medium text-[#9BF0FA] hover:text-white lg:hidden"
              >
                {t('home.calc_tarif')}
              </Link>
            </div>
          </div>
        </div>

        {/* ── Service strip — carousel on mobile, grid on md+ ── */}
        <div className="relative bg-luna-ink pb-[30px] md:pb-14 lg:pb-[clamp(52px,7vw,100px)]">
          {/* Mobile carousel */}
          <div className="md:hidden overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-1.5">
              <span className="text-[9.5px] font-semibold tracking-[.16em] text-[#6E8CC0]">{t('home.services_strip_title')}</span>
              <span className="text-[9.5px] font-semibold tracking-[.16em] text-[#6E8CC0]">{t('home.swipe_hint')}</span>
            </div>
            <div className="relative">
              <div
                ref={carouselRef}
                className="flex gap-[7px] overflow-x-auto pl-4 pr-[46px] pb-1 [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {caps.map((c) => (
                  <Link
                    key={c.shortLabel}
                    to={c.href}
                    className="flex h-9 flex-none items-center gap-[7px] whitespace-nowrap rounded-full border border-luna-hair bg-[rgba(13,46,107,.85)] px-3 [scroll-snap-align:start] transition-colors hover:bg-luna-royal"
                  >
                    <c.icon className="h-[15px] w-[15px] text-luna-aqua" />
                    <span className="text-[11.5px] font-medium text-[#E4EDF9]">{c.shortLabel}</span>
                  </Link>
                ))}
              </div>
              {/* Fade edge + chevron */}
              <div className="pointer-events-none absolute right-0 top-0 h-full w-[46px]" style={{ background: 'linear-gradient(90deg,rgba(10,22,80,0),#0A1650 78%)' }} />
              <button
                type="button"
                onClick={scrollCarousel}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-luna-sky bg-[rgba(10,22,80,.92)] text-luna-aqua transition-colors hover:bg-luna-royal"
                aria-label="Scroll"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* md+ grid (existing layout) */}
          <div className="hidden md:block mx-auto max-w-[1220px] px-[26px] lg:px-10">
            <div
              className="overflow-hidden rounded-[10px] border border-[#4A6FA0]/70"
              style={{ marginTop: 'clamp(28px,4vw,84px)' }}
            >
              <div className="grid grid-cols-2 gap-px bg-[#4A6FA0]/45 nav:grid-cols-3">
                {caps.map((c) => (
                  <div key={c.label} className="flex min-w-0 items-center gap-3 bg-luna-ink/80 px-4 py-[18px] sm:px-6">
                    <c.icon className="h-[22px] w-[22px] shrink-0 text-luna-aqua" />
                    <span className="text-[13px] font-medium text-white">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Wave into the off-white ground */}
        <svg viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] block h-[26px] w-full md:h-12 lg:h-[clamp(48px,6vw,96px)]">
          <path d="M0,58 C260,104 470,14 730,28 C980,41 1200,100 1440,70 L1440,110 L0,110 Z" fill="#F4F7FB" />
        </svg>
      </section>

      <div className="bg-luna-mist">
        {/* ── Nos expertises — 6 cards ── */}
        <Block name="home-pillars">
          <section className="mx-auto max-w-[1220px] px-4 pt-[26px] pb-5 md:px-[26px] md:py-10 lg:px-10 lg:pt-16 lg:pb-[52px]">
            <div className="mb-3 max-w-[44em] lg:mb-6 lg:mb-[clamp(32px,4vw,48px)]">
              <Ed page="home" field="pillars_title" as="h2" className="mb-1 block text-[20px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink md:text-[26px] lg:mb-3 lg:text-[32px]">
                {pillarsTitle}
              </Ed>
              <Ed page="home" field="pillars_subtitle" as="p" className="block text-[13px] font-normal leading-[1.5] text-luna-muted-ink md:text-[17px] lg:text-[20px]">
                {pillarsSubtitle}
              </Ed>
            </div>

            {/* Mobile: horizontal compact cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {cards.map((c) => (
                <Link
                  key={c.key}
                  to={c.href}
                  className="group flex items-start gap-3 rounded-[10px] border border-[#DCE5F0] bg-white p-2.5 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-luna-royal"
                >
                  <img
                    src={c.image}
                    alt={c.alt}
                    width={168}
                    height={132}
                    loading="lazy"
                    decoding="async"
                    className="h-[66px] w-[84px] flex-none rounded-[7px] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold leading-[1.3] text-luna-royal group-hover:text-luna-sky transition-colors">{c.title}</h3>
                    <p className="mt-0.5 text-[11.5px] leading-[1.5] text-luna-body">{c.shortBody}</p>
                  </div>
                  <ChevronRight className="h-[15px] w-[15px] shrink-0 self-center text-luna-sky" />
                </Link>
              ))}
            </div>

            {/* md: 2-col grid with smaller images */}
            <div className="hidden md:grid md:grid-cols-2 md:gap-[14px] lg:hidden">
              {cards.map((c) => (
                <Link
                  key={c.key}
                  to={c.href}
                  className="group flex flex-col overflow-hidden rounded-[10px] border border-[#DCE5F0] bg-white transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-luna-royal"
                >
                  <div className="h-[140px] overflow-hidden">
                    <img src={c.image} alt={c.alt} width={800} height={320} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-1 flex-col px-[18px] pb-5 pt-4">
                    <Ed page="home" field={`pillar_${c.key}_title`} as="h3" className="mb-2 block text-[18px] font-semibold leading-[1.3] text-luna-royal group-hover:text-luna-aqua2 transition-colors">
                      {c.title}
                    </Ed>
                    <Ed page="home" field={`pillar_${c.key}_body`} as="p" multiline className="block text-[13px] leading-[1.7] text-luna-body">
                      {c.body}
                    </Ed>
                    <span className="mt-auto flex items-center gap-1 pt-3 text-[13px] font-semibold text-luna-royal group-hover:text-luna-aqua2 transition-colors">
                      {t('home.pillar_cta')} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* lg: original 3-col layout (unchanged) */}
            <div className="hidden lg:grid lg:gap-5 nav:grid-cols-3">
              {cards.map((c) => (
                <Link
                  key={c.key}
                  to={c.href}
                  className="group flex flex-col overflow-hidden rounded-[10px] border border-[#DCE5F0] bg-white transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-luna-royal"
                >
                  <div className="h-40 overflow-hidden">
                    {c.image ? (
                      <img src={c.image} alt={c.alt} width={800} height={320} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-luna-gradient">
                        <c.icon className="h-12 w-12 text-white/90" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col px-[18px] pb-6 pt-5">
                    <Ed page="home" field={`pillar_${c.key}_title`} as="h3" className="mb-2.5 block text-[20px] font-semibold leading-[1.3] text-luna-royal group-hover:text-luna-aqua2 transition-colors">
                      {c.title}
                    </Ed>
                    <Ed page="home" field={`pillar_${c.key}_body`} as="p" multiline className="block text-[13px] leading-[1.7] text-luna-body">
                      {c.body}
                    </Ed>
                    <span className="mt-auto flex items-center gap-1 pt-3 text-[13px] font-semibold text-luna-royal group-hover:text-luna-aqua2 transition-colors">
                      {t('home.pillar_cta')} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </Block>

        {/* ── Comment ça marche — 3 steps ── */}
        <Block name="home-how-it-works">
          <section className="mx-auto max-w-[1220px] px-4 pb-6 md:px-[26px] md:pb-9 lg:px-10 lg:pb-[clamp(64px,8vw,104px)]">
            {/* Divider */}
            <div className="mb-[18px] h-px md:mb-[clamp(32px,4vw,52px)] lg:mb-[clamp(44px,6vw,72px)]" style={{ background: 'linear-gradient(90deg,rgba(10,22,80,0) 0%,#D3DEEC 12%,#D3DEEC 88%,rgba(10,22,80,0) 100%)' }} />
            <div className="mb-4 max-w-[44em] md:mb-[clamp(24px,3vw,40px)] lg:mb-[clamp(32px,4vw,52px)]">
              <Ed page="home" field="how_title" as="h2" className="block text-[20px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink md:text-[26px] lg:text-[32px]">
                {howTitle}
              </Ed>
            </div>
            <div className="grid gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-[clamp(24px,3vw,48px)]">
              {steps.map((s, i) => (
                <div key={s.key} className={`min-w-0 border-t-2 pt-3 md:pt-[18px] lg:pt-6 ${i === 0 ? 'border-luna-aqua' : 'border-[#C6D4E6]'}`}>
                  <div className="mb-2 flex items-center gap-3 md:mb-3 lg:mb-4">
                    <span className="text-[11.5px] font-semibold tracking-[.06em] text-luna-sky md:text-[13px]">0{s.key}</span>
                    <s.icon className="h-[17px] w-[17px] text-luna-royal md:h-[22px] md:w-[22px]" aria-hidden="true" />
                  </div>
                  <Ed page="home" field={`how_step${s.key}_title`} as="h3" className="mb-1.5 block text-[14.5px] font-semibold leading-[1.3] text-luna-ink md:mb-2 md:text-[18px] lg:mb-2.5 lg:text-[20px]">
                    {s.title}
                  </Ed>
                  <Ed page="home" field={`how_step${s.key}_body`} as="p" multiline className="block text-[11.5px] leading-[1.55] text-luna-body md:text-[13px] md:leading-[1.7]">
                    {s.body}
                  </Ed>
                </div>
              ))}
            </div>
          </section>
        </Block>

        {/* ── CTA band ── */}
        <Block name="home-cta">
          <section className="mx-auto max-w-[1220px] px-4 pb-6 md:px-[26px] md:pb-9 lg:px-10 lg:pb-[clamp(64px,8vw,104px)]">
            <div className="overflow-hidden rounded-xl lg:grid lg:grid-cols-2" style={{ background: 'linear-gradient(112deg,#0A1650 0%,#0D2E6B 56%,#1FA3C9 100%)' }}>
              <div className="min-w-0 px-4 pt-[18px] pb-5 md:px-[26px] md:py-10 lg:p-[clamp(32px,5vw,60px)]">
                <Ed page="home" field="cta_text" as="p" multiline className="mb-3 block text-[13.5px] font-medium leading-[1.5] text-white md:text-[17px] lg:mb-6 lg:text-[20px]">
                  {ctaText}
                </Ed>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={urlFor('pricing', lang)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-luna-aqua px-4 text-[12.5px] font-semibold tracking-[.02em] text-luna-ink transition-colors hover:bg-luna-aqua2 lg:px-[26px] lg:py-[15px] lg:text-[13px]"
                  >
                    {t('home.hero_cta_quote')} <ArrowRight className="h-[15px] w-[15px]" />
                  </Link>
                  <a
                    href="tel:+3222419672"
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/50 px-[14px] text-[12.5px] font-medium text-white transition-colors hover:bg-white/10 lg:hidden"
                  >
                    <Phone className="h-4 w-4" /> +32 2 241 96 72
                  </a>
                </div>
              </div>
              {/* Photo — hidden on mobile, visible on lg */}
              <div className="relative hidden min-h-[250px] lg:block">
                <img
                  src="/images/services/service-sea-freight.webp"
                  alt={t('home.cta_photo_alt')}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          </section>
        </Block>
      </div>
    </>
  );
}
