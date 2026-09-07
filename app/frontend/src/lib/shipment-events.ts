import { supabase } from '@/lib/supabase';
import type { ShipmentStatus } from '@/lib/shipment-status';

/** Timeline of what happened to a shipment.
 *  Rows here are immutable — the DB blocks UPDATE and DELETE. */

export type ShipmentEventKind =
  | 'created'
  | 'status_change'
  | 'note'
  | 'document_added'
  | 'document_removed';

export type ShipmentEvent = {
  id: string;
  shipment_id: string;
  business_id: string;
  kind: ShipmentEventKind;
  from_status: ShipmentStatus | null;
  to_status: ShipmentStatus | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  // enriched client-side:
  actor_name?: string | null;
};

/** Fetch events for a shipment, oldest first, then enrich with actor display
 *  name via a batched profiles lookup. */
export async function fetchEvents(shipmentId: string): Promise<ShipmentEvent[]> {
  const { data, error } = await supabase
    .from('shipment_events').select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[events] fetch failed:', error.message); return []; }
  const events = (data ?? []) as ShipmentEvent[];

  const ids = Array.from(new Set(events.map((e) => e.created_by).filter((x): x is string => !!x)));
  if (ids.length === 0) return events;

  const { data: profiles } = await supabase
    .rpc('business_actor_names', { p_user_ids: ids });
  const byId = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (p.full_name) byId.set(p.id, p.full_name);
  }
  return events.map((e) => ({ ...e, actor_name: e.created_by ? byId.get(e.created_by) ?? null : null }));
}

export async function addNote(shipmentId: string, businessId: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('shipment_events').insert({
    shipment_id: shipmentId,
    business_id: businessId,
    kind: 'note',
    note: trimmed,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}
