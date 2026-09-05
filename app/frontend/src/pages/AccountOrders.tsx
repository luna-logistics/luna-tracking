import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';

/** Placeholder — order history module lands in a future chantier. */
export default function AccountOrders() {
  const { t } = useTranslation();
  return (
    <>
      <SEO title={t('account.orders_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('account.orders_title')}</h1>
      <p className="mt-4 text-sm text-slate-600 rounded-xl border border-slate-200 bg-white p-6">
        {t('account.orders_placeholder')}
      </p>
    </>
  );
}
