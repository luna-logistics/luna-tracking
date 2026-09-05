import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { urlFor } from '@/lib/url/routes';

export default function Account() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { user } = useAuth();

  return (
    <>
      <SEO title={t('account.meta_title')} noindex />
      <div>
        <h1 className="text-2xl font-bold text-luna-navy">{t('account.welcome', { email: user?.email ?? '' })}</h1>
        <h2 className="mt-6 text-lg font-semibold text-luna-navy">{t('account.shipments_title')}</h2>

        <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
          <h3 className="mt-3 font-semibold text-luna-navy">{t('account.shipments_empty_title')}</h3>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">{t('account.shipments_empty_body')}</p>
          <Button asChild variant="navy" className="mt-5">
            <Link to={urlFor('pricing', lang)}>{t('account.shipments_empty_cta')}</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
