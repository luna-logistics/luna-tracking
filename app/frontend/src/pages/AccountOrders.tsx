import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { fetchMyOrders, type Order } from '@/lib/orders';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { urlFor } from '@/lib/url/routes';

export default function AccountOrders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyOrders().then((o) => { setOrders(o); setLoading(false); });
  }, []);

  return (
    <>
      <SEO title={t('account_orders.title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('account_orders.title')}</h1>

      {loading ? (
        <div className="mt-6 py-12 text-center text-slate-500">{t('common.loading')}</div>
      ) : orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-luna-navy">{t('account_orders.empty_title')}</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">{t('account_orders.empty_body')}</p>
          <Button asChild variant="navy" className="mt-5">
            <Link to={urlFor('shopAndShip', lang)}>{t('account_orders.empty_cta')}</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('account_orders.col_date')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('account_orders.col_items')}</th>
                <th className="text-right px-4 py-3 font-semibold">{t('account_orders.col_total')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('account_orders.col_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const itemCount = o.items.reduce((s, it) => s + (it.quantity || 0), 0);
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-BE')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-luna-navy">
                        {t('account_orders.items_summary_other', { count: itemCount, defaultValue: `${itemCount} items` })}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1">
                        {o.items.map((it) => `${it.quantity}× ${it.name}`).join(', ')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-luna-navy whitespace-nowrap">
                      {Number(o.total).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
