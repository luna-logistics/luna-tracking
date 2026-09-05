import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { urlFor } from '@/lib/url/routes';

export default function NotFound() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  return (
    <>
      <SEO title={t('not_found.title')} noindex />
      <section className="py-24 text-center">
        <div className="mx-auto max-w-md px-4">
          <p className="text-6xl font-bold text-luna-navy">404</p>
          <h1 className="mt-4 text-2xl font-semibold text-luna-navy">{t('not_found.title')}</h1>
          <p className="mt-3 text-slate-600">{t('not_found.body')}</p>
          <Button asChild variant="navy" className="mt-6">
            <Link to={urlFor('home', lang)}>{t('not_found.cta')}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
