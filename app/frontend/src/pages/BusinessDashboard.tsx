import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Building2, Package, FileText, Users, Receipt, Wallet, BarChart3, ArrowRight } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { InfoHint } from '@/components/InfoHint';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import { fetchReport } from '@/lib/reports';
import { urlFor } from '@/lib/url/routes';
import type { BusinessAction } from '@/lib/business-permissions';

/**
 * Business dashboard landing page. Shows live point-in-time counts
 * (open shipments, pending quotes, unpaid invoices) plus a year-to-date
 * estimated profit, then a set of quick actions. Every card is gated by
 * the member's permission so an operations user never sees an invoice
 * figure they cannot read.
 */

type Kpis = {
  shipmentsInProgress: number | null;
  quotesPending: number | null;
  invoicesUnpaid: number | null;
  profitYtd: number | null;
  currency: string;
};

export default function BusinessDashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { current, role, can } = useBusiness();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  const bizId = current?.id;
  useEffect(() => {
    if (!bizId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Point-in-time counts (head:true → no rows transferred, just the
      // count). RLS scopes each to the current business already; the
      // extra business_id filter keeps it explicit + index-friendly.
      const [ship, quote, inv, report] = await Promise.all([
        can('shipments.read')
          ? supabase.from('shipments').select('id', { count: 'exact', head: true })
              .eq('business_id', bizId).not('status', 'in', '("delivered","cancelled")')
          : Promise.resolve({ count: null }),
        can('quotes.read')
          ? supabase.from('quotes').select('id', { count: 'exact', head: true })
              .eq('business_id', bizId).in('status', ['draft', 'sent'])
          : Promise.resolve({ count: null }),
        can('invoices.read')
          ? supabase.from('invoices').select('id', { count: 'exact', head: true })
              .eq('business_id', bizId).in('status', ['issued', 'overdue'])
          : Promise.resolve({ count: null }),
        can('reports.read') ? fetchReport(bizId, 'ytd') : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const profit = report
        ? Number(report.totals.invoices_revenue_ex_vat) - Number(report.totals.expenses_total)
        : null;
      setKpis({
        shipmentsInProgress: ship.count ?? null,
        quotesPending: quote.count ?? null,
        invoicesUnpaid: inv.count ?? null,
        profitYtd: profit,
        currency: report?.currency ?? current?.currency ?? 'EUR',
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizId]);

  if (!current) return null;

  const fmtMoney = (n: number) =>
    `${n.toLocaleString(lang === 'en' ? 'en' : 'fr-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${kpis?.currency ?? current.currency}`;

  const cards: { key: BusinessAction; label: string; value: number | null; money?: boolean; hint?: string }[] = [
    { key: 'shipments.read', label: t('business_dashboard.kpi_shipments_in_progress'), value: kpis?.shipmentsInProgress ?? null },
    { key: 'quotes.read',    label: t('business_dashboard.kpi_quotes_pending'),        value: kpis?.quotesPending ?? null },
    { key: 'invoices.read',  label: t('business_dashboard.kpi_invoices_unpaid'),       value: kpis?.invoicesUnpaid ?? null },
    { key: 'reports.read',   label: t('business_dashboard.kpi_estimated_profit'),      value: kpis?.profitYtd ?? null, money: true, hint: t('business_dashboard.kpi_estimated_profit_hint') },
  ];
  const visibleCards = cards.filter((c) => can(c.key));

  const quickActions: { key: BusinessAction; to: string; icon: typeof Package; label: string }[] = [
    { key: 'shipments.read', to: urlFor('businessShipments', lang), icon: Package,  label: t('business_dashboard.qa_shipment') },
    { key: 'quotes.read',    to: urlFor('businessQuotes',    lang), icon: FileText, label: t('business_dashboard.qa_quote') },
    { key: 'clients.read',   to: urlFor('businessClients',   lang), icon: Users,    label: t('business_dashboard.qa_client') },
    { key: 'invoices.read',  to: urlFor('businessInvoicing', lang), icon: Receipt,  label: t('business_dashboard.qa_invoice') },
    { key: 'expenses.read',  to: urlFor('businessExpenses',  lang), icon: Wallet,   label: t('business_dashboard.qa_expense') },
    { key: 'reports.read',   to: urlFor('businessReports',   lang), icon: BarChart3, label: t('business_dashboard.qa_reports') },
  ];
  const visibleActions = quickActions.filter((qa) => can(qa.key));

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

      {visibleCards.length > 0 && (
        <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
          {visibleCards.map((c) => (
            <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">
                {c.label}
                {c.hint && <InfoHint text={c.hint} />}
              </div>
              <div className="mt-2 text-2xl font-bold text-luna-navy">
                {loading || c.value === null
                  ? <span className="text-slate-300">…</span>
                  : c.money ? fmtMoney(c.value) : c.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {visibleActions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
            {t('business_dashboard.quick_actions_title')}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleActions.map((qa) => {
              const Icon = qa.icon;
              return (
                <Link key={qa.to} to={qa.to}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-luna-blue/40 hover:bg-luna-navy/[0.02] transition-colors flex items-center gap-3">
                  <Icon className="h-5 w-5 text-luna-navy shrink-0" aria-hidden="true" />
                  <div className="text-sm font-medium text-luna-navy flex-1">{qa.label}</div>
                  <ArrowRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {can('members.invite') && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-luna-navy shrink-0" aria-hidden="true" />
            <p className="text-sm text-slate-600">{t('business_dashboard.invite_team_hint')}</p>
          </div>
          <Link to={urlFor('businessTeam', lang)}
            className="text-sm font-semibold text-luna-blue hover:underline inline-flex items-center gap-1">
            {t('business_dashboard.invite_team')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}
    </>
  );
}
