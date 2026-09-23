import type { TrackingResult, TrackingShipment } from './tracking';

/**
 * Tracking result → the data the "Suivi Luna v2" result view draws (status,
 * timestamped steps, mode, route). Pure, and it never invents anything: a
 * step without a recorded time is shown as passed / "not recorded", an unknown
 * mode, carrier or destination is simply left out. Returns null when a result
 * cannot be read confidently — the page then keeps the plain list it always
 * showed. One builder for every entry point (/suivi search, shared link).
 *
 * Sources (unchanged, read-only here):
 *   • legacy FileMaker codes → positions + the bridge's libelle parse
 *     (picked_up / in_transit / delivered). Their times carry NO timezone;
 *     they are read as LEGACY_SOURCE_TZ wall-clock time (see below);
 *   • native shipments → shipment.status + status_change events
 *     (shipment_events.created_at is timestamptz → exact instants).
 * Every time is kept as a UTC instant and shown in the viewer's timezone.
 */

export type TrackStep = 'draft' | 'confirmed' | 'pickup' | 'in_transit' | 'customs' | 'delivered';
export const TRACK_ORDER: TrackStep[] = ['draft', 'confirmed', 'pickup', 'in_transit', 'customs', 'delivered'];

/** Destinations the illustrated map has a drawn position + route for. */
export type MapDest = 'fih' | 'gom';

export type TrackingRoute = {
  /** Congo-side endpoint: Kinshasa (sea via Antwerp → Matadi, or air) or Goma (air only). */
  dest: MapDest;
  /** true = Congo → Belgium (import): same line, travelled the other way. */
  reverse: boolean;
};

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
  /** First time each step was reached — UTC ISO instants. */
  times: Partial<Record<TrackStep | 'cancelled', string>>;
  updatedAt: string | null;
  from: string | null;
  to: string | null;
  /** Destination city alone (headline / rail), null when not recorded. */
  toCity: string | null;
  fromCity: string | null;
  /** Map route, or null when the shipment's real route isn't drawn → no map. */
  route: TrackingRoute | null;
};

/**
 * [USER DECISION] FileMaker's libelle times ("… le 19-08-2026 à 22:56:43")
 * carry no timezone and nothing in the bridge or the data says which clock
 * wrote them. Read as Brussels wall time (head office) until confirmed —
 * change this one constant if they turn out to be Kinshasa (Africa/Kinshasa)
 * or Goma (Africa/Lubumbashi) time.
 */
export const LEGACY_SOURCE_TZ = 'Europe/Brussels';

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
const rank = (s: TrackStep) => TRACK_ORDER.indexOf(s);
const BRU = /^(bruxelles|brussels|brussel|bxl)$/i;
const ANR = /^(anvers|antwerpen|antwerp)$/i;
const FIH = /^kinshasa$/i;
const GOM = /^goma$/i;
/** IATA codes seen in FileMaker parcel labels ("BRU202600001FIH 1/1"). */
const IATA_CITY: Record<string, string> = { BRU: 'Bruxelles', FIH: 'Kinshasa', GOM: 'Goma' };

const LEGACY_KIND: Record<string, TrackStep> = { picked_up: 'pickup', in_transit: 'in_transit', delivered: 'delivered' };

/** Which drawn route (if any) a real origin → destination pair uses. Sea only
 *  ever runs Antwerp → Matadi → Kinshasa; Goma is an air corridor. Anything
 *  else → null (the page shows the status panel without a map, never a
 *  wrongly-labelled one). */
export function routeFor(mode: 'air' | 'sea' | null, fromCity: string | null, toCity: string | null): TrackingRoute | null {
  const be = (c: string | null) => !!c && (BRU.test(c) || ANR.test(c));
  const cd = (c: string | null): MapDest | null => (c && FIH.test(c) ? 'fih' : c && GOM.test(c) ? 'gom' : null);
  const out = be(fromCity) ? cd(toCity) : null;
  const back = be(toCity) ? cd(fromCity) : null;
  const dest = out ?? back;
  if (!dest) return null;
  if (mode === 'sea' && dest !== 'fih') return null;
  return { dest, reverse: !out };
}

