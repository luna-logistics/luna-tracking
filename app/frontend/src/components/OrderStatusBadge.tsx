import { useTranslation } from 'react-i18next';
import type { OrderStatus } from '@/lib/orders';
import { cn } from '@/lib/utils';

const STYLES: Record<OrderStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-900 ring-amber-300',
  paid:            'bg-blue-100 text-blue-900 ring-blue-300',
  purchasing:      'bg-indigo-100 text-indigo-900 ring-indigo-300',
  purchased:       'bg-purple-100 text-purple-900 ring-purple-300',
  shipped:         'bg-luna-cyan/20 text-luna-navy ring-luna-cyan',
  delivered:       'bg-green-100 text-green-900 ring-green-300',
  cancelled:       'bg-slate-100 text-slate-600 ring-slate-300',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1', STYLES[status])}>
      {t(`admin.order_status_${status}`)}
    </span>
  );
}
