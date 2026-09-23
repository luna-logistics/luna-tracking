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
  'draft',       // not yet confirmed
  'confirmed',   // booking confirmed (was "Réservée")
  'pickup',      // goods being / been collected (was "Prise en charge")
  'in_transit',
  'customs',     // OPTIONAL — only for shipments that go through customs
  'delivered',
  'cancelled',   // exception: reachable from any status except delivered
] as const;
// A quote is NOT a shipment status: quotes live in the Devis menu and become a
// shipment ('confirmed') only when accepted (accept_quote_to_shipment RPC).

export type ShipmentStatus = typeof SHIPMENT_STATUSES[number];

/** Linear lifecycle for the progress rail. `customs` is inserted only when
 *  the shipment actually goes through customs (see pipelineFor); `cancelled`
 *  is an off-ramp, never a step. */
export const SHIPMENT_PIPELINE: ShipmentStatus[] = [
  'draft', 'confirmed', 'pickup', 'in_transit', 'delivered',
];

/** Rail for one shipment: adds the customs step when it is the current
 *  status or appears in the shipment's history. */
export function pipelineFor(status: ShipmentStatus, historyStatuses: (ShipmentStatus | null)[] = []): ShipmentStatus[] {
  const withCustoms = status === 'customs' || historyStatuses.includes('customs');
  if (!withCustoms) return SHIPMENT_PIPELINE;
  return ['draft', 'confirmed', 'pickup', 'in_transit', 'customs', 'delivered'];
}

/** Statuses a user may pick from `current`: everything, except that a
 *  delivered shipment can no longer be cancelled (the DB enforces it too). */
export function selectableStatuses(current: ShipmentStatus): ShipmentStatus[] {
  return SHIPMENT_STATUSES.filter((s) => !(current === 'delivered' && s === 'cancelled'));
}

/** Tailwind classes per status — Bg + text, tuned for a small pill.
 *  Every colour is a Tailwind default so no `tailwind.config.ts` change
 *  is needed when a new status is added. */
export const SHIPMENT_STATUS_STYLES: Record<ShipmentStatus, string> = {
  draft:      'bg-slate-100 text-slate-700',
  confirmed:  'bg-indigo-100 text-indigo-800',
  pickup:     'bg-blue-100 text-blue-800',
  in_transit: 'bg-cyan-100 text-cyan-800',
  customs:    'bg-purple-100 text-purple-800',
  delivered:  'bg-emerald-100 text-emerald-800',
  cancelled:  'bg-red-100 text-red-800',
};

export const SHIPMENT_DIRECTIONS = ['export', 'import', 'domestic'] as const;
export type ShipmentDirection = typeof SHIPMENT_DIRECTIONS[number];

/** Modes Luna actually operates. Rail / multimodal were removed on
 *  2026-09-23 (DB CHECKs on shipments, quotes, rate_rules match). */
export const SHIPMENT_MODES = ['air', 'sea', 'road'] as const;
export type ShipmentMode = typeof SHIPMENT_MODES[number];
