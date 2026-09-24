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
  /** Online payment (Stripe) — only the platform business, see send_invoice(). */
  payment_token: string | null;
  sent_at: string | null;
  sent_language: 'fr' | 'en' | null;
  paid_via: 'stripe' | 'manual' | null;
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

export type InvoiceInput = Omit<Invoice,
  'id' | 'business_id' | 'number' | 'subtotal' | 'vat_total' | 'total' | 'created_by' | 'created_at' | 'updated_at'
  | 'payment_token' | 'sent_at' | 'sent_language' | 'paid_via'> & { id?: string };
export type InvoiceLineInput = Omit<InvoiceLine, 'id' | 'invoice_id' | 'created_at' | 'updated_at'> & { id?: string };

/** An invoice is "overdue" when it has been issued (not paid/cancelled)
 *  and its due date is in the past. Computed on read — we never mutate a
 *  stored issued invoice, so the persisted status stays 'issued' and the
 *  document remains immutable; only the UI marks it late. Returns false
 *  when there is no due date (nothing reliable to compare against). */
export function isInvoiceOverdue(inv: Pick<Invoice, 'status' | 'due_on'>, today = new Date()): boolean {
  if (inv.status !== 'issued' || !inv.due_on) return false;
  const due = new Date(inv.due_on + 'T23:59:59');
  return due.getTime() < today.getTime();
}

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

export async function fetchClientInvoices(customerId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices').select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[invoices] fetchByClient failed:', error.message); return []; }
  return (data ?? []) as Invoice[];
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

// ─── Online payment + e-mail (platform business only) ─────────────

/** The business allowed to send invoices by e-mail and take online payment
 *  (platform_settings.stripe_invoice_business_id). null = feature off. */
export async function fetchPaymentBusinessId(): Promise<string | null> {
  const { data, error } = await supabase.from('platform_settings')
    .select('value').eq('key', 'stripe_invoice_business_id').maybeSingle();
  if (error) { console.warn('[invoices] payment business lookup failed:', error.message); return null; }
  return typeof data?.value === 'string' && data.value ? data.value : null;
}

/** E-mails the invoice + payment link to customer_party.email (in `lang`).
 *  Re-sending is allowed. Returns the payment token. */
export async function sendInvoice(id: string, lang: 'fr' | 'en'): Promise<string> {
  const { data, error } = await supabase.rpc('send_invoice', { p_invoice: id, p_lang: lang });
  if (error) throw error;
  return data as string;
}

export function invoicePaymentUrl(token: string, lang: 'fr' | 'en'): string {
  return `${window.location.origin}${lang === 'en' ? `/en/invoice/${token}` : `/facture/${token}`}`;
}

/** What the customer's /facture/<token> page receives. */
export type PublicInvoice = Pick<Invoice,
  'number' | 'status' | 'currency' | 'issued_on' | 'due_on' | 'paid_on' | 'paid_via' | 'subtotal' | 'vat_total' | 'total'
  | 'supplier_party' | 'customer_party' | 'payment_terms' | 'payment_reference' | 'notes'> & {
  payable: boolean;
  lines: Array<Pick<InvoiceLine, 'description' | 'quantity' | 'unit_price' | 'vat_pct'>>;
};

export async function fetchInvoiceByToken(token: string): Promise<PublicInvoice | null> {
  const { data, error } = await supabase.rpc('get_invoice_by_token', { p_token: token });
  if (error) { console.warn('[invoices] by-token failed:', error.message); return null; }
  return (data as PublicInvoice) ?? null;
}

const INVOICE_ERROR_CODES = [
  'invoice_locked', 'invoice_issue_via_rpc', 'invoice_status_terminal', 'invoice_payment_fields_readonly',
  'invoice_payment_not_enabled', 'invoice_no_customer_email', 'invoice_not_issued', 'invoice_already_settled',
  'insufficient_role',
] as const;

/** i18n key (business_invoices.err_*) for a DB refusal, or null. */
export function invoiceErrorKey(err: unknown): string | null {
  const m = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  const code = INVOICE_ERROR_CODES.find((c) => m.startsWith(c));
  return code ? `business_invoices.err_${code}` : null;
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
