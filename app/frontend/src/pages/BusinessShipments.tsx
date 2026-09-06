import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, Plus, Search, ArrowRight, Copy } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShipmentStatusBadge } from '@/components/ShipmentStatusBadge';
import { useBusiness } from '@/contexts/BusinessContext';
import { fetchShipments, fetchTemplates, type Shipment, type ShipmentTemplate } from '@/lib/shipments';
import { fetchCustomers, type BusinessCustomer } from '@/lib/customers';
import { SHIPMENT_STATUSES, SHIPMENT_DIRECTIONS, type ShipmentStatus, type ShipmentDirection } from '@/lib/shipment-status';

type StatusFilter = 'all' | ShipmentStatus;
type DirectionFilter = 'all' | ShipmentDirection;

/**
 * Shipment list with search + status/direction filters + a sidecar
 * "Templates" section (create-from-template shortcut). Row click opens
 * the detail; separate quick "Duplicate" action creates a fresh
 * shipment pre-populated from the row.
 */
export default function BusinessShipments() {
  const { t } = useTranslation();
  const { current, can } = useBusiness();
  const [rows, setRows] = useState<Shipment[]>([]);
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [templates, setTemplates] = useState<ShipmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');

  const canWrite = can('shipments.write');

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    const [s, c, tpl] = await Promise.all([
      fetchShipments(current.id),
      fetchCustomers(current.id),
      fetchTemplates(current.id),
    ]);
    setRows(s); setCustomers(c); setTemplates(tpl);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  const customerName = (id: string | null) =>
    id ? (customers.find((c) => c.id === id)?.display_name ?? '—') : '—';

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (direction !== 'all' && s.direction !== direction) return false;
      if (!query) return true;
      const custName = customerName(s.customer_id).toLowerCase();
      return [
        s.reference, s.tracking_number, s.carrier_name, s.origin_city,
        s.destination_city, custName,
      ].some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, status, direction, customers]);

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_shipments.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Package className="h-6 w-6" /> {t('business_shipments.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_shipments.intro')}</p>
        </div>
        {canWrite && (
          <Button asChild variant="navy">
            <Link to="new"><Plus className="h-4 w-4" />{t('business_shipments.new')}</Link>
          </Button>
        )}
      </div>

      {templates.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            {t('business_shipments.templates_title')}
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {templates.map((tpl) => (
              <Link key={tpl.id} to={`new?template=${tpl.id}`}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-luna-blue/40 hover:bg-luna-navy/[0.02]">
                <div className="flex items-center gap-2 text-sm text-luna-navy">
                  <Copy className="h-3.5 w-3.5" />
                  <span className="font-medium">{tpl.name}</span>
                </div>
                {tpl.description && <div className="text-[11px] text-slate-500 mt-0.5">{tpl.description}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_shipments.search_placeholder')} className="pl-8" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('business_shipments.status_filter')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_shipments.status_all')}</SelectItem>
            {SHIPMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`shipment_status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={(v) => setDirection(v as DirectionFilter)}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t('business_shipments.direction_filter')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_shipments.direction_all')}</SelectItem>
            {SHIPMENT_DIRECTIONS.map((d) => (
              <SelectItem key={d} value={d}>{t(`shipment_direction.${d}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_shipments.col_ref')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_shipments.col_client')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_shipments.col_route')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_shipments.col_mode')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_shipments.col_status')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_shipments.col_updated')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('business_shipments.empty')}</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link to={s.id} className="font-mono text-sm font-semibold text-luna-navy hover:underline">
                    {s.reference}
                  </Link>
                  <div className="text-[11px] text-slate-500 uppercase">
                    {t(`shipment_direction.${s.direction}`)}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{customerName(s.customer_id)}</td>
                <td className="px-4 py-3 text-slate-700 text-sm">
                  <span className="inline-flex items-center gap-1">
                    {[s.origin_city, s.origin_country].filter(Boolean).join(', ') || '—'}
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    {[s.destination_city, s.destination_country].filter(Boolean).join(', ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700 text-sm">{t(`shipment_mode.${s.mode}`)}</td>
                <td className="px-4 py-3"><ShipmentStatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                  {new Date(s.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
