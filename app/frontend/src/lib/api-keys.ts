import { supabase } from '@/lib/supabase';

/** Client for the api_keys table + create_api_key/revoke_api_key RPCs.
 *  Creating a key returns the raw value ONCE — the DB only stores its
 *  sha256 hash. Callers must show the raw key immediately or lose it. */

export type ApiKey = {
  id: string;
  business_id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
};

export async function fetchApiKeys(businessId: string): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, business_id, name, key_prefix, permissions, revoked_at, last_used_at, created_by, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[api_keys] fetch failed:', error.message); return []; }
  return (data ?? []) as ApiKey[];
}

/** Returns the freshly minted plain-text key, shown once. */
export async function createApiKey(businessId: string, name: string, permissions: string[]): Promise<{ id: string; full_key: string }> {
  const { data, error } = await supabase.rpc('create_api_key', {
    p_business: businessId,
    p_name: name,
    p_permissions: permissions,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) throw new Error('create_api_key returned no row');
  return { id: row.id as string, full_key: row.full_key as string };
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_api_key', { p_id: id });
  if (error) throw error;
}

/** Available permission scopes callers can attach to a key. Kept in sync
 *  with the endpoints exposed by api-v1. */
export const API_KEY_SCOPES = [
  'shipments.read',
  'shipments.write',
  'customers.read',
  'customers.write',
  'quotes.read',
  'quotes.write',
  'rates.read',
  'tracking.read',
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
