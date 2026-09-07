import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Search, ArrowRight, Home, Truck } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * Read-only aggregation of every customer_address across every
 * business_customer of the current business. CRUD lives on the client
 * detail page — this view is a searchable phonebook.
 */

type AddressRow = {
  id: string;
  customer_id: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  is_default_billing: boolean;
  is_default_shipping: boolean;
  updated_at: string;
  business_customers: { display_name: string; is_active: boolean } | null;
};

type Filter = 'all' | 'billing' | 'shipping';

export default function BusinessAddresses() {
  const { t, i18n } = useTranslation();
  const { current } = useBusiness();
  const [rows, setRows] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select(`
          id, customer_id, label, address_line1, address_line2, postal_code, city, country,
          is_default_billing, is_default_shipping, updated_at,
          business_customers!inner ( display_name, is_active, business_id )
        `)
        .eq('business_customers.business_id', current.id)
        .order('updated_at', { ascending: false });
      if (error) { console.warn('[addresses] fetch:', error.message); setRows([]); }
      else setRows((data ?? []) as unknown as AddressRow[]);
      setLoading(false);
    })();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'billing'  && !r.is_default_billing)  return false;
      if (filter === 'shipping' && !r.is_default_shipping) return false;
      if (!query) return true;
      return [
        r.business_customers?.display_name,
        r.label, r.address_line1, r.address_line2, r.postal_code, r.city, r.country,
      ].some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, filter]);

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_addresses.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <MapPin className="h-6 w-6" />
            {t('business_addresses.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_addresses.intro')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_addresses.search_placeholder')} className="pl-8" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_addresses.filter_all')}</SelectItem>
            <SelectItem value="billing">{t('business_addresses.filter_billing')}</SelectItem>
            <SelectItem value="shipping">{t('business_addresses.filter_shipping')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_addresses.col_customer')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_addresses.col_label')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_addresses.col_address')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_addresses.col_flags')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_addresses.col_updated')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('business_addresses.empty')}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={`/entreprise/clients/${r.customer_id}`}
                    className="font-medium text-luna-navy hover:text-luna-blue inline-flex items-center gap-1">
                    {r.business_customers?.display_name ?? '—'}
                    <ArrowRight className="h-3 w-3 opacity-50" />
                  </Link>
                  {r.business_customers?.is_active === false && (
                    <span className="ml-2 text-[10px] rounded-full bg-slate-100 text-slate-500 px-1.5 py-0.5">
                      {t('business_addresses.customer_archived')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.label ?? '—'}</td>
                <td className="px-4 py-3 text-slate-700 max-w-md">
                  <p className="truncate">{r.address_line1 ?? '—'}</p>
                  {r.address_line2 && <p className="truncate text-xs text-slate-500">{r.address_line2}</p>}
                  <p className="text-xs text-slate-500">
                    {[r.postal_code, r.city, r.country].filter(Boolean).join(' · ') || '—'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.is_default_billing && (
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', 'bg-luna-navy/10 text-luna-navy')}>
                        <Home className="h-3 w-3" />
                        {t('business_addresses.default_billing')}
                      </span>
                    )}
                    {r.is_default_shipping && (
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', 'bg-emerald-100 text-emerald-800')}>
                        <Truck className="h-3 w-3" />
                        {t('business_addresses.default_shipping')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                  {new Date(r.updated_at).toLocaleDateString(lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
