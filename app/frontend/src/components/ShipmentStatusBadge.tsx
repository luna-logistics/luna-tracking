import { useTranslation } from 'react-i18next';
import { SHIPMENT_STATUS_STYLES, type ShipmentStatus } from '@/lib/shipment-status';
import { cn } from '@/lib/utils';

/**
 * Small pill for the shipment status. Colour + label come from the
 * single-source-of-truth maps in shipment-status.ts and locale files.
 */
export function ShipmentStatusBadge({ status, className }: { status: ShipmentStatus; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
      SHIPMENT_STATUS_STYLES[status],
      className,
    )}>
      {t(`shipment_status.${status}`)}
    </span>
  );
}
