import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, BadgeCheck, MapPin, Award, ArrowRight, Building2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { IconCircle } from '@/components/IconCircle';
import { WaveDivider } from '@/components/WaveDivider';
import { HeroBackground } from '@/components/HeroBackground';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { useContent } from '@/contexts/SiteContentContext';
import { urlFor } from '@/lib/url/routes';
import { useLegalIdentity } from '@/hooks/useLegalIdentity';

/**
 * "À propos" — the founders' story (from their 2026 investor deck), the
 * four values they named, and the company card (SRL, BCE, seat, agency).
 * Everything textual is admin-editable in place.
 */
export default function About() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const metaTitle       = useContent('about', 'meta_title',       t('about.meta_title'));
  const metaDescription = useContent('about', 'meta_description', t('about.meta_description'));
  const pageTitle       = useContent('about', 'page_title',       t('about.page_title'));
  const pageIntro       = useContent('about', 'page_intro',       t('about.page_intro'));
  const storyTitle      = useContent('about', 'story_title',      t('about.story_title'));
  const storyBody       = useContent('about', 'story_body',       t('about.story_body'));
  const valuesTitle     = useContent('about', 'values_title',     t('about.values_title'));
  const companyTitle    = useContent('about', 'company_title',    t('about.company_title'));
  const id = useLegalIdentity();

  const values = [
    { key: '1', icon: ShieldCheck, title: useContent('about', 'value1_title', t('about.value1_title')), body: useContent('about', 'value1_body', t('about.value1_body')) },
    { key: '2', icon: BadgeCheck,  title: useContent('about', 'value2_title', t('about.value2_title')), body: useContent('about', 'value2_body', t('about.value2_body')) },
    { key: '3', icon: MapPin,      title: useContent('about', 'value3_title', t('about.value3_title')), body: useContent('about', 'value3_body', t('about.value3_body')) },
    { key: '4', icon: Award,       title: useContent('about', 'value4_title', t('about.value4_title')), body: useContent('about', 'value4_body', t('about.value4_body')) },
  ];

  const companyRows = [
    { label: t('legal_common.company_name'),      value: id.companyName },
    { label: t('legal_common.legal_form'),        value: id.legalForm },
    { label: t('legal_common.company_number'),    value: id.companyNumber },
    { label: t('legal_common.vat_number'),        value: id.vatNumber },
    { label: t('legal_common.registered_office'), value: id.registeredOffice },
    { label: t('legal_common.agency'),            value: id.agency },
  ].filter((r) => r.value);

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <HeroBackground imageKey="about_hero" imageAlt={pageTitle} fallbackClassName="bg-luna-gradient text-white" className="text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <Ed page="about" field="page_title" as="h1" className="text-3xl sm:text-4xl font-bold block">
            {pageTitle}
          </Ed>
          <Ed page="about" field="page_intro" as="p" multiline className="mt-3 text-white/90 max-w-2xl block">
            {pageIntro}
          </Ed>
        </div>
        <WaveDivider side="top" color="text-background" />
      </HeroBackground>

      <Block name="about-story">
        <section className="py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Ed page="about" field="story_title" as="h2" className="text-2xl font-bold text-luna-navy block">
              {storyTitle}
            </Ed>
            <Ed page="about" field="story_body" as="div" multiline markdown className="mt-4 text-[17px] text-slate-700 leading-relaxed block">
              {storyBody}
            </Ed>
          </div>
        </section>
      </Block>

      <Block name="about-values">
        <section className="pb-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Ed page="about" field="values_title" as="h2" className="text-2xl font-bold text-luna-navy text-center block">
              {valuesTitle}
            </Ed>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {values.map((v) => (
                <div key={v.key} className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm text-center">
                  <div className="flex justify-center">
                    <IconCircle icon={v.icon} variant="onLight" label={v.title} />
                  </div>
                  <Ed page="about" field={`value${v.key}_title`} as="h3" className="mt-4 text-lg font-semibold text-luna-navy block">
                    {v.title}
                  </Ed>
                  <Ed page="about" field={`value${v.key}_body`} as="p" multiline className="mt-2 text-sm text-slate-700 leading-relaxed block">
                    {v.body}
                  </Ed>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Block>

      <Block name="about-company">
        <section className="pb-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-luna-blue" aria-hidden="true" />
                <Ed page="about" field="company_title" as="h2" className="text-lg font-semibold text-luna-navy block">
                  {companyTitle}
                </Ed>
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr] text-sm">
                {companyRows.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-slate-500">{r.label}</dt>
                    <dd className="text-luna-navy font-medium">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </Block>

      <section className="relative bg-luna-gradient-soft text-white">
        <WaveDivider side="bottom" color="text-background" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 text-center">
          <h2 className="text-2xl font-bold">{t('about.cta_title')}</h2>
          <p className="mt-2 text-white/85">{t('about.cta_body')}</p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <Button asChild variant="brand" size="lg">
              <Link to={urlFor('pricing', lang)}>
                {t('about.cta_quote')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/40 text-white hover:bg-white/10 hover:text-white">
              <Link to={urlFor('contact', lang)}>{t('about.cta_contact')}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
