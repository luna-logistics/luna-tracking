import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Building2, Package, FileText, Users, Receipt, Wallet, Sparkles, ArrowRight } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/contexts/BusinessContext';
import { urlFor } from '@/lib/url/routes';

/**
 * Business dashboard landing page. Phase 2 ships an honest layout with:
 *   - a header naming the current business + role,
 *   - placeholder KPI cards (zeros until phase 5 wires the real
 *     shipments / quotes / invoices data — no fake numbers),
 *   - a "quick actions" grid that links to the future modules,
 *   - a roadmap panel of what's coming next.
 *
 * Phase 5-8 will replace the placeholder KPIs with live counts, add
 * charts, and hydrate the quick actions.
 */
export default function BusinessDashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { current, role } = useBusiness();
  if (!current) return null;

  const kpis = [
    { label: t('business_dashboard.kpi_shipments_in_progress'), value: '—' },
    { label: t('business_dashboard.kpi_quotes_pending'),        value: '—' },
    { label: t('business_dashboard.kpi_invoices_unpaid'),       value: '—' },
    { label: t('business_dashboard.kpi_estimated_margin'),      value: '—' },
  ];

  const quickActions = [
    { to: urlFor('businessShipments', lang), icon: Package,  label: t('business_dashboard.qa_shipment') },
    { to: urlFor('businessQuotes',    lang), icon: FileText, label: t('business_dashboard.qa_quote') },
    { to: urlFor('businessClients',   lang), icon: Users,    label: t('business_dashboard.qa_client') },
    { to: urlFor('businessInvoicing', lang), icon: Receipt,  label: t('business_dashboard.qa_invoice') },
    { to: urlFor('businessExpenses',  lang), icon: Wallet,   label: t('business_dashboard.qa_expense') },
  ];

  return (
    <>
      <SEO title={t('business_dashboard.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Building2 className="h-6 w-6" /> {current.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('business_dashboard.role_label')}: <span className="font-medium text-luna-navy">{t(`business_team.role_${role}`)}</span>
            {' · '}
            {current.country} · {current.currency}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{k.label}</div>
            <div className="mt-2 text-2xl font-bold text-luna-navy">{k.value}</div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
          {t('business_dashboard.quick_actions_title')}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <Link key={qa.to} to={qa.to}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-luna-blue/40 hover:bg-luna-navy/[0.02] transition-colors">
                <Icon className="h-5 w-5 text-luna-navy" aria-hidden="true" />
                <div className="mt-2 text-sm font-medium text-luna-navy">{qa.label}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border-2 border-luna-blue/30 bg-white p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-luna-blue mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-luna-navy">{t('business_dashboard.coming_title')}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700 list-disc list-inside">
              <li>{t('business_dashboard.coming_kpi')}</li>
              <li>{t('business_dashboard.coming_clients')}</li>
              <li>{t('business_dashboard.coming_quotes')}</li>
              <li>{t('business_dashboard.coming_shipments')}</li>
              <li>{t('business_dashboard.coming_expenses')}</li>
              <li>{t('business_dashboard.coming_invoices')}</li>
              <li>{t('business_dashboard.coming_reports')}</li>
            </ul>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to={urlFor('businessTeam', lang)}>
                {t('business_dashboard.invite_team')}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
