import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import {
  ServiceHero, ServiceBody, ServiceSection, ServiceSteps, ServiceCard, ServiceLink, ServiceFaq, ServiceCta,
} from '@/components/service/ServiceBlocks';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { FALLBACK_PRICING_CONFIG } from '@/lib/pricing/fallback';
import { cartonForfaits, cartonFromCents, eur, num, seaMetaTiers, seaTiers } from '@/lib/pricing/service-figures';
import { urlFor } from '@/lib/url/routes';

/**
 * /fret-maritime — sea freight priced per m³ in brackets, plus flat carton
 * rates, Brussels → Kinshasa. Figures come from the active pricing grid
 * (usePricingConfig); the sentences around them are locale text (svc_sea.*).
 */
export default function ServiceSeaFreight() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  // Render immediately with the in-code grid (same values the build
  // prerendered); swap to the live grid in place when it resolves. No loading
  // gate → the body + CTA are on the first paint, so no late mount, no layout
  // shift (was CLS ~0.25).
  const { config: liveConfig } = usePricingConfig();
  const config = liveConfig ?? FALLBACK_PRICING_CONFIG;
  const k = (key: string, vars?: Record<string, string>) => t(`svc_sea.${key}`, vars);

  // Meta description with the live figures; the figure-free sentence while the grid loads.
  const cartonFrom = config ? cartonFromCents(config) : null;
  const metaDescription = config && cartonFrom != null
    ? k('meta_description', {
        tiers: seaMetaTiers(config, lang, { first: t('svc_sea.meta_tier_first'), next: t('svc_sea.meta_tier_next') }),
        cartonFrom: eur(cartonFrom, lang),
      })
    : k('meta_description_generic');

  const body = (() => {
    const handling = eur(config.handlingFeeCents, lang);
    const tiers = seaTiers(config);
    const tierSentences = tiers.map((tier) => (tier.fromM3 == null
      ? k('tier_first', { upto: num(tier.uptoM3, lang), rate: eur(tier.perM3Cents, lang) })
      : k('tier_next', { from: num(tier.fromM3, lang), upto: num(tier.uptoM3, lang), rate: eur(tier.perM3Cents, lang) })));
    const cartons = cartonForfaits(config, lang);
    const ratio = config.ratioQuote?.appliesTo.includes('sea') ? config.ratioQuote.thresholdKgPerM3 : null;
    const stepThree = ratio != null
      ? k('step3', { max: num(config.modes.sea.maxM3, lang), ratio: num(ratio, lang) })
      : k('step3_no_ratio', { max: num(config.modes.sea.maxM3, lang) });
    return (
      <>
        <ServiceSection title={t('svc_common.how_title')}>
          <ServiceSteps items={[
            k('step1'),
            tierSentences.join(' '),
            stepThree,
          ]} />
        </ServiceSection>

        {cartons.length > 0 && (
          <ServiceSection title={k('cartons_title')}>
            <p>{k('cartons_intro')}</p>
            <ServiceCard>
              <ul className="space-y-1 font-medium text-luna-navy">
                {cartons.map((c) => (
                  <li key={c.dims}>{k('carton_line', { dims: c.dims, price: eur(c.totalCents, lang) })}</li>
                ))}
              </ul>
            </ServiceCard>
            <p>{k('cartons_note', { handling })}</p>
          </ServiceSection>
        )}

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
            { q: k('faq_q2'), a: k('faq_a2') },
            { q: k('faq_q3'), a: k('faq_a3') },
          ]} />
        </ServiceSection>
      </>
    );
  })();

  return (
    <>
      <SEO title={k('meta_title')} description={metaDescription} />
      <ServiceHero title={k('h1')} intro={k('intro')} image="/images/services/service-sea-freight.webp" imageAlt={t('home.pillar_sea_alt')} />
      <ServiceBody>{body}</ServiceBody>
      <ServiceCta to={`${urlFor('pricing', lang)}?mode=sea`} label={k('cta')} />
    </>
  );
}
