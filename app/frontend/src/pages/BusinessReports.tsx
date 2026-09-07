import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, Download, Loader2, Package, FileText, Receipt, Wallet,
  TrendingUp, Calendar,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchReport, resolveReportRange, toCsv, downloadCsv,
  type BusinessReport, type ReportRange,
} from '@/lib/reports';
import { cn } from '@/lib/utils';

export default function BusinessReports() {
  const { t, i18n } = useTranslation();
  const { current } = useBusiness();
  const [range, setRange] = useState<ReportRange>('this_month');
  const [rep, setRep] = useState<BusinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    void fetchReport(current.id, range).then((r) => { setRep(r); setLoading(false); });
  }, [current?.id, range]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  const margin = rep ? Number(rep.totals.invoices_revenue_ex_vat) - Number(rep.totals.expenses_total) : 0;
  const marginPct = rep && Number(rep.totals.invoices_revenue_ex_vat) > 0
    ? (margin / Number(rep.totals.invoices_revenue_ex_vat)) * 100 : null;

  const fmtDate = (v: string) => new Date(v).toLocaleDateString(lang, { day: '2-digit', month: 'short', year: 'numeric' });

  const exportSales = () => {
    if (!rep) return;
    const rows = rep.sales_journal.map((r) => ({
      number: r.number,
      issued_on: r.issued_on,
      paid_on: r.paid_on ?? '',
      customer_name: r.customer_name ?? '',
      customer_vat: r.customer_vat ?? '',
      customer_country: r.customer_country ?? '',
      subtotal_ex_vat: Number(r.subtotal).toFixed(2),
      vat: Number(r.vat_total).toFixed(2),
      total_inc_vat: Number(r.total).toFixed(2),
      currency: r.currency,
      status: r.status,
    }));
    downloadCsv(`sales_journal_${range}.csv`, toCsv(rows));
  };

  const exportExpenses = () => {
    if (!rep) return;
    const rows = rep.expenses_journal.map((r) => ({
      incurred_on: r.incurred_on,
      kind: r.kind,
      label: r.label,
      vendor: r.vendor ?? '',
      invoice_ref: r.invoice_ref ?? '',
      shipment_ref: r.shipment_ref ?? '',
      amount: Number(r.amount).toFixed(2),
      vat_pct: Number(r.vat_pct).toFixed(1),
      currency: r.currency,
    }));
    downloadCsv(`expenses_journal_${range}.csv`, toCsv(rows));
  };

  const modeMax = rep ? Math.max(1, ...rep.revenue_by_mode.map((m) => Number(m.subtotal))) : 1;

  return (
    <>
      <SEO title={t('business_reports.meta_title')} noindex />
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          {t('business_reports.title')}
        </h1>
        <div className="ml-auto flex gap-1">
          {(['this_month','last_month','ytd','last_12m'] as ReportRange[]).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border',
                r === range
                  ? 'border-luna-navy bg-luna-navy text-white'
                  : 'border-slate-200 text-slate-700 hover:border-luna-blue',
              )}>
              {t(`business_reports.range_${r}`)}
            </button>
          ))}
        </div>
      </div>
      {rep && (
        <p className="text-xs text-slate-500 mb-6 inline-flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          {t('business_reports.period_label')}: {fmtDate(rep.range.since)} → {fmtDate(rep.range.until)}
        </p>
      )}

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      )}

      {!loading && rep && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Receipt} tone="navy"
              label={t('business_reports.kpi_revenue_ex_vat')}
              value={`${Number(rep.totals.invoices_revenue_ex_vat).toLocaleString()} ${rep.currency}`}
              sub={t('business_reports.kpi_revenue_sub', { paid: rep.totals.invoices_paid_count, issued: rep.totals.invoices_issued_count })} />
            <Stat icon={Wallet} tone="amber"
              label={t('business_reports.kpi_expenses')}
              value={`${Number(rep.totals.expenses_total).toLocaleString()} ${rep.currency}`} />
            <Stat icon={TrendingUp}
              tone={margin >= 0 ? 'emerald' : 'red'}
              label={t('business_reports.kpi_margin')}
              value={`${margin.toLocaleString()} ${rep.currency}`}
              sub={marginPct !== null ? `${marginPct.toFixed(1)}%` : undefined} />
            <Stat icon={Package} tone="blue"
              label={t('business_reports.kpi_shipments')}
              value={rep.totals.shipments_delivered.toLocaleString()}
              sub={t('business_reports.kpi_shipments_sub', { created: rep.totals.shipments_created })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={FileText} tone="blue"
              label={t('business_reports.kpi_quotes')}
              value={rep.totals.quotes_created.toLocaleString()}
              sub={t('business_reports.kpi_quotes_sub', { accepted: rep.totals.quotes_accepted })} />
            <Stat icon={Receipt} tone="navy"
              label={t('business_reports.kpi_vat')}
              value={`${Number(rep.totals.invoices_vat_collected).toLocaleString()} ${rep.currency}`} />
            <div className="hidden sm:block" />
            <div className="hidden sm:block" />
          </div>

          {/* Revenue by mode */}
          <section>
            <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-2">
              {t('business_reports.by_mode_title')}
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {rep.revenue_by_mode.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-6">{t('business_reports.empty')}</p>
              ) : (
                <div className="space-y-2">
                  {rep.revenue_by_mode.map((m) => (
                    <div key={m.mode} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium text-luna-navy">{t(`shipment_mode.${m.mode}`)}</span>
                      <div className="flex-1 h-6 rounded bg-slate-100 relative overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-luna-blue rounded"
                          style={{ width: `${(Number(m.subtotal) / modeMax) * 100}%` }} />
                      </div>
                      <span className="w-32 text-right text-sm font-semibold text-luna-navy tabular-nums">
                        {Number(m.subtotal).toLocaleString()} {rep.currency}
                      </span>
                      <span className="w-16 text-right text-xs text-slate-500">
                        {m.invoices} {t('business_reports.invoices_short')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Top customers */}
          <section>
            <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-2">
              {t('business_reports.top_customers_title')}
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-luna-navy">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">#</th>
                    <th className="text-left px-4 py-2 font-semibold">{t('business_reports.tc_customer')}</th>
                    <th className="text-right px-4 py-2 font-semibold">{t('business_reports.tc_invoices')}</th>
                    <th className="text-right px-4 py-2 font-semibold">{t('business_reports.tc_revenue')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rep.top_customers.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">{t('business_reports.empty')}</td></tr>
                  )}
                  {rep.top_customers.map((c, i) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                      <td className="px-4 py-2 text-luna-navy">{c.display_name}</td>
                      <td className="px-4 py-2 text-right">{c.invoices}</td>
                      <td className="px-4 py-2 text-right font-semibold text-luna-navy tabular-nums">
                        {Number(c.subtotal).toLocaleString()} {rep.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Exports */}
          <section className="rounded-2xl border-2 border-luna-blue/30 bg-luna-blue/5 p-5">
            <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
              {t('business_reports.export_title')}
            </h2>
            <p className="mt-1 text-xs text-slate-600">{t('business_reports.export_help')}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="navy" onClick={exportSales} disabled={rep.sales_journal.length === 0}>
                <Download className="h-4 w-4" />
                {t('business_reports.export_sales', { n: rep.sales_journal.length })}
              </Button>
              <Button variant="outline" onClick={exportExpenses} disabled={rep.expenses_journal.length === 0}>
                <Download className="h-4 w-4" />
                {t('business_reports.export_expenses', { n: rep.expenses_journal.length })}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ icon: Icon, tone, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: 'navy' | 'emerald' | 'amber' | 'red' | 'blue';
  label: string; value: string; sub?: string;
}) {
  const iconClass = {
    navy:    'bg-luna-navy/10 text-luna-navy',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    red:     'bg-red-100 text-red-700',
    blue:    'bg-luna-blue/10 text-luna-blue',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex gap-3 items-start">
      <div className={cn('shrink-0 rounded-xl p-2', iconClass)}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-luna-navy tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
