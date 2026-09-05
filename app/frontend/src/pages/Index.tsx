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
    { icon: Plane, title: t('home.pillar_air_title'), body: t('home.pillar_air_body') },
    { icon: Ship, title: t('home.pillar_sea_title'), body: t('home.pillar_sea_body') },
    { icon: Truck, title: t('home.pillar_ground_title'), body: t('home.pillar_ground_body') },
    { icon: PackageSearch, title: t('home.pillar_tracking_title'), body: t('home.pillar_tracking_body') },
  ];

  const steps = [
    { icon: ClipboardList, title: t('home.how_step1_title'), body: t('home.how_step1_body') },
    { icon: HandCoins, title: t('home.how_step2_title'), body: t('home.how_step2_body') },
    { icon: MapPin, title: t('home.how_step3_title'), body: t('home.how_step3_body') },
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

      {/* Hero — navy→cyan gradient, on-dark IconCircle for the CTA anchor */}
      <section className="relative bg-luna-gradient text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-sm uppercase tracking-widest text-luna-cyan-light font-semibold mb-3">
              {t('brand.name')}
            </p>
            <Ed page="home" field="hero_title" as="h1" className="text-4xl sm:text-5xl font-bold leading-tight block">
              {heroTitle}
            </Ed>
            <Ed page="home" field="hero_subtitle" as="p" multiline className="mt-5 text-lg text-white/90 max-w-xl block">
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
      </section>

      {/* Pillars — cards on the off-white ground */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <h2 className="text-3xl font-bold text-luna-navy">{t('home.pillars_title')}</h2>
            <p className="mt-3 text-slate-600">{t('home.pillars_subtitle')}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm hover:shadow-md hover:border-luna-blue/40 transition-shadow"
              >
                <IconCircle icon={p.icon} variant="onLight" label={p.title} />
                <h3 className="mt-4 text-lg font-semibold text-luna-navy">{p.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — 3 steps, on the soft gradient band */}
      <section className="relative bg-luna-gradient-soft text-white">
        <WaveDivider side="bottom" color="text-background" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <h2 className="text-3xl font-bold text-center">{t('home.how_title')}</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-col items-center text-center">
                <div className="relative">
                  <IconCircle icon={s.icon} variant="onDark" label={s.title} />
                  <span className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-luna-cyan text-luna-navy text-sm font-bold ring-2 ring-luna-navy-deep">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/85 leading-relaxed max-w-xs">{s.body}</p>
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
    </>
  );
}
