import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { fetchAllForwardingRequests, updateForwardingStatus, FORWARDING_STATUSES, type ForwardingRequest, type ForwardingStatus } from '@/lib/forwarding';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<ForwardingStatus, string> = {
  new:       'bg-blue-100 text-blue-900 ring-blue-300',
  contacted: 'bg-indigo-100 text-indigo-900 ring-indigo-300',
  quoted:    'bg-luna-cyan/20 text-luna-navy ring-luna-cyan',
  closed:    'bg-slate-100 text-slate-600 ring-slate-300',
};

export default function AdminForwardingRequests() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ForwardingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setRows(await fetchAllForwardingRequests());
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const setStatus = async (id: string, status: ForwardingStatus) => {
    try { await updateForwardingStatus(id, status); toast.success('OK'); await reload(); }
    catch { toast.error(t('common.error_generic')); }
  };

  return (
    <>
      <SEO title={t('admin.forwarding_admin_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.forwarding_admin_title')}</h1>
      <p className="mt-2 text-slate-600">{t('admin.forwarding_admin_intro')}</p>

      {loading ? (
        <div className="mt-6 py-10 text-center text-slate-500">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="mt-6 py-10 text-center text-slate-500 rounded-2xl border border-slate-200 bg-white">
          {t('admin.forwarding_no_requests')}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.forwarding_col_date')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.forwarding_col_name')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.forwarding_col_contact')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.forwarding_col_origin')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.forwarding_col_description')}</th>
                <th className="text-right px-4 py-3 font-semibold">{t('admin.forwarding_col_value')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.forwarding_col_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {new Date(r.created_at).toLocaleDateString('fr-BE')}
                  </td>
                  <td className="px-4 py-3 text-luna-navy">{r.name}</td>
                  <td className="px-4 py-3 text-xs">
                    <div>{r.email}</div>
                    {r.phone && <div className="text-slate-500">{r.phone}</div>}
                  </td>
                  <td className="px-4 py-3">{r.origin_country}</td>
                  <td className="px-4 py-3 text-xs max-w-sm">{r.description}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.estimated_value != null ? `${Number(r.estimated_value).toFixed(2)} €` : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as ForwardingStatus)}>
                      <SelectTrigger className={cn('h-8 text-xs font-semibold ring-1 border-0', STATUS_STYLE[r.status])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORWARDING_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{t(`admin.forwarding_status_${s}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
