import { supabase } from '@/lib/supabase';
import type { ShipmentStatus, ShipmentDirection, ShipmentMode } from '@/lib/shipment-status';
import type { Currency } from '@/lib/businesses';

// ─── Types ─────────────────────────────────────────────────────────────

export type Shipment = {
  id: string;
  business_id: string;
  customer_id: string | null;
  reference: string;
  direction: ShipmentDirection;
  mode: ShipmentMode;
  status: ShipmentStatus;
  incoterm: string | null;
  origin_name: string | null;
  origin_address_line1: string | null;
  origin_address_line2: string | null;
  origin_postal_code: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_name: string | null;
  destination_address_line1: string | null;
  destination_address_line2: string | null;
  destination_postal_code: string | null;
  destination_city: string | null;
  destination_country: string | null;
  carrier_name: string | null;
  tracking_number: string | null;
  estimated_pickup: string | null;
  estimated_delivery: string | null;
  actual_pickup: string | null;
  actual_delivery: string | null;
  total_weight_kg: number | null;
  total_volume_m3: number | null;
  goods_value: number | null;
  currency: Currency;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentPackage = {
  id: string;
  shipment_id: string;
  package_index: number;
  description: string | null;
  quantity: number;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  contents_value: number | null;
  contents_currency: Currency | null;
  hs_code: string | null;
  marks_and_numbers: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ChargeKind = 'transport' | 'handling' | 'insurance' | 'customs' | 'storage' | 'fuel' | 'other';

export type ShipmentCharge = {
  id: string;
  shipment_id: string;
  kind: ChargeKind;
  label: string;
  amount: number;
  currency: Currency;
  is_billable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentTemplate = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  data: Partial<ShipmentInput>;    // stored as JSONB
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentInput = Omit<
  Shipment,
  'id' | 'business_id' | 'reference' | 'created_by' | 'created_at' | 'updated_at'
> & { id?: string };

// ─── Shipments CRUD ───────────────────────────────────────────────────

export async function fetchShipments(businessId: string): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from('shipments').select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[shipments] fetch failed:', error.message); return []; }
  return (data ?? []) as Shipment[];
}

export async function fetchClientShipments(customerId: string): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from('shipments').select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[shipments] fetchByClient failed:', error.message); return []; }
  return (data ?? []) as Shipment[];
}

export async function fetchShipment(id: string): Promise<Shipment | null> {
  const { data, error } = await supabase.from('shipments').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[shipments] fetchOne failed:', error.message); return null; }
  return (data as Shipment) ?? null;
}

export async function upsertShipment(businessId: string, input: ShipmentInput): Promise<Shipment> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    ...input,
    business_id: businessId,
    created_by: input.id ? undefined : user?.id ?? null,
  };
  const { data, error } = await supabase.from('shipments').upsert(payload).select().single();
  if (error) throw error;
  return data as Shipment;
}

export async function updateShipmentStatus(id: string, status: ShipmentStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === 'delivered' && !patch.actual_delivery) patch.actual_delivery = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('shipments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteShipment(id: string) {
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw error;
}

// ─── Packages ─────────────────────────────────────────────────────────

export async function fetchPackages(shipmentId: string): Promise<ShipmentPackage[]> {
  const { data, error } = await supabase
    .from('shipment_packages').select('*')
    .eq('shipment_id', shipmentId)
    .order('package_index', { ascending: true });
  if (error) { console.warn('[packages] fetch failed:', error.message); return []; }
  return (data ?? []) as ShipmentPackage[];
}

export type PackageInput = Omit<ShipmentPackage, 'id' | 'shipment_id' | 'created_at' | 'updated_at'> & { id?: string };

export async function upsertPackage(shipmentId: string, input: PackageInput) {
  const { data, error } = await supabase.from('shipment_packages')
    .upsert({ ...input, shipment_id: shipmentId }).select().single();
  if (error) throw error;
  return data as ShipmentPackage;
}

export async function deletePackage(id: string) {
  const { error } = await supabase.from('shipment_packages').delete().eq('id', id);
  if (error) throw error;
}

// ─── Charges ──────────────────────────────────────────────────────────

export async function fetchCharges(shipmentId: string): Promise<ShipmentCharge[]> {
  const { data, error } = await supabase
    .from('shipment_charges').select('*')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[charges] fetch failed:', error.message); return []; }
  return (data ?? []) as ShipmentCharge[];
}

export type ChargeInput = Omit<ShipmentCharge, 'id' | 'shipment_id' | 'created_at' | 'updated_at'> & { id?: string };

export async function upsertCharge(shipmentId: string, input: ChargeInput) {
  const { data, error } = await supabase.from('shipment_charges')
    .upsert({ ...input, shipment_id: shipmentId }).select().single();
  if (error) throw error;
  return data as ShipmentCharge;
}

export async function deleteCharge(id: string) {
  const { error } = await supabase.from('shipment_charges').delete().eq('id', id);
  if (error) throw error;
}

/** Sum revenue billable amounts in shipment currency. Amounts in a
 *  different currency are counted as-is (no conversion) — reporting
 *  handles multi-currency later. */
export function sumBillable(shipmentCurrency: Currency, charges: ShipmentCharge[]): number {
  return charges
    .filter((c) => c.is_billable && c.currency === shipmentCurrency)
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
}

// ─── Templates ────────────────────────────────────────────────────────

export async function fetchTemplates(businessId: string): Promise<ShipmentTemplate[]> {
  const { data, error } = await supabase
    .from('shipment_templates').select('*')
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false });
  if (error) { console.warn('[templates] fetch failed:', error.message); return []; }
  return (data ?? []) as ShipmentTemplate[];
}

export async function saveTemplate(businessId: string, name: string, description: string | null, data: Partial<ShipmentInput>) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: row, error } = await supabase.from('shipment_templates')
    .insert({ business_id: businessId, name: name.trim(), description, data, created_by: user?.id ?? null })
    .select().single();
  if (error) throw error;
  return row as ShipmentTemplate;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from('shipment_templates').delete().eq('id', id);
  if (error) throw error;
}

/** Fresh, blank shipment payload used by the form when nothing is loaded. */
export function emptyShipment(currency: Currency = 'EUR'): ShipmentInput {
  return {
    customer_id: null,
    direction: 'export',
    mode: 'road',
    status: 'draft',
    incoterm: null,
    origin_name: null, origin_address_line1: null, origin_address_line2: null,
    origin_postal_code: null, origin_city: null, origin_country: null,
    destination_name: null, destination_address_line1: null, destination_address_line2: null,
    destination_postal_code: null, destination_city: null, destination_country: null,
    carrier_name: null, tracking_number: null,
    estimated_pickup: null, estimated_delivery: null,
    actual_pickup: null, actual_delivery: null,
    total_weight_kg: null, total_volume_m3: null,
    goods_value: null, currency,
    notes: null,
  };
}
