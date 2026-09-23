import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, ToggleLeft, ToggleRight, Loader2, Lock } from 'lucide-react';
import { fetchDashboardFeatures, toggleDashboardFeature, ensureFeatureExists, type DashboardFeature, type DashboardType } from '@/lib/dashboard-features';
import { toast } from '@/components/ui/sonner';

const ALWAYS_ON_KEYS = new Set([
  'businessDashboard', 'businessSupport',
  'account', 'accountSupport',
]);

const BUSINESS_MENU_REGISTRY: { key: string; labelKey: string }[] = [
  { key: 'businessDashboard', labelKey: 'business_nav.dashboard' },
  { key: 'businessClients',   labelKey: 'business_nav.clients' },
  { key: 'businessQuotes',    labelKey: 'business_nav.quotes' },
  { key: 'businessShipments', labelKey: 'business_nav.shipments' },
  { key: 'businessInvoicing', labelKey: 'business_nav.invoicing' },
  { key: 'businessExpenses',  labelKey: 'business_nav.expenses' },
  { key: 'businessReports',   labelKey: 'business_nav.reports' },
  { key: 'businessTeam',      labelKey: 'business_nav.team' },
  { key: 'businessSettings',  labelKey: 'business_nav.settings' },
  { key: 'businessDocuments', labelKey: 'business_nav.documents' },
  { key: 'businessAddresses', labelKey: 'business_nav.addresses' },
  { key: 'businessApiKeys',   labelKey: 'business_nav.api_keys' },
  { key: 'businessApiUsage',  labelKey: 'business_nav.api_usage' },
  { key: 'businessWebhooks',  labelKey: 'business_nav.webhooks' },
  { key: 'businessSupport',   labelKey: 'business_nav.support' },
];

const INDIVIDUAL_MENU_REGISTRY: { key: string; labelKey: string }[] = [
  { key: 'account',         labelKey: 'account.sidebar_shipments' },
  { key: 'accountOrders',   labelKey: 'account.sidebar_orders' },
  { key: 'accountInvoices', labelKey: 'account.sidebar_invoices' },
  { key: 'accountSupport',  labelKey: 'account.sidebar_support' },
];

function FeatureSection({ dashboard, registry, title }: {
  dashboard: DashboardType;
  registry: { key: string; labelKey: string }[];
  title: string;
}) {
  const { t } = useTranslation();
  const [features, setFeatures] = useState<DashboardFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of registry) {
        await ensureFeatureExists(dashboard, r.key);
      }
      const rows = await fetchDashboardFeatures(dashboard);
      if (!cancelled) { setFeatures(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dashboard, registry]);

  const handleToggle = async (feat: DashboardFeature) => {
    if (ALWAYS_ON_KEYS.has(feat.feature_key)) return;
    setToggling(feat.id);
    try {
      await toggleDashboardFeature(feat.id, !feat.enabled);
      setFeatures((prev) => prev.map((f) => f.id === feat.id ? { ...f, enabled: !f.enabled } : f));
      toast.success(t('dashboard_config.saved'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setToggling(null);
    }
  };

  const featureMap = new Map(features.map((f) => [f.feature_key, f]));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="rounded-lg border divide-y">
        {registry.map((r) => {
          const feat = featureMap.get(r.key);
          const alwaysOn = ALWAYS_ON_KEYS.has(r.key);
          const enabled = alwaysOn || (feat?.enabled ?? true);
          const isToggling = toggling === feat?.id;

          return (
            <div key={r.key} className="flex items-center justify-between px-4 py-3 gap-4">
              <div className="min-w-0">
                <span className="text-sm font-medium">{t(r.labelKey)}</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">{r.key}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {alwaysOn ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {t('dashboard_config.always_on')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => feat && handleToggle(feat)}
                    disabled={isToggling || !feat}
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                    aria-label={enabled ? t('dashboard_config.toggle_off') : t('dashboard_config.toggle_on')}
                  >
                    {isToggling ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : enabled ? (
                      <ToggleRight className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-slate-400" />
                    )}
                    <span className={enabled ? 'text-emerald-600' : 'text-slate-500'}>
                      {enabled ? t('dashboard_config.enabled') : t('dashboard_config.disabled')}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function AdminDashboardConfig() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">{t('dashboard_config.page_title')}</h1>
        </div>
        <p className="text-muted-foreground">{t('dashboard_config.page_intro')}</p>
      </div>

      <FeatureSection
        dashboard="business"
        registry={BUSINESS_MENU_REGISTRY}
        title={t('dashboard_config.business_title')}
      />

      <FeatureSection
        dashboard="individual"
        registry={INDIVIDUAL_MENU_REGISTRY}
        title={t('dashboard_config.individual_title')}
      />
    </div>
  );
}
