import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Instagram, Clock } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { IconCircle } from '@/components/IconCircle';

export default function Contact() {
  const { t } = useTranslation();

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
      body: <span className="text-slate-700">{t('contact.hours_body')}</span>,
    },
  ];

  return (
    <>
      <SEO title={t('contact.meta_title')} description={t('contact.meta_description')} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-luna-navy">{t('contact.page_title')}</h1>
          <p className="mt-3 text-slate-600 max-w-2xl">{t('contact.page_intro')}</p>

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
