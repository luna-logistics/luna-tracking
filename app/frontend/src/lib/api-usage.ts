import { supabase } from '@/lib/supabase';

/** Aggregated usage stats for one business. Backed by the RPC
 *  get_api_usage() which does all the SQL heavy lifting in Postgres. */

export type UsageTotals = {
  calls: number;
  success: number;
  client_error: number;
  server_error: number;
  avg_response_ms: number;
  p95_response_ms: number;
};

export type UsageByEndpoint = {
  path: string;
  calls: number;
  avg_ms: number;
  errors: number;
};

export type UsageByKey = {
  key_name: string;
  api_key_id: string | null;
  calls: number;
  last_call_at: string | null;
};

export type UsageTimelinePoint = {
  bucket: string;
  calls: number;
  errors: number;
};

export type UsageReport = {
  range: { since: string; until: string; bucket: 'hour' | 'day' };
  totals: UsageTotals;
  by_endpoint: UsageByEndpoint[];
  by_key: UsageByKey[];
  timeline: UsageTimelinePoint[];
};

export type UsageRange = '24h' | '7d' | '30d';

/** Resolve a UI-friendly range name to the timestamps + bucket the RPC needs. */
export function resolveRange(r: UsageRange): { since: Date; until: Date; bucket: 'hour' | 'day' } {
  const until = new Date();
  const since = new Date(until);
  if (r === '24h') { since.setHours(since.getHours() - 24); return { since, until, bucket: 'hour' }; }
  if (r === '7d')  { since.setDate(since.getDate() - 7);   return { since, until, bucket: 'day' }; }
  since.setDate(since.getDate() - 30);
  return { since, until, bucket: 'day' };
}

export async function fetchUsage(businessId: string, r: UsageRange): Promise<UsageReport | null> {
  const { since, until, bucket } = resolveRange(r);
  const { data, error } = await supabase.rpc('get_api_usage', {
    p_business: businessId,
    p_since: since.toISOString(),
    p_until: until.toISOString(),
    p_bucket: bucket,
  });
  if (error) { console.warn('[usage] fetch failed:', error.message); return null; }
  return data as UsageReport;
}
