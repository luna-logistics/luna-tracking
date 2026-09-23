/**
 * Tracking lookup — real implementation.
 *
 * Routes on the shape of the code:
 *   - UUID (Luna native, opt-in per shipment) →
 *       /api/v1/tracking/:token (backed by get_public_shipment RPC)
 *   - 4-32 char alphanum (legacy FileMaker code, e.g. 2DDXCPG6PXP8) →
 *       /api/v1/legacy-tracking/:code (Edge Function proxies to
 *       FileMaker Server with the server-side password, parses the
 *       French libelle strings into structured events, closes the
 *       session)
 *
 * The page (Tracking.tsx) consumes the same return shape for both
 * paths so a customer never sees a seam.
 */

const API_BASE = 'https://zlpzajjfzezjildvchoz.functions.supabase.co/api-v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^[A-Za-z0-9]{4,32}$/;

export type TrackingPosition = {
  numeroColis: string;
  libelle: string;
  date?: string;
  lieu?: string;
  poids?: number;
  /** Legacy only: the bridge's parse of `libelle` (additive, optional). */
  kind?: 'picked_up' | 'in_transit' | 'delivered' | 'note';
  originCity?: string | null;
  destinationCity?: string | null;
};

/** Native shipments only: the public fields the API already returns, kept
 *  for the result view (map, status, details). Optional — older consumers
 *  keep reading `positions`. */
export type TrackingShipment = {
  status: string | null;
  mode: string | null;
  carrier_name: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_country: string | null;
  events: Array<{ kind: string; to_status: string | null; created_at: string }>;
  reference?: string | null;
  tracking_number?: string | null;
};

/** get_public_shipment payload (the ONLY data either entry point gets: the
 *  /suivi lookup via /api-v1/tracking/:token and the shared link page, both
 *  gated by the same token + tracking_enabled rule in that RPC). */
export type PublicShipmentPayload = {
  reference?: string | null;
  status?: string | null;
  mode?: string | null;
  carrier_name?: string | null;
  tracking_number?: string | null;
  origin_city?: string | null;
  origin_country?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  events?: Array<{ kind: string; to_status: string | null; created_at: string }>;
};

/** One mapping from that payload to the result view's input, shared by both
 *  entry points (like lib/pricing/surfaces for the price surfaces). The
 *  estimated delivery date is deliberately NOT carried: not shown for now. */
export function shipmentFromPublicPayload(d: PublicShipmentPayload): TrackingShipment {
  return {
    status: d.status ?? null,
    mode: d.mode ?? null,
    carrier_name: d.carrier_name ?? null,
    origin_city: d.origin_city ?? null,
    origin_country: d.origin_country ?? null,
    destination_city: d.destination_city ?? null,
    destination_country: d.destination_country ?? null,
    events: d.events ?? [],
    reference: d.reference ?? null,
    tracking_number: d.tracking_number ?? null,
  };
}

export type TrackingResult =
  | { status: 'ok'; positions: TrackingPosition[]; source: 'legacy' | 'luna'; shipment?: TrackingShipment }
  | { status: 'not_found'; message: string }
  | { status: 'unavailable'; message: string };

export async function fetchTrackingStatus(
  password: string,
  locale: 'fr' | 'en' = 'fr'
): Promise<TrackingResult> {
  const code = password.trim();

  if (UUID_RE.test(code)) return fetchLunaNativeTracking(code, locale);
  if (LEGACY_RE.test(code)) return fetchLegacyTracking(code, locale);

  return {
    status: 'not_found',
    message: locale === 'en'
      ? 'That tracking number does not look valid. Please copy it exactly as it appears on your shipping slip.'
      : "Ce numéro de suivi ne semble pas valide. Copiez-le exactement tel qu'il figure sur votre bordereau.",
  };
}

async function fetchLegacyTracking(code: string, locale: 'fr' | 'en'): Promise<TrackingResult> {
  try {
    const res = await fetch(`${API_BASE}/legacy-tracking/${encodeURIComponent(code)}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.status === 404) return { status: 'not_found', message: notFoundMsg(locale) };
    if (!res.ok) return { status: 'unavailable', message: unavailableMsg(locale) };
    const body = await res.json() as {
      data?: {
        positions?: Array<{ numero_colis: string; libelle: string }>;
        events?: Array<{
          occurred_at: string | null;
          kind?: TrackingPosition['kind'];
          origin_city?: string | null;
          destination_city?: string | null;
        }>;
      };
    };
    const positions = body.data?.positions ?? [];
    if (positions.length === 0) return { status: 'not_found', message: notFoundMsg(locale) };

    return {
      status: 'ok',
      source: 'legacy',
      positions: positions.map((p, i) => ({
        numeroColis: p.numero_colis,
        libelle: p.libelle,
        date: body.data?.events?.[i]?.occurred_at ?? undefined,
        kind: body.data?.events?.[i]?.kind,
        originCity: body.data?.events?.[i]?.origin_city ?? null,
        destinationCity: body.data?.events?.[i]?.destination_city ?? null,
      })),
    };
  } catch {
    return { status: 'unavailable', message: unavailableMsg(locale) };
  }
}

async function fetchLunaNativeTracking(token: string, locale: 'fr' | 'en'): Promise<TrackingResult> {
  try {
    const res = await fetch(`${API_BASE}/tracking/${encodeURIComponent(token)}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.status === 404) return { status: 'not_found', message: notFoundMsg(locale) };
    if (!res.ok) return { status: 'unavailable', message: unavailableMsg(locale) };
    const body = await res.json() as { data?: PublicShipmentPayload };
    const events = body.data?.events ?? [];
    if (events.length === 0) return { status: 'not_found', message: notFoundMsg(locale) };

    const label = (e: { kind: string; to_status: string | null }): string => {
      if (e.kind === 'created')       return locale === 'en' ? 'Shipment registered' : 'Expédition enregistrée';
      if (e.kind === 'status_change') return (locale === 'en' ? 'Status: ' : 'Statut : ') + (e.to_status ?? '—');
      return e.kind;
    };
    return {
      status: 'ok',
      source: 'luna',
      shipment: shipmentFromPublicPayload(body.data ?? {}),
      positions: events.map((e) => ({
        numeroColis: body.data?.reference ?? '',
        libelle: label(e),
        date: e.created_at,
      })),
    };
  } catch {
    return { status: 'unavailable', message: unavailableMsg(locale) };
  }
}

function notFoundMsg(locale: 'fr' | 'en'): string {
  return locale === 'en'
    ? 'No shipment matches that tracking number. Double-check the spelling or contact us.'
    : "Aucune expédition ne correspond à ce numéro de suivi. Vérifiez l'orthographe ou contactez-nous.";
}
function unavailableMsg(locale: 'fr' | 'en'): string {
  return locale === 'en'
    ? 'Tracking is temporarily unavailable. Try again in a moment or email us with your tracking number.'
    : "Le suivi est temporairement indisponible. Réessayez dans un instant ou contactez-nous avec votre numéro de suivi.";
}
