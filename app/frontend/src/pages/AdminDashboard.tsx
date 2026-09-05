import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { RebuildPanel } from '@/components/RebuildPanel';

export default function AdminDashboard() {
  const { t } = useTranslation();
  return (
    <>
      <SEO title={t('admin.meta_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.dashboard_title')}</h1>
      <p className="mt-4 text-sm text-slate-600 rounded-xl border border-slate-200 bg-white p-6">
        {t('admin.dashboard_body')}
      </p>

      <div className="mt-6">
        <RebuildPanel />
      </div>
    </>
  );
}
