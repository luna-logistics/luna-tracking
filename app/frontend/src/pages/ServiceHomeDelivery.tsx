import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import {
  ServiceHero, ServiceBody, ServiceSection, ServiceSteps, ServiceCard, ServiceLink, ServiceFaq, ServiceCta,
} from '@/components/service/ServiceBlocks';
import { urlFor } from '@/lib/url/routes';
import { JsonLd } from '@/components/JsonLd';
import { serviceGraph, SITE_URL } from '@/lib/seo/jsonld.data.mjs';

/** /livraison-domicile-congo — delivery to the recipient's address in Kinshasa after customs. */
export default function ServiceHomeDelivery() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const k = (key: string) => t(`svc_home.${key}`);

  return (
    <>
      <SEO title={k('meta_title')} description={k('meta_description')} />
      <JsonLd data={serviceGraph({
        lang,
        canonical: `${SITE_URL}${urlFor('serviceHome', lang)}`,
        title: k('meta_title'),
        description: k('meta_description'),
        homeUrl: urlFor('home', lang),
        homeLabel: t('nav.home'),
        serviceName: k('h1'),
      })} />
      <ServiceHero title={k('h1')} intro={k('intro')} image="/images/services/livraison-domicile-luna-tracking.webp" imageAlt={t('home.pillar_home_alt')} />
      <ServiceBody>
        <ServiceSection title={t('svc_common.how_title')}>
          <ServiceSteps items={[
            k('step1'),
            k('step2'),
            <>{k('step3')}<ServiceLink to={urlFor('tracking', lang)}>{k('step3_link')}</ServiceLink>{k('step3_after')}</>,
          ]} />
        </ServiceSection>

        <ServiceSection title={k('cities_title')}>
          <p>{k('cities_body')}</p>
        </ServiceSection>

        <ServiceSection title={t('svc_common.example_title')}>
          <ServiceCard><p>{k('example_body')}</p></ServiceCard>
        </ServiceSection>

        <ServiceSection title={t('svc_common.faq_title')}>
          <ServiceFaq items={[
            { q: k('faq_q1'), a: k('faq_a1') },
            { q: k('faq_q2'), a: k('faq_a2') },
          ]} />
        </ServiceSection>

        <ServiceSection title={t('internal_links.related_title')}>
          <ul className="space-y-2">
            <li><ServiceLink to={urlFor('transitaire', lang)}>{t('internal_links.transitaire')}</ServiceLink></li>
            <li><ServiceLink to={urlFor('diaspora', lang)}>{t('internal_links.diaspora')}</ServiceLink></li>
          </ul>
        </ServiceSection>
      </ServiceBody>
      <ServiceCta to={urlFor('pricing', lang)} label={k('cta')} />
    </>
  );
}
