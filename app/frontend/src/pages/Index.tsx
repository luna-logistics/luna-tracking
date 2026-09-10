import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plane, Ship, Truck, PackageSearch, ArrowRight, ClipboardList, HandCoins, MapPin } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { IconCircle } from '@/components/IconCircle';
import { WaveDivider } from '@/components/WaveDivider';
import { urlFor } from '@/lib/url/routes';
import { useContent, useSiteImage } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { HeroBackground } from '@/components/HeroBackground';

export default function Index() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  // Admin-overridable text + image slots — fall back to i18n defaults when
  // no DB row exists.
  const metaTitle       = useContent('home', 'meta_title',       t('home.meta_title'));
  const metaDescription = useContent('home', 'meta_description', t('home.meta_description'));
  const heroTitle       = useContent('home', 'hero_title',       t('home.hero_title'));
  const heroSubtitle    = useContent('home', 'hero_subtitle',    t('home.hero_subtitle'));
  const ogImageAlt      = useContent('home', 'og_image_alt',     t('brand.name'));
  const ogImage         = useSiteImage('home_og', '') || undefined;

  const pillars = [
    { key: 'air',      icon: Plane,         image: '/images/services/service-air-freight.webp',       alt: t('home.pillar_air_alt'),      title: useContent('home', 'pillar_air_title',      t('home.pillar_air_title')),      body: useContent('home', 'pillar_air_body',      t('home.pillar_air_body')) },
    { key: 'sea',      icon: Ship,          image: '/images/services/service-sea-freight.webp',       alt: t('home.pillar_sea_alt'),      title: useContent('home', 'pillar_sea_title',      t('home.pillar_sea_title')),      body: useContent('home', 'pillar_sea_body',      t('home.pillar_sea_body')) },
    { key: 'ground',   icon: Truck,         image: '/images/services/service-ground-transport.webp', alt: t('home.pillar_ground_alt'),   title: useContent('home', 'pillar_ground_title',   t('home.pillar_ground_title')),   body: useContent('home', 'pillar_ground_body',   t('home.pillar_ground_body')) },
    { key: 'tracking', icon: PackageSearch, image: '/images/services/service-online-tracking.webp',  alt: t('home.pillar_tracking_alt'), title: useContent('home', 'pillar_tracking_title', t('home.pillar_tracking_title')), body: useContent('home', 'pillar_tracking_body', t('home.pillar_tracking_body')) },
  ];

  const pillarsTitle    = useContent('home', 'pillars_title',    t('home.pillars_title'));
  const pillarsSubtitle = useContent('home', 'pillars_subtitle', t('home.pillars_subtitle'));
  const howTitle        = useContent('home', 'how_title',        t('home.how_title'));

  const steps = [
    { key: '1', icon: ClipboardList, title: useContent('home', 'how_step1_title', t('home.how_step1_title')), body: useContent('home', 'how_step1_body', t('home.how_step1_body')) },
    { key: '2', icon: HandCoins,     title: useContent('home', 'how_step2_title', t('home.how_step2_title')), body: useContent('home', 'how_step2_body', t('home.how_step2_body')) },
    { key: '3', icon: MapPin,        title: useContent('home', 'how_step3_title', t('home.how_step3_title')), body: useContent('home', 'how_step3_body', t('home.how_step3_body')) },
  ];

  return (
    <>
      <SEO
        title={metaTitle}
        description={metaDescription}
        ogTitle={metaTitle}
        ogDescription={metaDescription}
        image={ogImage}
        imageAlt={ogImageAlt}
      />

      {/* Hero — navy→cyan gradient by default, or admin-uploaded photo. */}
      <HeroBackground
        imageKey="home_hero"
        imageAlt={heroTitle}
        fallbackClassName="bg-luna-gradient text-white"
        className="text-white"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-sm uppercase tracking-widest text-luna-cyan-light font-semibold mb-3">
              {t('brand.name')}
            </p>
            <Ed page="home" field="hero_title" as="h1" className="text-4xl sm:text-5xl font-bold leading-tight block">
              {heroTitle}
            </Ed>
            <Ed page="home" field="hero_subtitle" as="div" multiline markdown className="mt-5 text-lg text-white/90 max-w-xl block">
              {heroSubtitle}
            </Ed>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="lg">
                <Link to={urlFor('pricing', lang)}>
                  {t('home.hero_cta_quote')}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/40 text-white hover:bg-white/10 hover:text-white">
                <Link to={urlFor('tracking', lang)}>
                  <PackageSearch className="mr-1 h-4 w-4" />
                  {t('home.hero_cta_track')}
                </Link>
              </Button>
            </div>
          </div>

          {/* Decorative pillar preview — 2×2 grid of iconCircles on dark */}
          <div className="hidden md:grid grid-cols-2 gap-6 justify-items-center">
            {pillars.map((p) => (
              <div key={p.title} className="flex flex-col items-center text-center max-w-[180px]">
                <IconCircle icon={p.icon} variant="onDark" label={p.title} />
                <div className="mt-3 text-sm font-semibold text-white">{p.title}</div>
              </div>
            ))}
          </div>
        </div>
        <WaveDivider side="top" color="text-background" />
      </HeroBackground>

      {/* Pillars — cards on the off-white ground */}
      <Block name="home-pillars">
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl mx-auto text-center mb-10">
              <Ed page="home" field="pillars_title" as="h2" className="text-3xl font-bold text-luna-navy block">{pillarsTitle}</Ed>
              <Ed page="home" field="pillars_subtitle" as="p" className="mt-3 text-slate-600 block">{pillarsSubtitle}</Ed>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {pillars.map((p) => (
                <div
                  key={p.key}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden text-center shadow-sm hover:shadow-md hover:border-luna-blue/40 transition-shadow flex flex-col"
                >
                  <div className="aspect-square w-full overflow-hidden bg-slate-100">
                    <img
                      src={p.image}
                      alt={p.alt}
                      width={800}
                      height={800}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <Ed page="home" field={`pillar_${p.key}_title`} as="h3" className="text-lg font-semibold text-luna-navy block">{p.title}</Ed>
                    <Ed page="home" field={`pillar_${p.key}_body`}  as="p"  multiline className="mt-2 text-[15px] font-medium text-slate-700 leading-relaxed block">{p.body}</Ed>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Block>

      {/* How it works — 3 steps, on the soft gradient band */}
      <Block name="home-how-it-works">
        <section className="relative bg-luna-gradient-soft text-white">
          <WaveDivider side="bottom" color="text-background" />
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
            <Ed page="home" field="how_title" as="h2" className="text-3xl font-bold text-center block">{howTitle}</Ed>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.key} className="flex flex-col items-center text-center">
                  <div className="relative">
                    <IconCircle icon={s.icon} variant="onDark" label={s.title} />
                    <span className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-luna-cyan text-luna-navy text-sm font-bold ring-2 ring-luna-navy-deep">
                      {i + 1}
                    </span>
                  </div>
                  <Ed page="home" field={`how_step${s.key}_title`} as="h3" className="mt-4 text-lg font-semibold block">{s.title}</Ed>
                  <Ed page="home" field={`how_step${s.key}_body`}  as="p"  multiline className="mt-2 text-sm text-white/85 leading-relaxed max-w-xs block">{s.body}</Ed>
                </li>
              ))}
            </ol>
            <div className="mt-10 flex justify-center">
              <Button asChild variant="brand" size="lg">
                <Link to={urlFor('pricing', lang)}>
                  {t('home.hero_cta_quote')}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <WaveDivider side="top" color="text-background" />
        </section>
      </Block>
    </>
  );
}
