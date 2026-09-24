import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CreditCard, Info, Loader2, Package } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { fetchMyOrders, type Order } from '@/lib/orders';
import { initiatePayment } from '@/lib/payment';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { urlFor } from '@/lib/url/routes';

export default function AccountOrders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  // Return from Stripe Checkout: ?paiement=ok|annule&commande=<id>. The order
  // turns "paid" only when the webhook lands, which can take a few seconds —
  // so on success we poll briefly instead of showing a stale "pending".
  const returnState = params.get('paiement');
  const returnOrder = params.get('commande');

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const load = async () => {
      const o = await fetchMyOrders();
      if (cancelled) return;
      setOrders(o); setLoading(false);
      const target = o.find((x) => x.id === returnOrder);
      if (returnState === 'ok' && target?.status === 'pending_payment' && tries++ < 10) {
        setTimeout(load, 2000);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [returnState, returnOrder]);

  const dismissReturn = () => { params.delete('paiement'); params.delete('commande'); setParams(params, { replace: true }); };

  const pay = async (o: Order) => {
    setPaying(o.id);
    const res = await initiatePayment(o, lang);
    if (res.status === 'redirect') { window.location.href = res.url; return; }
    toast[res.status === 'deferred' ? 'info' : 'error'](res.message);
    setPaying(null);
  };

  const returned = orders.find((o) => o.id === returnOrder);

  return (
    <>
      <SEO title={t('account_orders.title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('account_orders.title')}</h1>

      {returnState === 'ok' && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            {returned?.status === 'pending_payment'
              ? t('account_orders.payment_confirming')
              : t('account_orders.payment_received')}
          </div>
          <button type="button" onClick={dismissReturn} className="text-emerald-800 underline">{t('common.close')}</button>
        </div>
      )}
      {returnState === 'annule' && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">{t('account_orders.payment_cancelled')}</div>
          <button type="button" onClick={dismissReturn} className="text-amber-800 underline">{t('common.close')}</button>
        </div>
      )}

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
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <OrderStatusBadge status={o.status} />
                        {o.status === 'pending_payment' && (
                          <Button size="sm" variant="navy" onClick={() => pay(o)} disabled={paying !== null}>
                            {paying === o.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              : <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />}
                            {t('account_orders.pay')}
                          </Button>
                        )}
                      </div>
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
