import { supabase } from '@/lib/supabase';
import type { PricingConfig } from './engine';
import { fallbackPricing, resolvePricingConfig, type ResolvedPricing } from './fallback';

/**
 * The ONE place the site reads the pricing grid (pricing_config, active row —
 * RLS lets the public read only that row). Every surface that shows a price
 * (/calculateur, /tarifs, the pro "Suggérer un tarif", the /admin/tarifs
 * simulator) goes through here, directly or via hooks/usePricingConfig.
 *
 * It never fails: a network error, a missing table, no active row or an invalid
 * value all resolve to the fallback grid (lib/pricing/fallback.ts). Results are
 * cached for a few minutes so moving between pages doesn't refetch; an
 * "unreachable" result is not cached, so the next page retries.
 */
const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;

interface ActiveRow { id: string; config: unknown; effective_from: string | null }
type RowFetch = { ok: true; row: ActiveRow | null } | { ok: false };

async function fetchActiveRow(): Promise<RowFetch> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('pricing_config')
      .select('id, config, effective_from')
      .eq('is_active', true)
      .abortSignal(ctrl.signal)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, row: (data as ActiveRow | null) ?? null };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** effective_from is a column, not part of the jsonb; surface it for the UI. */
function withEffectiveFrom(row: ActiveRow): unknown {
  const c = row.config;
  if (!row.effective_from || c === null || typeof c !== 'object' || Array.isArray(c)) return c;
  return { ...(c as Record<string, unknown>), effectiveFrom: row.effective_from };
}

function resolveFetch(f: RowFetch): ResolvedPricing {
  if (!f.ok) return fallbackPricing('unreachable');
  if (!f.row) return fallbackPricing('missing');
  return resolvePricingConfig(withEffectiveFrom(f.row));
}

let cache: { at: number; promise: Promise<ResolvedPricing>; value: ResolvedPricing | null } | null = null;

/** The grid to price with. Resolves (never rejects) to the database grid or the fallback. */
export function loadPricingConfig(): Promise<ResolvedPricing> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
  const entry: NonNullable<typeof cache> = { at: Date.now(), value: null, promise: Promise.resolve(fallbackPricing('unreachable')) };
  entry.promise = fetchActiveRow()
    .then(resolveFetch)
    .catch(() => fallbackPricing('unreachable'))
    .then((r) => {
      entry.value = r;
      if (r.source === 'fallback') {
        console.warn(`[pricing] fallback grid in use (${r.reason})`);
        if (r.reason === 'unreachable' && cache === entry) cache = null;
      }
      return r;
    });
  cache = entry;
  return entry.promise;
}

/** The cached grid when it is already loaded (lets a page render prices at once). */
export function peekPricingConfig(): ResolvedPricing | null {
  return cache && Date.now() - cache.at < CACHE_TTL_MS ? cache.value : null;
}

export function invalidatePricingConfig(): void {
  cache = null;
}

/** What /admin/tarifs needs: the stored row (the base of the diff and the
 *  concurrency token of the publish) and the grid the site prices with now. */
export interface PricingAdminState {
  reachable: boolean;
  activeId: string | null;
  /** The active document exactly as stored (null when there is none). */
  stored: unknown;
  effectiveFrom: string | null;
  live: ResolvedPricing;
}

export async function fetchPricingAdminState(): Promise<PricingAdminState> {
  const f = await fetchActiveRow();
  const live = resolveFetch(f);
  if (!f.ok) return { reachable: false, activeId: null, stored: null, effectiveFrom: null, live };
  return {
    reachable: true,
    activeId: f.row?.id ?? null,
    stored: f.row?.config ?? null,
    effectiveFrom: f.row?.effective_from ?? null,
    live,
  };
}

export type PublishAction = 'update' | 'restore_defaults';

/**
 * Publish a new grid through save_pricing_settings(): the database checks the
 * admin's permission, validates the grid, refuses a stale form
 * ('pricing_config_stale'), keeps the previous version and writes the history —
 * in one transaction. Throws the PostgREST error on failure.
 */
export async function publishPricingSettings(p: {
  config: PricingConfig;
  effectiveFrom: string | null;
  action: PublishAction;
  expectedActiveId: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('save_pricing_settings', {
    p_config: { ...p.config, effectiveFrom: p.effectiveFrom },
    p_effective_from: p.effectiveFrom,
    p_action: p.action,
    p_expected_active_id: p.expectedActiveId,
  });
  if (error) throw error;
  invalidatePricingConfig();
}

export interface PricingHistoryRow {
  id: number;
  config_id: string | null;
  action: 'update' | 'restore_defaults' | 'backfill';
  changed_by_email: string | null;
  changed_at: string;
  path: string;
  old_value: unknown;
  new_value: unknown;
}

/** Change history, newest first (admins with the 'content' section only — RLS).
 *  null when it can't be read. */
export async function fetchPricingHistory(limit = 500): Promise<PricingHistoryRow[] | null> {
  const { data, error } = await supabase
    .from('pricing_config_history')
    .select('id, config_id, action, changed_by_email, changed_at, path, old_value, new_value')
    .order('changed_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) return null;
  return (data ?? []) as PricingHistoryRow[];
}
