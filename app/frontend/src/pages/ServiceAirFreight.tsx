import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import {
  ServiceHero, ServiceBody, ServiceSection, ServiceSteps, ServiceCard, ServiceLink, ServiceFaq, ServiceCta,
} from '@/components/service/ServiceBlocks';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { eur, num } from '@/lib/pricing/service-figures';
import { urlFor } from '@/lib/url/routes';

/**
 * /fret-aerien — express and cargo air freight, Brussels → Kinshasa.
 * Every figure comes from the active pricing grid (usePricingConfig), the same
 * one the calculator uses; the sentences around them are locale text (svc_air.*).
 */
export default function ServiceAirFreight() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { config } = usePricingConfig();
  const k = (key: string, vars?: Record<string, string>) => t(`svc_air.${key}`, vars);

  const body = (() => {
    if (!config) return <p className="text-slate-600">{t('calc.loading')}</p>;
    const { express, cargo } = config.modes;
    const surcharge = eur(config.volumetricSurchargeRateCentsPerKg, lang);
    const handling = eur(config.handlingFeeCents, lang);
    return (
      <>
        <ServiceSection title={t('svc_common.how_title')}>
          <ServiceSteps items={[
            <>{k('step1')}<ServiceLink to={urlFor('rateCalculator', lang)}>{k('step1_link')}</ServiceLink>{k('step1_after')}</>,
            k('step2', { divisor: num(config.volumetricDivisor, lang) }),
            k('step3', { surcharge }),
            k('step4', { expressMax: num(express.maxKg, lang), cargoMax: num(cargo.maxKg, lang) }),
          ]} />
        </ServiceSection>

        <ServiceSection title={k('formulas_title')}>
          <ServiceCard>
            <p><strong className="text-luna-navy">{k('formula_express_label')}</strong> : {k('formula_express_text', { rate: eur(express.perKgCents, lang), min: eur(express.flatMinCents, lang) })}</p>
            <p className="mt-3"><strong className="text-luna-navy">{k('formula_cargo_label')}</strong> : {k('formula_cargo_text', { rate: eur(cargo.perKgCents, lang) })}</p>
          </ServiceCard>
          <p>
            {k('fees_note', { handling })}
            {config.customsAdminFeeCents != null && <>{' '}{k('fees_customs', { customs: eur(config.customsAdminFeeCents, lang) })}</>}
          </p>
        </ServiceSection>

        <ServiceSection title={k('dest_title')}>
          <p>{k('dest_kinshasa')}</p>
          <p>{k('dest_lubumbashi')}<ServiceLink to={urlFor('pricing', lang)}>{k('dest_lubumbashi_link')}</ServiceLink>{k('dest_lubumbashi_after')}</p>
        </ServiceSection>

        <ServiceSection title={t('svc_common.from_drc_title')}>
          <p>{k('from_drc_body')}</p>
          <p><ServiceLink to={urlFor('pricing', lang)}>{t('svc_common.from_drc_link')}</ServiceLink></p>
        </ServiceSection>

        <ServiceSection title={t('svc_common.example_title')}>
          <ServiceCard><p>{k('example_body')}</p></ServiceCard>
        </ServiceSection>

        <ServiceSection title={t('svc_common.faq_title')}>
          <ServiceFaq items={[
            { q: k('faq_q1'), a: k('faq_a1') },
            { q: k('faq_q2'), a: k('faq_a2', { surcharge }) },
            { q: k('faq_q3'), a: k('faq_a3') },
          ]} />
        </ServiceSection>
      </>
    );
  })();

  return (
    <>
      <SEO title={k('meta_title')} description={k('meta_description')} />
      <ServiceHero title={k('h1')} intro={k('intro')} image="/images/services/service-air-freight.webp" imageAlt={t('home.pillar_air_alt')} />
      <ServiceBody>{body}</ServiceBody>
      <ServiceCta to={urlFor('rateCalculator', lang)} label={k('cta')} />
    </>
  );
}
