import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Receipt, Plus, Search } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusiness } from '@/contexts/BusinessContext';
import { fetchInvoices, INVOICE_STATUSES, INVOICE_STATUS_STYLES, type Invoice, type InvoiceStatus } from '@/lib/invoices';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type CustomerRef = { id: string; display_name: string };
type Filter = 'all' | InvoiceStatus;

export default function BusinessInvoices() {
  const { t, i18n } = useTranslation();
  const { current, can } = useBusiness();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Filter>('all');
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    (async () => {
      const [inv, { data: c }] = await Promise.all([
        fetchInvoices(current.id),
        supabase.from('business_customers').select('id, display_name').eq('business_id', current.id),
      ]);
      setRows(inv); setCustomers((c ?? []) as CustomerRef[]);
      setLoading(false);
    })();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const customerName = (id: string | null) =>
    id ? (customers.find((x) => x.id === id)?.display_name ?? '—') : '—';

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!query) return true;
      return [r.number, customerName(r.customer_id)]
        .some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, status, customers]);

  if (!current) return null;

  const totals = filtered.reduce((acc, r) => acc + Number(r.total), 0);

  return (
    <>
      <SEO title={t('business_invoices.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            {t('business_invoices.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_invoices.intro')}</p>
        </div>
        {can('invoices.write') && (
          <Button asChild variant="navy">
            <Link to="new"><Plus className="h-4 w-4" />{t('business_invoices.new')}</Link>
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_invoices.search_placeholder')} className="pl-8" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as Filter)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_invoices.status_all')}</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`invoice_status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} / {rows.length} · {t('business_invoices.total')}: <span className="font-semibold text-luna-navy">{totals.toLocaleString()} {current.currency}</span>
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_invoices.col_number')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_invoices.col_customer')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_invoices.col_status')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_invoices.col_issued')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_invoices.col_due')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_invoices.col_total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('business_invoices.empty')}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={r.id} className="font-mono text-sm font-semibold text-luna-navy hover:underline">
                    {r.number ?? t('business_invoices.no_number')}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{customerName(r.customer_id)}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', INVOICE_STATUS_STYLES[r.status])}>
                    {t(`invoice_status.${r.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {r.issued_on ? new Date(r.issued_on).toLocaleDateString(lang) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {r.due_on ? new Date(r.due_on).toLocaleDateString(lang) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-luna-navy whitespace-nowrap">
                  {Number(r.total).toLocaleString()} {r.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
