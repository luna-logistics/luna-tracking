import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Mail, Phone, Archive, ArchiveRestore } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchCustomers, deactivateCustomer, reactivateCustomer,
  type BusinessCustomer,
} from '@/lib/customers';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Customer list. Search-first UI: query filters by display_name,
 * company, email, phone in real time. A "show inactive" toggle keeps
 * archived customers visible when needed (history digging) without
 * cluttering the main list.
 */
export default function BusinessClients() {
  const { t } = useTranslation();
  const { current, can } = useBusiness();
  const [rows, setRows] = useState<BusinessCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const canWrite = can('clients.write');

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    setRows(await fetchCustomers(current.id));
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (!showInactive && !c.is_active) return false;
      if (!query) return true;
      return [c.display_name, c.company_name, c.email, c.phone]
        .some((f) => (f ?? '').toLowerCase().includes(query));
    });
  }, [rows, q, showInactive]);

  const toggleActive = async (c: BusinessCustomer) => {
    try {
      if (c.is_active) await deactivateCustomer(c.id);
      else            await reactivateCustomer(c.id);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    }
  };

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_clients.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Users className="h-6 w-6" /> {t('business_clients.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_clients.intro')}</p>
        </div>
        {canWrite && (
          <Button asChild variant="navy">
            <Link to="new">
              <Plus className="h-4 w-4" />
              {t('business_clients.new')}
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_clients.search_placeholder')}
            className="pl-8" />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
          {t('business_clients.show_inactive')}
        </label>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_clients.col_name')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_clients.col_contact')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_clients.col_vat')}</th>
              <th className="text-center px-4 py-3 font-semibold">{t('business_clients.col_active')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_clients.col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('business_clients.empty')}</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className={cn('hover:bg-slate-50', !c.is_active && 'opacity-60')}>
                <td className="px-4 py-3">
                  <Link to={c.id} className="font-medium text-luna-navy hover:underline">{c.display_name}</Link>
                  {c.company_name && c.customer_type === 'individual' && (
                    <div className="text-xs text-slate-500">{c.company_name}</div>
                  )}
                  <div className="text-xs text-slate-500">{t(`business_clients.type_${c.customer_type}`)}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {c.email && <div className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-slate-400" />{c.email}</div>}
                  {c.phone && <div className="inline-flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3 text-slate-400" />{c.phone}</div>}
                  {!c.email && !c.phone && <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.vat_number ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  {c.is_active
                    ? <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">{t('business_clients.active')}</span>
                    : <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">{t('business_clients.inactive')}</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  <Button asChild size="sm" variant="outline">
                    <Link to={c.id}>{t('business_clients.open')}</Link>
                  </Button>
                  {canWrite && (
                    <Button size="sm" variant="ghost"
                      onClick={() => toggleActive(c)}
                      className={c.is_active ? 'text-slate-500 hover:text-luna-navy' : 'text-emerald-700 hover:bg-emerald-50'}>
                      {c.is_active
                        ? <><Archive className="h-3.5 w-3.5" />{t('business_clients.archive')}</>
                        : <><ArchiveRestore className="h-3.5 w-3.5" />{t('business_clients.reactivate')}</>}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