export function buildTrackingView(result: TrackingResult, typedNumber: string): TrackingView | null {
  if (result.status !== 'ok') return null;
  return result.source === 'luna' && result.shipment
    ? nativeView(result.shipment, typedNumber)
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
    const at = p.date ? wallTimeToUtc(p.date, LEGACY_SOURCE_TZ) : null;
    if (at && (!times[step] || at < times[step]!)) times[step] = at;
    from = from ?? (p.originCity ? titleCase(p.originCity) : null);
    to = to ?? (p.destinationCity ? titleCase(p.destinationCity) : null);
  }
  if (byParcel.size === 0) return null;
  const parcels = [...byParcel.keys()];
  // Fallback only when the libelles never named a city: the parcel label's
  // IATA codes (e.g. BRU…FIH, BRU…GOM) — consistent across all parcels.
  const iata = parcels.map((c) => /^([A-Z]{3})\d+([A-Z]{3})\b/.exec(c)).filter(Boolean) as RegExpExecArray[];
  const same = (i: 1 | 2) => (iata.length === parcels.length && new Set(iata.map((m) => m[i])).size === 1 ? IATA_CITY[iata[0][i]] ?? null : null);
  from = from ?? same(1);
  to = to ?? same(2);
  // Several parcels: never claim more progress than the slowest one.
  const status = [...byParcel.values()].reduce((a, b) => (rank(b) < rank(a) ? b : a));
  return {
    number: typed.trim().toUpperCase(),
    parcel: parcels.length === 1 ? parcels[0] : null,
    status,
    reachedBeforeCancel: null,
    mode: null,
    carrier: null,
    carrierRef: null,
    times,
    updatedAt: latest(Object.values(times)),
    from, to, fromCity: from, toCity: to,
    route: routeFor(null, from, to),
  };
}

function nativeView(s: TrackingShipment, typed: string): TrackingView | null {
  const status = s.status as TrackingView['status'] | null;
  if (!status || !(TRACK_ORDER as string[]).concat('cancelled').includes(status)) return null;
  const times: TrackingView['times'] = {};
  let reachedBeforeCancel: TrackStep | null = null;
  for (const e of [...s.events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (e.kind !== 'status_change' || !e.to_status) continue;
    const st = e.to_status as TrackStep | 'cancelled';
    const at = new Date(e.created_at);
    if (!times[st] && !Number.isNaN(at.getTime())) times[st] = at.toISOString();
    if (st !== 'cancelled' && (TRACK_ORDER as string[]).includes(st)) reachedBeforeCancel = st as TrackStep;
  }
  const oc = (s.origin_country ?? '').toUpperCase();
  const dc = (s.destination_country ?? '').toUpperCase();
  const oCity = s.origin_city?.trim() || null;
  const dCity = s.destination_city?.trim() || null;
  const mode = s.mode === 'air' || s.mode === 'sea' ? s.mode : null;
  const place = (city: string | null, country: string) => [city, country].filter(Boolean).join(', ') || null;
  // The map needs both real cities AND the Belgium ⇄ DR Congo country pair.
  const pairOk = (oc === 'BE' && dc === 'CD') || (oc === 'CD' && dc === 'BE');
  return {
    // The shipment reference the shipper knows, rather than the link token.
    number: s.reference?.trim() || typed.trim(),
    parcel: null,
    status,
    reachedBeforeCancel: status === 'cancelled' ? reachedBeforeCancel : null,
    mode,
    carrier: s.carrier_name?.trim() || null,
    carrierRef: s.tracking_number?.trim() || null,
    times,
    updatedAt: latest(s.events.map((e) => { const d = new Date(e.created_at); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); })),
    from: place(oCity, oc),
    to: place(dCity, dc),
    fromCity: oCity,
    toCity: dCity,
    route: pairOk ? routeFor(mode, oCity, dCity) : null,
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

/** Offset (ms) of `tz` from UTC at instant `ms`. */
function tzOffsetMs(ms: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** "2026-08-19T22:56:43" read as wall-clock time in `tz` → UTC ISO instant. */
export function wallTimeToUtc(wall: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(wall);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let ms = guess - tzOffsetMs(guess, tz);
  ms = guess - tzOffsetMs(ms, tz); // settle across a DST switch
  return new Date(ms).toISOString();
}

/** The viewer's own timezone (browser setting). */
export function viewerTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/** UTC instant → "lun. 20 juil. à 18:04" / "Mon 20 Jul, 18:04" in `tz`. */
export function formatWhen(iso: string | null | undefined, lang: 'fr' | 'en', at: string, tz: string = viewerTimeZone()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const loc = lang === 'en' ? 'en-GB' : 'fr-BE';
  const date = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(d).replace(',', '');
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d);
  return `${date}${at}${time}`;
}

/** "Brussels", "Kinshasa", "New York" — the city part of an IANA zone. */
export function timeZoneCity(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}
