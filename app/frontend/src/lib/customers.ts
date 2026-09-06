import { supabase } from '@/lib/supabase';

export type CustomerType = 'individual' | 'company';

export type BusinessCustomer = {
  id: string;
  business_id: string;
  customer_type: CustomerType;
  display_name: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  company_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerAddress = {
  id: string;
  customer_id: string;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  is_default_billing: boolean;
  is_default_shipping: boolean;
  created_at: string;
  updated_at: string;
};

/** UI-friendly display_name from the type + fields. */
export function deriveDisplayName(input: {
  customer_type: CustomerType;
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  if (input.customer_type === 'company') return (input.company_name || '').trim();
  return [input.first_name, input.last_name].filter(Boolean).join(' ').trim();
}

// ─── Customers ────────────────────────────────────────────────────────

export async function fetchCustomers(businessId: string): Promise<BusinessCustomer[]> {
  const { data, error } = await supabase
    .from('business_customers').select('*')
    .eq('business_id', businessId)
    .order('display_name', { ascending: true });
  if (error) { console.warn('[customers] fetch failed:', error.message); return []; }
  return (data ?? []) as BusinessCustomer[];
}

export async function fetchCustomer(id: string): Promise<BusinessCustomer | null> {
  const { data, error } = await supabase
    .from('business_customers').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[customers] fetchOne failed:', error.message); return null; }
  return (data as BusinessCustomer) ?? null;
}

export type CustomerInput = Omit<BusinessCustomer, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'business_id'> & {
  id?: string;
};

export async function upsertCustomer(businessId: string, input: CustomerInput): Promise<BusinessCustomer> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    ...input,
    business_id: businessId,
    display_name: input.display_name.trim() || deriveDisplayName(input) || '(sans nom)',
    created_by: input.id ? undefined : user?.id ?? null,
  };
  const { data, error } = await supabase.from('business_customers').upsert(payload).select().single();
  if (error) throw error;
  return data as BusinessCustomer;
}

/** Soft-delete: mark inactive so historical quotes/shipments/invoices
 *  don't break their FK. A hard delete stays possible via a follow-up
 *  purge tool once we're sure nothing depends on the row. */
export async function deactivateCustomer(id: string) {
  const { error } = await supabase.from('business_customers')
    .update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function reactivateCustomer(id: string) {
  const { error } = await supabase.from('business_customers')
    .update({ is_active: true }).eq('id', id);
  if (error) throw error;
}

// ─── Addresses ────────────────────────────────────────────────────────

export async function fetchCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from('customer_addresses').select('*')
    .eq('customer_id', customerId)
    .order('is_default_shipping', { ascending: false })
    .order('is_default_billing', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) { console.warn('[addresses] fetch failed:', error.message); return []; }
  return (data ?? []) as CustomerAddress[];
}

export type AddressInput = Omit<CustomerAddress, 'id' | 'created_at' | 'updated_at' | 'customer_id'> & {
  id?: string;
};

export async function upsertAddress(customerId: string, input: AddressInput): Promise<CustomerAddress> {
  const payload = {
    ...input,
    customer_id: customerId,
    country: (input.country || 'BE').toUpperCase().slice(0, 2),
  };
  const { data, error } = await supabase.from('customer_addresses').upsert(payload).select().single();
  if (error) throw error;
  return data as CustomerAddress;
}

export async function deleteAddress(id: string) {
  const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
  if (error) throw error;
}
