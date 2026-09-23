import { supabase } from '@/lib/supabase';

export type DashboardType = 'business' | 'individual';

export type DashboardFeature = {
  id: string;
  dashboard: DashboardType;
  feature_key: string;
  enabled: boolean;
  updated_at: string;
};

/**
 * Fetch all feature rows for a dashboard (admin view — needs admin_users membership).
 */
export async function fetchDashboardFeatures(dashboard: DashboardType): Promise<DashboardFeature[]> {
  const { data, error } = await supabase
    .from('dashboard_features')
    .select('id, dashboard, feature_key, enabled, updated_at')
    .eq('dashboard', dashboard)
    .order('feature_key');
  if (error) { console.warn('[dashboard-features] fetch failed:', error.message); return []; }
  return data ?? [];
}

/**
 * Toggle a feature on/off (admin only).
 */
export async function toggleDashboardFeature(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('dashboard_features')
    .update({ enabled, updated_by: (await supabase.auth.getUser()).data.user?.id })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Upsert a feature row — used to register new menu items the admin hasn't seen yet.
 */
export async function ensureFeatureExists(dashboard: DashboardType, featureKey: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_features')
    .upsert(
      { dashboard, feature_key: featureKey, enabled: true },
      { onConflict: 'dashboard,feature_key', ignoreDuplicates: true },
    );
  if (error) console.warn('[dashboard-features] upsert failed:', error.message);
}

/**
 * Fetch disabled feature keys for a dashboard.
 * Uses a SECURITY DEFINER RPC so any authenticated user can check.
 */
export async function fetchDisabledFeatures(dashboard: DashboardType): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_disabled_features', { p_dashboard: dashboard });
  if (error) { console.warn('[dashboard-features] rpc failed:', error.message); return new Set(); }
  return new Set(data ?? []);
}
