import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { fetchAllOrders, updateOrderStatus, nextStatus, type Order } from '@/lib/orders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { fetchDestinationCities, type DestinationCity } from '@/lib/cities';

export default function AdminOrders() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cities, setCities] = useState<DestinationCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const reload = async () => {
    setLoading(true);
    const [o, c] = await Promise.all([fetchAllOrders(), fetchDestinationCities()]);
    setOrders(o); setCities(c); setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name ?? '—';

  const advance = async (o: Order) => {
    const next = nextStatus(o.status);
    if (!next) return;
    try { await updateOrderStatus(o.id, next); toast.success('OK'); await reload(); }
    catch { toast.error(t('common.error_generic')); }
  };

  const cancel = async (o: Order) => {
    if (!confirm(t('admin.orders_cancel_confirm'))) return;
    try { await updateOrderStatus(o.id, 'cancelled'); toast.success('OK'); await reload(); }
    catch { toast.error(t('common.error_generic')); }
  };

  const toggle = (id: string) => setExpanded((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  return (
    <>
      <SEO title={t('admin.orders_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.orders_title')}</h1>
      <p className="mt-2 text-slate-600">{t('admin.orders_intro')}</p>

      {loading ? (
        <div className="mt-6 py-10 text-center text-slate-500">{t('common.loading')}</div>
      ) : orders.length === 0 ? (
        <div className="mt-6 py-10 text-center text-slate-500 rounded-2xl border border-slate-200 bg-white">
          {t('admin.orders_no_orders')}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.orders_col_date')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.orders_col_recipient')}</th>
                <th className="text-right px-4 py-3 font-semibold">{t('admin.orders_col_total')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.orders_col_status')}</th>
                <th className="text-right px-4 py-3 font-semibold">{t('admin.orders_col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const next = nextStatus(o.status);
                const open = expanded.has(o.id);
                return (
                  <>
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {new Date(o.created_at).toLocaleDateString('fr-BE')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-luna-navy">{o.recipient_name}</div>
                        <div className="text-xs text-slate-500">{cityName(o.recipient_city_id)} · {o.recipient_phone}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-luna-navy">{Number(o.total).toFixed(2)} €</td>
                      <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        <Button size="sm" variant="outline" onClick={() => toggle(o.id)}>
                          {t('admin.orders_view_items')}
                        </Button>
                        {next && (
                          <Button size="sm" variant="navy" onClick={() => advance(o)}>
                            → {t(`admin.order_status_${next}`)}
                          </Button>
                        )}
                        {o.status !== 'cancelled' && o.status !== 'delivered' && (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => cancel(o)}>
                            {t('admin.orders_cancel')}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${o.id}-items`}>
                        <td colSpan={5} className="px-4 py-3 bg-slate-50/50">
                          <ul className="text-xs text-slate-700 space-y-1">
                            {o.items.map((it) => (
                              <li key={it.product_id}>
                                {it.quantity}× {it.name} — {(it.unit_price * it.quantity).toFixed(2)} €
                              </li>
                            ))}
                          </ul>
                          {o.recipient_address && (
                            <p className="mt-2 text-xs text-slate-600">
                              <strong>{t('shop.checkout_recipient_address')}:</strong> {o.recipient_address}
                            </p>
                          )}
                          {o.notes && (
                            <p className="mt-1 text-xs text-slate-600">
                              <strong>{t('shop.checkout_notes')}:</strong> {o.notes}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
