/**
 * Pull a human-readable message out of anything a `catch` block might see.
 *
 * Supabase-js throws `PostgrestError` — a plain object shaped
 * `{ message, details, hint, code }` — which is NOT `instanceof Error`.
 * The old idiom `err instanceof Error ? err.message : fallback` therefore
 * discarded every DB error and toasted the generic "Erreur" string, so
 * "null value in column X violates not-null constraint" only surfaced in
 * the console. This helper covers both shapes.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  if (typeof err === 'string' && err) return err;
  return fallback;
}
