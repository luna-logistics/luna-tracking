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
 * /transitaire-belgique-congo — the commercial pillar for the exact-match term
 * "transitaire Belgique–Congo" (SEO audit 2026-10-01, gap #1). A hub page that
 * positions Luna as the Belgium↔DRC route specialist and links down to every
 * service + the pricing. Every tariff comes from the active grid
 * (usePricingConfig), the same one the calculator prices with — no figure is
 * retyped in the locale files. Only facts already on the site are stated; transit
 * times, customs specifics and coverage beyond Kinshasa/Lubumbashi are
 * deliberately absent (they are not in the code/data).
 */
export default function Transitaire() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { config: liveConfig } = usePricingConfig();
  const config = liveConfig ?? FALLBACK_PRICING_CONFIG;
  const k = (key: string, vars?: Record<string, string>) => t(`transitaire.${key}`, vars);

  const { express, cargo } = config.modes;
  const tiers = seaTiers(config);
  const seaRate = tiers[0] ? eur(tiers[0].perM3Cents, lang) : '';
  const surcharge = eur(config.volumetricSurchargeRateCentsPerKg, lang);
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
      <ServiceSection title={k('who_title')}>
        <p>{k('who_body')}</p>
        <p>{k('who_offices')}</p>
      </ServiceSection>

      <ServiceSection title={k('services_title')}>
        <p>{k('services_intro')}</p>
        <ServiceCard>
          <ul className="space-y-2">
            <li><ServiceLink to={urlFor('serviceAir', lang)}>{k('svc_air')}</ServiceLink> — {k('svc_air_note')}</li>
            <li><ServiceLink to={urlFor('serviceSea', lang)}>{k('svc_sea')}</ServiceLink> — {k('svc_sea_note')}</li>
            <li><ServiceLink to={urlFor('servicePickup', lang)}>{k('svc_pickup')}</ServiceLink> — {k('svc_pickup_note')}</li>
            <li><ServiceLink to={urlFor('serviceHome', lang)}>{k('svc_home')}</ServiceLink> — {k('svc_home_note')}</li>
            <li><ServiceLink to={urlFor('forwarding', lang)}>{k('svc_forwarding')}</ServiceLink> — {k('svc_forwarding_note')}</li>
            <li><ServiceLink to={urlFor('shopAndShip', lang)}>{k('svc_shop')}</ServiceLink> — {k('svc_shop_note')}</li>
          </ul>
        </ServiceCard>
      </ServiceSection>

      <ServiceSection title={k('how_title')}>
        <ServiceSteps items={[
          <>{k('step1')}<ServiceLink to={urlFor('rateCalculator', lang)}>{k('step1_link')}</ServiceLink>{k('step1_after')}</>,
          k('step2'),
          k('step3'),
          <>{k('step4')}<ServiceLink to={urlFor('tracking', lang)}>{k('step4_link')}</ServiceLink>{k('step4_after')}</>,
        ]} />
      </ServiceSection>

      <ServiceSection title={k('pricing_title')}>
        <p>{k('pricing_intro')}</p>
        <ServiceCard>
          <p>{k('price_air', { express: eur(express.perKgCents, lang), cargo: eur(cargo.perKgCents, lang) })}</p>
          <p className="mt-3">{k('price_sea', { sea: seaRate })}</p>
          <p className="mt-3">{k('price_fees', { handling, surcharge })}</p>
        </ServiceCard>
        <p>
          {k('pricing_cta_lead')}{' '}
          <ServiceLink to={urlFor('pricing', lang)}>{k('pricing_cta_link')}</ServiceLink>
          {k('pricing_cta_mid')}
          <ServiceLink to={urlFor('rateCalculator', lang)}>{k('pricing_cta_link2')}</ServiceLink>
          {k('pricing_cta_after')}
        </p>
      </ServiceSection>

      <ServiceSection title={k('tracking_title')}>
        <p>{k('tracking_body')}<ServiceLink to={urlFor('tracking', lang)}>{k('tracking_link')}</ServiceLink>{k('tracking_after')}</p>
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
        canonical: `${SITE_URL}${urlFor('transitaire', lang)}`,
        title: k('meta_title'),
        description: k('meta_description'),
        homeUrl: urlFor('home', lang),
        homeLabel: t('nav.home'),
        serviceName: k('h1'),
        faq: faqItems,
      })} />
      <ServiceHero title={k('h1')} intro={k('intro')} image="/images/services/service-air-freight.webp" imageAlt={k('hero_alt')} />
      <ServiceBody>{body}</ServiceBody>
      <ServiceCta to={urlFor('pricing', lang)} label={k('cta')} />
    </>
  );
}
