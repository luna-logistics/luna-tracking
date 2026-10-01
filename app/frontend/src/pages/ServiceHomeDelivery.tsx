import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import {
  ServiceHero, ServiceBody, ServiceSection, ServiceSteps, ServiceCard, ServiceLink, ServiceFaq, ServiceCta,
} from '@/components/service/ServiceBlocks';
import { urlFor } from '@/lib/url/routes';

/** /livraison-domicile-congo — delivery to the recipient's address in Kinshasa after customs. */
export default function ServiceHomeDelivery() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const k = (key: string) => t(`svc_home.${key}`);

  return (
    <>
      <SEO title={k('meta_title')} description={k('meta_description')} />
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
      </ServiceBody>
      <ServiceCta to={urlFor('tracking', lang)} label={k('cta')} />
    </>
  );
}
