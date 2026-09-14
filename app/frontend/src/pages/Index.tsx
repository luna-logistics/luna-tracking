import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plane, Ship, Truck, Search, Home, PackagePlus,
  ArrowRight, Package, ClipboardList, HandCoins, MapPinned,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { urlFor } from '@/lib/url/routes';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';

/**
 * Homepage — "Homepage Luna" redesign from Claude Design (2026-09-14),
 * rebuilt in React on the live codebase. Preserves every dynamic bit of
 * the previous homepage: bilingual `urlFor` links, i18n copy, `<Ed>`
 * inline editing + `useContent` admin overrides, and `<Block>` hide/show.
 * Real service photos are reused; the two service cards with no photo yet
 * (home delivery, pickup) render a branded icon tile until photos land.
 */
export default function Index() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  const metaTitle       = useContent('home', 'meta_title',       t('home.meta_title'));
  const metaDescription = useContent('home', 'meta_description', t('home.meta_description'));
  const heroTitle       = useContent('home', 'hero_title',       t('home.hero_title'));
  const heroSubtitle    = useContent('home', 'hero_subtitle',    t('home.hero_subtitle'));
  const pillarsTitle    = useContent('home', 'pillars_title',    t('home.pillars_title'));
  const pillarsSubtitle = useContent('home', 'pillars_subtitle', t('home.pillars_subtitle'));
  const howTitle        = useContent('home', 'how_title',        t('home.how_title'));
  const ctaText         = useContent('home', 'cta_text',         t('home.cta_text'));

  // Hero capability strip — 6 short labels.
  const caps = [
    { icon: Plane,       label: t('home.cap_air') },
    { icon: Ship,        label: t('home.cap_sea') },
    { icon: Truck,       label: t('home.cap_ground') },
    { icon: Search,      label: t('home.cap_tracking') },
    { icon: Home,        label: t('home.cap_home') },
    { icon: PackagePlus, label: t('home.cap_pickup') },
  ];

  // Six "expertises" cards. `image` null = branded icon tile (no photo yet).
  const cards = [
    { key: 'air',      icon: Plane,       image: '/images/services/service-air-freight.webp',      alt: t('home.pillar_air_alt'),      title: useContent('home', 'pillar_air_title',      t('home.pillar_air_title')),      body: useContent('home', 'pillar_air_body',      t('home.pillar_air_body')) },
    { key: 'sea',      icon: Ship,        image: '/images/services/service-sea-freight.webp',      alt: t('home.pillar_sea_alt'),      title: useContent('home', 'pillar_sea_title',      t('home.pillar_sea_title')),      body: useContent('home', 'pillar_sea_body',      t('home.pillar_sea_body')) },
    { key: 'ground',   icon: Truck,       image: '/images/services/service-ground-transport.webp', alt: t('home.pillar_ground_alt'),   title: useContent('home', 'pillar_ground_title',   t('home.pillar_ground_title')),   body: useContent('home', 'pillar_ground_body',   t('home.pillar_ground_body')) },
    { key: 'tracking', icon: Search,      image: '/images/services/service-online-tracking.webp',  alt: t('home.pillar_tracking_alt'), title: useContent('home', 'pillar_tracking_title', t('home.pillar_tracking_title')), body: useContent('home', 'pillar_tracking_body', t('home.pillar_tracking_body')) },
    { key: 'home',     icon: Home,        image: null,                                             alt: t('home.pillar_home_alt'),     title: useContent('home', 'pillar_home_title',     t('home.pillar_home_title')),     body: useContent('home', 'pillar_home_body',     t('home.pillar_home_body')) },
    { key: 'pickup',   icon: PackagePlus, image: null,                                             alt: t('home.pillar_pickup_alt'),   title: useContent('home', 'pillar_pickup_title',   t('home.pillar_pickup_title')),   body: useContent('home', 'pillar_pickup_body',   t('home.pillar_pickup_body')) },
  ];

  const steps = [
    { key: '1', icon: ClipboardList, title: useContent('home', 'how_step1_title', t('home.how_step1_title')), body: useContent('home', 'how_step1_body', t('home.how_step1_body')) },
    { key: '2', icon: HandCoins,     title: useContent('home', 'how_step2_title', t('home.how_step2_title')), body: useContent('home', 'how_step2_body', t('home.how_step2_body')) },
    { key: '3', icon: MapPinned,    title: useContent('home', 'how_step3_title', t('home.how_step3_title')), body: useContent('home', 'how_step3_body', t('home.how_step3_body')) },
  ];

  return (
    <>
      <SEO
        title={metaTitle}
        description={metaDescription}
        ogTitle={metaTitle}
        ogDescription={metaDescription}
      />

      {/* ── Hero — navy panel over the Belgium→Congo map (brand asset) ── */}
      <section
        className="relative bg-luna-ink"
        style={{
          backgroundImage:
            "linear-gradient(100deg,rgba(10,22,80,.96) 0%,rgba(10,22,80,.88) 34%,rgba(13,46,107,.42) 58%,rgba(13,46,107,0) 82%), url('/brand/hero-map.jpg')",
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, right center',
          backgroundRepeat: 'no-repeat, no-repeat',
        }}
      >
        <div
          className="relative mx-auto max-w-[1220px]"
          style={{ padding: 'clamp(68px,8vw,116px) clamp(20px,4vw,40px) clamp(104px,12vw,168px)' }}
        >
          <div className="min-w-0" style={{ maxWidth: 'min(560px,58%)' }}>
            <p className="mb-5 text-[13px] font-semibold tracking-[0.2em] text-luna-aqua">
              {t('home.hero_eyebrow').toUpperCase()}
            </p>
            <Ed page="home" field="hero_title" as="h1" className="mb-5 block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-white">
              {heroTitle}
            </Ed>
            <Ed page="home" field="hero_subtitle" as="p" multiline markdown className="mb-[34px] block text-[20px] font-normal leading-[1.55] text-[#D7E4F5]">
              {heroSubtitle}
            </Ed>
            <div className="flex flex-wrap gap-3">
              <Link
                to={urlFor('pricing', lang)}
                className="inline-flex items-center gap-2.5 rounded-lg bg-luna-aqua px-[26px] py-[15px] text-[13px] font-semibold tracking-[.02em] text-luna-ink transition-colors hover:bg-luna-aqua2"
              >
                {t('home.hero_cta_quote')} <ArrowRight className="h-[15px] w-[15px]" />
              </Link>
              <Link
                to={urlFor('tracking', lang)}
                className="inline-flex items-center gap-2.5 rounded-lg border border-white/50 px-6 py-[15px] text-[13px] font-semibold tracking-[.02em] text-white transition-colors hover:bg-white/10"
              >
                <Package className="h-[17px] w-[17px]" /> {t('home.hero_cta_track')}
              </Link>
            </div>
          </div>

          {/* Capability strip */}
          <div
            className="overflow-hidden rounded-[10px] border border-[#4A6FA0]/70"
            style={{ marginTop: 'clamp(48px,6vw,84px)' }}
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

        {/* Wave into the off-white ground */}
        <svg viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] block h-[clamp(48px,6vw,96px)] w-full">
          <path d="M0,58 C260,104 470,14 730,28 C980,41 1200,100 1440,70 L1440,110 L0,110 Z" fill="#F4F7FB" />
        </svg>
      </section>

      <div className="bg-luna-mist">
        {/* ── Nos expertises — 6 cards ── */}
        <Block name="home-pillars">
          <section className="mx-auto max-w-[1220px]" style={{ padding: 'clamp(48px,6vw,72px) clamp(20px,4vw,40px) clamp(56px,7vw,88px)' }}>
            <div className="mb-[clamp(32px,4vw,48px)] max-w-[44em]">
              <Ed page="home" field="pillars_title" as="h2" className="mb-3 block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
                {pillarsTitle}
              </Ed>
              <Ed page="home" field="pillars_subtitle" as="p" className="block text-[20px] font-normal leading-[1.5] text-luna-muted-ink">
                {pillarsSubtitle}
              </Ed>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 nav:grid-cols-3">
              {cards.map((c) => (
                <article key={c.key} className="flex flex-col overflow-hidden rounded-[10px] border border-[#DCE5F0] bg-white">
                  <div className="h-40">
                    {c.image ? (
                      <img src={c.image} alt={c.alt} width={800} height={320} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-luna-gradient">
                        <c.icon className="h-12 w-12 text-white/90" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col px-[18px] pb-6 pt-5">
                    <Ed page="home" field={`pillar_${c.key}_title`} as="h3" className="mb-2.5 block text-[20px] font-semibold leading-[1.3] text-luna-royal">
                      {c.title}
                    </Ed>
                    <Ed page="home" field={`pillar_${c.key}_body`} as="p" multiline className="block text-[13px] leading-[1.7] text-luna-body">
                      {c.body}
                    </Ed>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </Block>

        {/* ── Comment ça marche — 3 steps ── */}
        <Block name="home-how-it-works">
          <section className="mx-auto max-w-[1220px]" style={{ padding: '0 clamp(20px,4vw,40px) clamp(64px,8vw,104px)' }}>
            <div className="mb-[clamp(44px,6vw,72px)] h-px" style={{ background: 'linear-gradient(90deg,rgba(10,22,80,0) 0%,#D3DEEC 12%,#D3DEEC 88%,rgba(10,22,80,0) 100%)' }} />
            <div className="mb-[clamp(32px,4vw,52px)] max-w-[44em]">
              <Ed page="home" field="how_title" as="h2" className="block text-[32px] font-semibold leading-[1.2] tracking-[-.01em] text-luna-ink">
                {howTitle}
              </Ed>
            </div>
            <div className="grid gap-[clamp(24px,3vw,48px)] sm:grid-cols-2 nav:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.key} className={`min-w-0 border-t-2 pt-6 ${i === 0 ? 'border-luna-aqua' : 'border-[#C6D4E6]'}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-[13px] font-semibold tracking-[.06em] text-luna-sky">0{s.key}</span>
                    <s.icon className="h-[22px] w-[22px] text-luna-royal" aria-hidden="true" />
                  </div>
                  <Ed page="home" field={`how_step${s.key}_title`} as="h3" className="mb-2.5 block text-[20px] font-semibold leading-[1.3] text-luna-ink">
                    {s.title}
                  </Ed>
                  <Ed page="home" field={`how_step${s.key}_body`} as="p" multiline className="block text-[13px] leading-[1.7] text-luna-body">
                    {s.body}
                  </Ed>
                </div>
              ))}
            </div>
          </section>
        </Block>

        {/* ── CTA band ── */}
        <Block name="home-cta">
          <section className="mx-auto max-w-[1220px]" style={{ padding: '0 clamp(20px,4vw,40px) clamp(64px,8vw,104px)' }}>
            <div className="grid overflow-hidden rounded-xl sm:grid-cols-2" style={{ background: 'linear-gradient(112deg,#0A1650 0%,#0D2E6B 56%,#1FA3C9 100%)' }}>
              <div className="min-w-0" style={{ padding: 'clamp(32px,5vw,60px)' }}>
                <Ed page="home" field="cta_text" as="p" multiline className="mb-6 block text-[20px] font-medium leading-[1.5] text-white">
                  {ctaText}
                </Ed>
                <Link
                  to={urlFor('pricing', lang)}
                  className="inline-flex items-center gap-2.5 rounded-lg bg-luna-aqua px-[26px] py-[15px] text-[13px] font-semibold tracking-[.02em] text-luna-ink transition-colors hover:bg-luna-aqua2"
                >
                  {t('home.hero_cta_quote')} <ArrowRight className="h-[15px] w-[15px]" />
                </Link>
              </div>
              <div className="relative min-h-[250px]">
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
