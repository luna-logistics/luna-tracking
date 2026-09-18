import { supabase } from '@/lib/supabase';
import type { PricingConfig } from './engine';

/**
 * Read the single ACTIVE pricing configuration. RLS lets the public read only the
 * active row. The grid is structured data (jsonb) — the owner edits a rate by
 * updating this row, no deploy. Returns null on any failure: callers must then
 * show a quote-request state, never a guessed price.
 */
export async function fetchActivePricingConfig(): Promise<PricingConfig | null> {
  const { data, error } = await supabase
    .from('pricing_config')
    .select('config, effective_from')
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data || !data.config) return null;
  const config = { ...(data.config as PricingConfig) };
  // effective_from is a column, not part of the jsonb; surface it for the UI.
  if (data.effective_from) config.effectiveFrom = data.effective_from as string;
  return config;
}

export interface PricingConfigRow {
  id: string;
  effective_from: string | null;
  is_active: boolean;
  config: PricingConfig;
  created_at: string;
  updated_at: string;
}

/** Full version history, newest first (admin only — RLS returns just the active
 *  row to the public, all rows to an admin). */
export async function fetchAllPricingConfigs(): Promise<PricingConfigRow[]> {
  const { data, error } = await supabase
    .from('pricing_config')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as PricingConfigRow[];
}

/**
 * Publish a new tariff: writes a NEW active row and deactivates the previous one
 * atomically (see the save_pricing_config RPC), so history is preserved. Throws on
 * failure so the caller can surface it.
 */
export async function savePricingConfig(config: PricingConfig, effectiveFrom: string | null): Promise<void> {
  const toStore = { ...config, effectiveFrom: effectiveFrom || null };
  const { error } = await supabase.rpc('save_pricing_config', {
    p_config: toStore,
    p_effective_from: effectiveFrom || null,
  });
  if (error) throw new Error(error.message);
}
