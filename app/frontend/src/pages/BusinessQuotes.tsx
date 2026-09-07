import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Search, ArrowRight } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusiness } from '@/contexts/BusinessContext';
import { fetchQuotes, QUOTE_STATUSES, QUOTE_STATUS_STYLES, type Quote, type QuoteStatus } from '@/lib/quotes';
import { fetchCustomers, type BusinessCustomer } from '@/lib/customers';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | QuoteStatus;

export default function BusinessQuotes() {
  const { t } = useTranslation();
  const { current, can } = useBusiness();
  const [rows, setRows] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const canWrite = can('quotes.write');

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    const [rs, cs] = await Promise.all([fetchQuotes(current.id), fetchCustomers(current.id)]);
    setRows(rs); setCustomers(cs);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  const customerName = (id: string | null) =>
    id ? (customers.find((c) => c.id === id)?.display_name ?? '—') : '—';

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!query) return true;
      const cn2 = customerName(r.customer_id).toLowerCase();
      return [
        r.reference, r.origin_city, r.destination_city, cn2,
      ].some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, status, customers]);

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_quotes.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <FileText className="h-6 w-6" /> {t('business_quotes.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_quotes.intro')}</p>
        </div>
        {canWrite && (
          <Button asChild variant="navy">
            <Link to="new"><Plus className="h-4 w-4" />{t('business_quotes.new')}</Link>
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_quotes.search_placeholder')} className="pl-8" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_quotes.status_all')}</SelectItem>
            {QUOTE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`quote_status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_quotes.col_ref')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_quotes.col_client')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_quotes.col_route')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_quotes.col_price')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_quotes.col_status')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_quotes.col_valid_until')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('business_quotes.empty')}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={r.id} className="font-mono text-sm font-semibold text-luna-navy hover:underline">
                    {r.reference}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{customerName(r.customer_id)}</td>
                <td className="px-4 py-3 text-slate-700 text-sm">
                  <span className="inline-flex items-center gap-1">
                    {[r.origin_city, r.origin_country].filter(Boolean).join(', ') || '—'}
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    {[r.destination_city, r.destination_country].filter(Boolean).join(', ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-luna-navy whitespace-nowrap">
                  {Number(r.customer_price).toLocaleString()} {r.currency}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', QUOTE_STATUS_STYLES[r.status])}>
                    {t(`quote_status.${r.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                  {r.valid_until ? new Date(r.valid_until).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
