import { supabase } from '@/lib/supabase';
import type { Currency } from '@/lib/businesses';

export const EXPENSE_KINDS = [
  'transport','handling','insurance','customs','storage','fuel','tax','subcontractor','office','other',
] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export type Expense = {
  id: string;
  business_id: string;
  shipment_id: string | null;
  kind: ExpenseKind;
  label: string;
  amount: number;
  currency: Currency;
  vat_pct: number;
  vendor: string | null;
  invoice_ref: string | null;
  incurred_on: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInput = Omit<Expense, 'id' | 'business_id' | 'created_by' | 'created_at' | 'updated_at'> & { id?: string };

export async function fetchShipmentExpenses(shipmentId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses').select('*')
    .eq('shipment_id', shipmentId)
    .order('incurred_on', { ascending: false });
  if (error) { console.warn('[expenses] fetch failed:', error.message); return []; }
  return (data ?? []) as Expense[];
}

export async function fetchBusinessExpenses(businessId: string, limit = 500): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses').select('*')
    .eq('business_id', businessId)
    .order('incurred_on', { ascending: false })
    .limit(limit);
  if (error) { console.warn('[expenses] fetchAll failed:', error.message); return []; }
  return (data ?? []) as Expense[];
}

export async function upsertExpense(businessId: string, input: ExpenseInput): Promise<Expense> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    ...input,
    business_id: businessId,
    created_by: input.id ? undefined : user?.id ?? null,
  };
  const { data, error } = await supabase.from('expenses').upsert(payload).select().single();
  if (error) throw error;
  return data as Expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── Margin ─────────────────────────────────────────────────────────

export type Margin = {
  currency: string;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number | null;
  other_currencies: {
    revenue: { currency: string; amount: number }[];
    cost:    { currency: string; amount: number }[];
  };
};

export async function fetchShipmentMargin(shipmentId: string): Promise<Margin | null> {
  const { data, error } = await supabase.rpc('get_shipment_margin', { p_shipment: shipmentId });
  if (error) { console.warn('[margin] fetch failed:', error.message); return null; }
  return data as Margin;
}

export function emptyExpense(currency: Currency = 'EUR', shipmentId?: string): ExpenseInput {
  return {
    shipment_id: shipmentId ?? null,
    kind: 'transport',
    label: '',
    amount: 0,
    currency,
    vat_pct: 0,
    vendor: null,
    invoice_ref: null,
    incurred_on: new Date().toISOString().slice(0, 10),
    notes: null,
  };
}
