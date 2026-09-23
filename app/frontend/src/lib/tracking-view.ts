import type { TrackingResult } from './tracking';

/**
 * Tracking result → the data the "Suivi Luna v2" result view draws (status,
 * timestamped steps, mode, route). Pure, and it never invents anything: a
 * step without a recorded time is shown as passed / "not recorded", an unknown
 * mode or carrier is simply left out. Returns null when a result cannot be
 * read confidently — the page then keeps the plain list it always showed.
 *
 * Sources (unchanged, read-only here):
 *   • legacy FileMaker codes → positions + the bridge's libelle parse
 *     (picked_up / in_transit / delivered, local Brussels wall time);
 *   • native shipments → shipment.status + status_change events (UTC).
 */

export type TrackStep = 'draft' | 'confirmed' | 'pickup' | 'in_transit' | 'customs' | 'delivered';
export const TRACK_ORDER: TrackStep[] = ['draft', 'confirmed', 'pickup', 'in_transit', 'customs', 'delivered'];

export type TrackingView = {
  number: string;
  /** Legacy parcel label, e.g. "BRU202600001FIH 1/1" (kept, not in the design). */
  parcel: string | null;
  status: TrackStep | 'cancelled';
  /** Last lifecycle step reached before a cancellation. */
  reachedBeforeCancel: TrackStep | null;
  mode: 'air' | 'sea' | null;
  carrier: string | null;
  /** Carrier's own tracking number (native, when the shipper filled it). */
  carrierRef: string | null;
  /** Estimated delivery DATE (native, only while not delivered/cancelled). */
  eta: string | null;
  /** First time each step was reached. Legacy: Brussels wall time; native: UTC ISO. */
  times: Partial<Record<TrackStep | 'cancelled', string>>;
  timesAreUtc: boolean;
  updatedAt: string | null;
  from: string | null;
  to: string | null;
  /** The drawn Brussels ⇄ Kinshasa corridor applies (else: no map). */
  corridor: 'be-cd' | 'cd-be' | null;
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
const rank = (s: TrackStep) => TRACK_ORDER.indexOf(s);
const BRU = /^(bruxelles|brussels|brussel|bxl)$/i;
const FIH = /^kinshasa$/i;

const LEGACY_KIND: Record<string, TrackStep> = { picked_up: 'pickup', in_transit: 'in_transit', delivered: 'delivered' };

export function buildTrackingView(result: TrackingResult, typedNumber: string): TrackingView | null {
  if (result.status !== 'ok') return null;
  return result.source === 'luna' && result.shipment
    ? nativeView(result, typedNumber)
    : legacyView(result, typedNumber);
}

function legacyView(result: Extract<TrackingResult, { status: 'ok' }>, typed: string): TrackingView | null {
  const byParcel = new Map<string, TrackStep>();
  const times: TrackingView['times'] = {};
  let from: string | null = null;
  let to: string | null = null;
  for (const p of result.positions) {
    const step = p.kind ? LEGACY_KIND[p.kind] : undefined;
    if (!step) continue;
    const prev = byParcel.get(p.numeroColis);
    if (!prev || rank(step) > rank(prev)) byParcel.set(p.numeroColis, step);
    if (p.date && (!times[step] || p.date < times[step]!)) times[step] = p.date;
    from = from ?? (p.originCity ? titleCase(p.originCity) : null);
    to = to ?? (p.destinationCity ? titleCase(p.destinationCity) : null);
  }
  if (byParcel.size === 0) return null;
  // Several parcels: never claim more progress than the slowest one.
  const status = [...byParcel.values()].reduce((a, b) => (rank(b) < rank(a) ? b : a));
  const parcels = [...byParcel.keys()];
  const corridor = (!from || BRU.test(from)) && (!to || FIH.test(to)) ? 'be-cd' : null;
  return {
    number: typed.trim().toUpperCase(),
    parcel: parcels.length === 1 ? parcels[0] : null,
    status,
    reachedBeforeCancel: null,
    mode: null,
    carrier: null,
    carrierRef: null,
    eta: null,
    times,
    timesAreUtc: false,
    updatedAt: latest(Object.values(times)),
    from: from ?? 'Bruxelles',
    to: to ?? 'Kinshasa',
    corridor,
  };
}

function nativeView(result: Extract<TrackingResult, { status: 'ok' }>, typed: string): TrackingView | null {
  const s = result.shipment!;
  const status = s.status as TrackingView['status'] | null;
  if (!status || !(TRACK_ORDER as string[]).concat('cancelled').includes(status)) return null;
  const times: TrackingView['times'] = {};
  let reachedBeforeCancel: TrackStep | null = null;
  for (const e of [...s.events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.kind !== 'status_change' || !e.to_status) continue;
    const st = e.to_status as TrackStep | 'cancelled';
    if (!times[st]) times[st] = e.created_at;
    if (st !== 'cancelled' && (TRACK_ORDER as string[]).includes(st)) reachedBeforeCancel = st as TrackStep;
  }
  const oc = (s.origin_country ?? '').toUpperCase();
  const dc = (s.destination_country ?? '').toUpperCase();
  const oCity = s.origin_city?.trim() || null;
  const dCity = s.destination_city?.trim() || null;
  const corridor =
    oc === 'BE' && dc === 'CD' && (!dCity || FIH.test(dCity)) ? 'be-cd'
    : oc === 'CD' && dc === 'BE' && (!oCity || FIH.test(oCity)) ? 'cd-be'
    : null;
  const place = (city: string | null, country: string) => [city, country].filter(Boolean).join(', ') || null;
  return {
    // The shipment reference the shipper knows, rather than the link token.
    number: s.reference?.trim() || typed.trim(),
    parcel: null,
    status,
    reachedBeforeCancel: status === 'cancelled' ? reachedBeforeCancel : null,
    mode: s.mode === 'air' || s.mode === 'sea' ? s.mode : null,
    carrier: s.carrier_name?.trim() || null,
    carrierRef: s.tracking_number?.trim() || null,
    eta: status !== 'delivered' && status !== 'cancelled' ? (s.estimated_delivery ?? null) : null,
    times,
    timesAreUtc: true,
    updatedAt: latest(s.events.map((e) => e.created_at)),
    from: place(oCity, oc),
    to: place(dCity, dc),
    corridor,
  };
}

function latest(values: (string | undefined)[]): string | null {
  const v = values.filter((x): x is string => !!x).sort();
  return v.length ? v[v.length - 1] : null;
}

/** Map position along the route per status (design: a fixed share of the
 *  route per status and mode — not GPS). */
export function routeFraction(status: TrackStep, mode: 'air' | 'sea' | null, matadiFrac: number): number {
  const sea = { draft: 0, confirmed: 0, pickup: 0.01, in_transit: 0.46, customs: matadiFrac, delivered: 1 };
  const air = { draft: 0, confirmed: 0, pickup: 0.02, in_transit: 0.5, customs: 0.96, delivered: 1 };
  return (mode === 'sea' ? sea : air)[status];
}

/** "2026-09-09T06:45…" → wall-clock parts in Brussels (native UTC instants are
 *  converted; legacy strings already are Brussels time). */
export function brusselsParts(value: string, isUtc: boolean): { y: number; mo: number; d: number; hh: string; mi: string } | null {
  if (isUtc) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(dt).map((p) => [p.type, p.value]));
    return { y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day), hh: parts.hour, mi: parts.minute };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), hh: m[4] ?? '00', mi: m[5] ?? '00' };
}
