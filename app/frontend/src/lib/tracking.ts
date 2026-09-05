/**
 * Tracking lookup — STUB.
 *
 * A real implementation (FileMaker Data API integration, or a Supabase edge
 * function that proxies to it) will replace `fetchTrackingStatus` without
 * touching the UI, as long as it honours this return shape. That is why the
 * types are exported: the page destructures them.
 *
 * Once the backend lands, `status: 'ok'` becomes the primary path and the
 * page renders the `positions` list; `unavailable` / `not_found` remain the
 * error states.
 */

export type TrackingPosition = {
  numeroColis: string;
  libelle: string;
  /** Optional structured fields — kept optional so a real backend can populate
   *  progressively without breaking older clients. */
  date?: string;
  lieu?: string;
  poids?: number;
};

export type TrackingResult =
  | { status: 'ok'; positions: TrackingPosition[] }
  | { status: 'not_found'; message: string }
  | { status: 'unavailable'; message: string };

/**
 * @param password — the "mot de passe de suivi" the customer received with
 *   their shipping slip. Free-form string.
 * @param locale — 'fr' or 'en'; controls the language of the placeholder
 *   messages when the backend is not wired up yet.
 */
export async function fetchTrackingStatus(
  _password: string,
  locale: 'fr' | 'en' = 'fr'
): Promise<TrackingResult> {
  // Stub — no backend yet. Returns a locale-appropriate "unavailable" message.
  // When the FileMaker Data API integration ships, replace the body with the
  // real fetch call and keep this return-type contract.
  const message =
    locale === 'en'
      ? 'Our online tracking service is not live yet. Email us with your tracking password and we will reply promptly.'
      : "Notre service de suivi en ligne n'est pas encore actif. Contactez-nous avec votre mot de passe de suivi et nous vous répondrons rapidement.";
  return { status: 'unavailable', message };
}
