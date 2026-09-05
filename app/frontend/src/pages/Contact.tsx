import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Instagram, Clock } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { IconCircle } from '@/components/IconCircle';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';

export default function Contact() {
  const { t } = useTranslation();
  const metaTitle       = useContent('contact', 'meta_title',       t('contact.meta_title'));
  const metaDescription = useContent('contact', 'meta_description', t('contact.meta_description'));
  const pageTitle       = useContent('contact', 'page_title',       t('contact.page_title'));
  const pageIntro       = useContent('contact', 'page_intro',       t('contact.page_intro'));
  const hoursBody       = useContent('contact', 'hours_body',       t('contact.hours_body'));

  const blocks = [
    {
      icon: Mail,
      title: t('contact.email_title'),
      body: (
        <a href="mailto:info@lunatrackinglogistics.be" className="text-luna-blue hover:underline">
          {t('footer.email')}
        </a>
      ),
    },
    {
      icon: MapPin,
      title: t('contact.address_title'),
      body: <span>{t('footer.address')}</span>,
    },
    {
      icon: Instagram,
      title: t('contact.instagram_title'),
      body: (
        <a
          href="https://www.instagram.com/Luna_TrackingLogistics/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-luna-blue hover:underline"
        >
          {t('footer.instagram_handle')}
        </a>
      ),
    },
    {
      icon: Clock,
      title: t('contact.hours_title'),
      body: <Ed page="contact" field="hours_body" multiline className="text-slate-700">{hoursBody}</Ed>,
    },
  ];

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Ed page="contact" field="page_title" as="h1" className="text-3xl font-bold text-luna-navy block">
            {pageTitle}
          </Ed>
          <Ed page="contact" field="page_intro" as="p" multiline className="mt-3 text-slate-600 max-w-2xl block">
            {pageIntro}
          </Ed>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {blocks.map((b) => (
              <div key={b.title} className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
                <IconCircle icon={b.icon} variant="onLight" label={b.title} />
                <h2 className="mt-4 text-lg font-semibold text-luna-navy">{b.title}</h2>
                <div className="mt-2 text-sm">{b.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
