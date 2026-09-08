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
};

export type TrackingResult =
  | { status: 'ok'; positions: TrackingPosition[]; source: 'legacy' | 'luna' }
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
      ? 'That tracking code does not look valid. Please copy it exactly as it appears on your shipping slip.'
      : "Ce mot de passe ne semble pas valide. Copiez-le exactement tel qu'il figure sur votre bordereau.",
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
        events?: Array<{ occurred_at: string | null }>;
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
    const body = await res.json() as {
      data?: {
        reference?: string;
        status?: string;
        events?: Array<{ kind: string; to_status: string | null; created_at: string }>;
      };
    };
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
    ? 'No shipment matches that tracking code. Double-check the spelling or contact us.'
    : "Aucune expédition ne correspond à ce mot de passe. Vérifiez l'orthographe ou contactez-nous.";
}
function unavailableMsg(locale: 'fr' | 'en'): string {
  return locale === 'en'
    ? 'Tracking is temporarily unavailable. Try again in a moment or email us with your code.'
    : "Le suivi est temporairement indisponible. Réessayez dans un instant ou contactez-nous avec votre code.";
}
