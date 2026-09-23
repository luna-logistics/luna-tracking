import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useDashboardFeatures } from '@/contexts/DashboardFeaturesContext';
import { urlFor } from '@/lib/url/routes';
import type { DashboardType } from '@/lib/dashboard-features';
import type { ReactNode } from 'react';

type Props = {
  dashboard: DashboardType;
  featureKey: string;
  children: ReactNode;
};

export function FeatureGate({ dashboard, featureKey, children }: Props) {
  const { isFeatureEnabled, loading } = useDashboardFeatures();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  if (loading) return null;

  if (!isFeatureEnabled(dashboard, featureKey)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('feature_gate.disabled_title')}</h2>
        <p className="text-muted-foreground mb-6 max-w-md">{t('feature_gate.disabled_body')}</p>
        <Link
          to={urlFor(dashboard === 'business' ? 'businessDashboard' : 'account', lang)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t('feature_gate.back')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
