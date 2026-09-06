/**
 * Single source of truth for shipment lifecycle statuses.
 *
 * Kept OUT of shipments.ts so `<StatusBadge>` and any read-only view
 * that only needs labels/colours can import without pulling the whole
 * CRUD surface.
 *
 * DB CHECK mirrors this list (see 20260907-ish shipments_pro migration).
 * When adding a new status: update the migration first, then this file,
 * then the labels + Tailwind classes.
 */

export const SHIPMENT_STATUSES = [
  'draft',
  'quoted',
  'booked',
  'received',
  'in_transit',
  'customs',
  'delivered',
  'cancelled',
] as const;

export type ShipmentStatus = typeof SHIPMENT_STATUSES[number];

/** Ordered pipeline for the progress indicator on the detail page.
 *  `cancelled` is an off-ramp — deliberately excluded from the linear
 *  progress rail. */
export const SHIPMENT_PIPELINE: ShipmentStatus[] = [
  'draft', 'quoted', 'booked', 'received', 'in_transit', 'customs', 'delivered',
];

/** Tailwind classes per status — Bg + text, tuned for a small pill.
 *  Every colour is a Tailwind default so no `tailwind.config.ts` change
 *  is needed when a new status is added. */
export const SHIPMENT_STATUS_STYLES: Record<ShipmentStatus, string> = {
  draft:      'bg-slate-100 text-slate-700',
  quoted:     'bg-amber-100 text-amber-800',
  booked:     'bg-indigo-100 text-indigo-800',
  received:   'bg-blue-100 text-blue-800',
  in_transit: 'bg-cyan-100 text-cyan-800',
  customs:    'bg-purple-100 text-purple-800',
  delivered:  'bg-emerald-100 text-emerald-800',
  cancelled:  'bg-red-100 text-red-800',
};

export const SHIPMENT_DIRECTIONS = ['export', 'import', 'domestic'] as const;
export type ShipmentDirection = typeof SHIPMENT_DIRECTIONS[number];

export const SHIPMENT_MODES = ['air', 'sea', 'road', 'rail', 'multi'] as const;
export type ShipmentMode = typeof SHIPMENT_MODES[number];
