import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import {
  ServiceHero, ServiceBody, ServiceSection, ServiceSteps, ServiceCard, ServiceLink, ServiceFaq, ServiceCta,
} from '@/components/service/ServiceBlocks';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { FALLBACK_PRICING_CONFIG } from '@/lib/pricing/fallback';
import { eur, seaTiers } from '@/lib/pricing/service-figures';
import { urlFor } from '@/lib/url/routes';
import { JsonLd } from '@/components/JsonLd';
import { serviceGraph, SITE_URL } from '@/lib/seo/jsonld.data.mjs';

/**
 * /envoyer-colis-famille-congo — the diaspora landing page for "envoyer colis
 * famille Congo" (SEO audit 2026-10-01, gap #2). Persona: someone in Belgium
 * sending a parcel to relatives in the DRC. It threads the two ends of that
 * journey — pickup in Belgium (/enlevement-colis) → home delivery in Congo
 * (/livraison-domicile-congo) → /tarifs / /calculateur / /suivi. Tariffs come
 * from the active grid (usePricingConfig); no figure is typed in the locales.
 * Only facts already on the site are stated; what may and may not be shipped
 * links to the forwarding page rather than inventing an item list.
 */
export default function Diaspora() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { config: liveConfig } = usePricingConfig();
  const config = liveConfig ?? FALLBACK_PRICING_CONFIG;
  const k = (key: string, vars?: Record<string, string>) => t(`diaspora.${key}`, vars);

  const { express, cargo } = config.modes;
  const tiers = seaTiers(config);
  const seaRate = tiers[0] ? eur(tiers[0].perM3Cents, lang) : '';
  const handling = eur(config.handlingFeeCents, lang);

  const faqItems = [
    { q: k('faq_q1'), a: k('faq_a1') },
    { q: k('faq_q2'), a: k('faq_a2') },
    { q: k('faq_q3'), a: k('faq_a3') },
    { q: k('faq_q4'), a: k('faq_a4') },
    { q: k('faq_q5'), a: k('faq_a5') },
  ];

  const body = (
    <>
      <ServiceSection title={k('how_title')}>
        <p>{k('how_intro')}</p>
        <ServiceSteps items={[
          <>{k('step1')}<ServiceLink to={urlFor('rateCalculator', lang)}>{k('step1_link')}</ServiceLink>{k('step1_after')}</>,
          <>{k('step2')}<ServiceLink to={urlFor('servicePickup', lang)}>{k('step2_link')}</ServiceLink>{k('step2_after')}</>,
          k('step3'),
          <>{k('step4')}<ServiceLink to={urlFor('serviceHome', lang)}>{k('step4_link')}</ServiceLink>{k('step4_after')}</>,
        ]} />
      </ServiceSection>

      <ServiceSection title={k('what_title')}>
        <p>{k('what_body')}</p>
        <p>{k('what_forbidden')}<ServiceLink to={urlFor('forwarding', lang)}>{k('what_forbidden_link')}</ServiceLink>{k('what_forbidden_after')}</p>
      </ServiceSection>

      <ServiceSection title={k('pricing_title')}>
        <p>{k('pricing_intro')}</p>
        <ServiceCard>
          <p>{k('price_air', { express: eur(express.perKgCents, lang), cargo: eur(cargo.perKgCents, lang) })}</p>
          <p className="mt-3">{k('price_sea', { sea: seaRate })}</p>
          <p className="mt-3">{k('price_fees', { handling })}</p>
        </ServiceCard>
        <p>
          {k('pricing_cta_lead')}{' '}
          <ServiceLink to={urlFor('rateCalculator', lang)}>{k('pricing_cta_link')}</ServiceLink>
          {k('pricing_cta_mid')}
          <ServiceLink to={urlFor('pricing', lang)}>{k('pricing_cta_link2')}</ServiceLink>
          {k('pricing_cta_after')}
        </p>
      </ServiceSection>

      <ServiceSection title={k('delivery_title')}>
        <p>{k('delivery_body')}<ServiceLink to={urlFor('serviceHome', lang)}>{k('delivery_link')}</ServiceLink>{k('delivery_mid')}<ServiceLink to={urlFor('tracking', lang)}>{k('delivery_link2')}</ServiceLink>{k('delivery_after')}</p>
      </ServiceSection>

      <ServiceSection title={t('svc_common.faq_title')}>
        <ServiceFaq items={faqItems} />
      </ServiceSection>
    </>
  );

  return (
    <>
      <SEO title={k('meta_title')} description={k('meta_description')} />
      <JsonLd data={serviceGraph({
        lang,
        canonical: `${SITE_URL}${urlFor('diaspora', lang)}`,
        title: k('meta_title'),
        description: k('meta_description'),
        homeUrl: urlFor('home', lang),
        homeLabel: t('nav.home'),
        serviceName: k('h1'),
        faq: faqItems,
      })} />
      <ServiceHero title={k('h1')} intro={k('intro')} image="/images/services/livraison-domicile-luna-tracking.webp" imageAlt={k('hero_alt')} />
      <ServiceBody>{body}</ServiceBody>
      <ServiceCta to={urlFor('pricing', lang)} label={k('cta')} />
    </>
  );
}
