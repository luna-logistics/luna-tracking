import { supabase } from '@/lib/supabase';

/** Business webhooks. The secret is generated server-side and returned
 *  ONCE by create/rotate — never round-trips through the DB again from
 *  the browser (RLS on webhook_endpoints hides `secret` from the
 *  select projection we use). Deliveries are read-only from the UI. */

export const WEBHOOK_EVENTS = [
  '*',
  'shipment.created',
  'shipment.status_changed',
  'shipment.delivered',
  'quote.created',
  'quote.accepted',
  'quote.converted',
  'quote.declined',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookEndpoint = {
  id: string;
  business_id: string;
  name: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type WebhookDelivery = {
  id: string;
  endpoint_id: string;
  business_id: string;
  event_type: string;
  event_id: string | null;
  attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
};

export async function fetchEndpoints(businessId: string): Promise<WebhookEndpoint[]> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('id, business_id, name, url, event_types, is_active, last_success_at, last_error_at, last_error_message, created_at, updated_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[webhooks] fetch endpoints:', error.message); return []; }
  return (data ?? []) as WebhookEndpoint[];
}

export async function fetchRecentDeliveries(businessId: string, limit = 30): Promise<WebhookDelivery[]> {
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('id, endpoint_id, business_id, event_type, event_id, attempts, next_retry_at, last_attempt_at, last_status_code, last_error, delivered_at, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[webhooks] fetch deliveries:', error.message); return []; }
  return (data ?? []) as WebhookDelivery[];
}

export async function createEndpoint(businessId: string, name: string, url: string, events: string[]): Promise<{ id: string; secret: string }> {
  const { data, error } = await supabase.rpc('create_webhook_endpoint', {
    p_business: businessId,
    p_name: name,
    p_url: url,
    p_event_types: events.length === 0 ? ['*'] : events,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) throw new Error('create_webhook_endpoint returned no row');
  return { id: row.id as string, secret: row.secret as string };
}

export async function rotateSecret(endpointId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_webhook_secret', { p_endpoint: endpointId });
  if (error) throw error;
  return data as string;
}

export async function setEndpointActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('webhook_endpoints').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

export async function deleteEndpoint(id: string): Promise<void> {
  const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
  if (error) throw error;
}
