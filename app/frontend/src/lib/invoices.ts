import { supabase } from '@/lib/supabase';
import type { Currency } from '@/lib/businesses';

export const INVOICE_STATUSES = ['draft','issued','paid','overdue','cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft:     'bg-slate-100 text-slate-700',
  issued:    'bg-luna-blue/10 text-luna-blue',
  paid:      'bg-emerald-100 text-emerald-800',
  overdue:   'bg-red-100 text-red-800',
  cancelled: 'bg-slate-200 text-slate-500',
};

export type Party = {
  name?: string | null;
  legal_name?: string | null;
  vat_number?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type Invoice = {
  id: string;
  business_id: string;
  customer_id: string | null;
  shipment_id: string | null;
  quote_id: string | null;
  number: string | null;
  status: InvoiceStatus;
  currency: Currency;
  issued_on: string | null;
  due_on: string | null;
  paid_on: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  supplier_party: Party;
  customer_party: Party;
  endpoint_scheme: string | null;
  endpoint_id: string | null;
  payment_terms: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  line_index: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_pct: number;
  item_code: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceInput = Omit<Invoice, 'id' | 'business_id' | 'number' | 'subtotal' | 'vat_total' | 'total' | 'created_by' | 'created_at' | 'updated_at'> & { id?: string };
export type InvoiceLineInput = Omit<InvoiceLine, 'id' | 'invoice_id' | 'created_at' | 'updated_at'> & { id?: string };

// ─── CRUD ──────────────────────────────────────────────────────────

export async function fetchInvoices(businessId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices').select('*').eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[invoices] fetch failed:', error.message); return []; }
  return (data ?? []) as Invoice[];
}

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[invoices] fetchOne failed:', error.message); return null; }
  return (data as Invoice) ?? null;
}

export async function upsertInvoice(businessId: string, input: InvoiceInput): Promise<Invoice> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = { ...input, business_id: businessId, created_by: input.id ? undefined : user?.id ?? null };
  const { data, error } = await supabase.from('invoices').upsert(payload).select().single();
  if (error) throw error;
  return data as Invoice;
}

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus, extra?: { paid_on?: string | null }) {
  const patch: Record<string, unknown> = { status };
  if (extra?.paid_on !== undefined) patch.paid_on = extra.paid_on;
  const { error } = await supabase.from('invoices').update(patch).eq('id', id);
  if (error) throw error;
}

// ─── Lines ─────────────────────────────────────────────────────────

export async function fetchInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  const { data, error } = await supabase.from('invoice_lines').select('*')
    .eq('invoice_id', invoiceId).order('line_index', { ascending: true });
  if (error) { console.warn('[invoice_lines] fetch failed:', error.message); return []; }
  return (data ?? []) as InvoiceLine[];
}

export async function upsertInvoiceLine(invoiceId: string, input: InvoiceLineInput): Promise<InvoiceLine> {
  const { data, error } = await supabase.from('invoice_lines')
    .upsert({ ...input, invoice_id: invoiceId }).select().single();
  if (error) throw error;
  return data as InvoiceLine;
}

export async function deleteInvoiceLine(id: string): Promise<void> {
  const { error } = await supabase.from('invoice_lines').delete().eq('id', id);
  if (error) throw error;
}

// ─── Issue + draft-from-shipment ──────────────────────────────────

export async function issueInvoice(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('issue_invoice', { p_invoice: id });
  if (error) throw error;
  return data as string;
}

export async function draftInvoiceFromShipment(shipmentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('draft_invoice_from_shipment', { p_shipment: shipmentId });
  if (error) throw error;
  return data as string;
}

export function emptyInvoice(currency: Currency = 'EUR'): InvoiceInput {
  return {
    customer_id: null,
    shipment_id: null,
    quote_id: null,
    status: 'draft',
    currency,
    issued_on: null,
    due_on: null,
    paid_on: null,
    supplier_party: {},
    customer_party: {},
    endpoint_scheme: '9925',
    endpoint_id: null,
    payment_terms: null,
    payment_reference: null,
    notes: null,
  };
}
