import { supabase } from '@/lib/supabase';
import type { ShipmentDirection, ShipmentMode } from '@/lib/shipment-status';
import type { Currency } from '@/lib/businesses';

/** Quotes = the "before" of a shipment. A quote can be sent, accepted,
 *  or declined; accepting converts it to a shipment atomically via
 *  the accept_quote_to_shipment() RPC. */

export const QUOTE_STATUSES = ['draft','sent','accepted','declined','expired','converted'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_STYLES: Record<QuoteStatus, string> = {
  draft:     'bg-slate-100 text-slate-700',
  sent:      'bg-luna-blue/10 text-luna-blue',
  accepted:  'bg-emerald-100 text-emerald-800',
  declined:  'bg-red-100 text-red-800',
  expired:   'bg-amber-100 text-amber-800',
  converted: 'bg-purple-100 text-purple-800',
};

export type Quote = {
  id: string;
  business_id: string;
  customer_id: string | null;
  reference: string;
  status: QuoteStatus;
  valid_until: string | null;
  direction: ShipmentDirection;
  mode: ShipmentMode;
  origin_country: string | null;
  origin_city: string | null;
  destination_country: string | null;
  destination_city: string | null;
  weight_kg: number | null;
  volume_m3: number | null;
  package_count: number | null;
  transport_cost: number;
  customer_price: number;
  platform_fee: number;
  currency: Currency;
  provider_code: string | null;
  notes: string | null;
  shipment_id: string | null;
  accepted_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  line_index: number;
  description: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  updated_at: string;
};

export type QuoteInput = Omit<
  Quote,
  'id' | 'business_id' | 'reference' | 'shipment_id' | 'accepted_at' | 'sent_at'
    | 'created_by' | 'created_at' | 'updated_at'
> & { id?: string };

/** The margin the professional captures, once platform fee is netted out.
 *  Never sent to the customer — display in the business UI only. */
export function professionalMargin(q: Pick<Quote, 'customer_price' | 'transport_cost' | 'platform_fee'>): number {
  return Number((q.customer_price - q.transport_cost - q.platform_fee).toFixed(2));
}

export function sumLines(lines: QuoteLine[]): number {
  return Number(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0).toFixed(2));
}

// ─── CRUD ────────────────────────────────────────────────────────────

export async function fetchQuotes(businessId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes').select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[quotes] fetch failed:', error.message); return []; }
  return (data ?? []) as Quote[];
}

export async function fetchQuote(id: string): Promise<Quote | null> {
  const { data, error } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[quotes] fetchOne failed:', error.message); return null; }
  return (data as Quote) ?? null;
}

export async function upsertQuote(businessId: string, input: QuoteInput): Promise<Quote> {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    ...input,
    business_id: businessId,
    created_by: input.id ? undefined : user?.id ?? null,
  };
  const { data, error } = await supabase.from('quotes').upsert(payload).select().single();
  if (error) throw error;
  return data as Quote;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (status === 'accepted') patch.accepted_at = new Date().toISOString();
  const { error } = await supabase.from('quotes').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteQuote(id: string) {
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) throw error;
}

// ─── Lines ───────────────────────────────────────────────────────────

export async function fetchQuoteLines(quoteId: string): Promise<QuoteLine[]> {
  const { data, error } = await supabase
    .from('quote_lines').select('*')
    .eq('quote_id', quoteId)
    .order('line_index', { ascending: true });
  if (error) { console.warn('[quote_lines] fetch failed:', error.message); return []; }
  return (data ?? []) as QuoteLine[];
}

export type QuoteLineInput = Omit<QuoteLine, 'id' | 'quote_id' | 'created_at' | 'updated_at'> & { id?: string };

export async function upsertQuoteLine(quoteId: string, input: QuoteLineInput) {
  const { data, error } = await supabase.from('quote_lines')
    .upsert({ ...input, quote_id: quoteId }).select().single();
  if (error) throw error;
  return data as QuoteLine;
}

export async function deleteQuoteLine(id: string) {
  const { error } = await supabase.from('quote_lines').delete().eq('id', id);
  if (error) throw error;
}

// ─── Atomic conversion ──────────────────────────────────────────────

/** Server-side RPC. Creates a shipment from the quote in one transaction
 *  and flips the quote to 'converted'. Idempotent for already-converted
 *  quotes (returns the same shipment_id). */
export async function acceptQuoteToShipment(quoteId: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_quote_to_shipment', { p_quote: quoteId });
  if (error) throw error;
  return data as string;
}

export function emptyQuote(currency: Currency = 'EUR'): QuoteInput {
  return {
    customer_id: null,
    status: 'draft',
    valid_until: null,
    direction: 'export',
    mode: 'road',
    origin_country: null,
    origin_city: null,
    destination_country: null,
    destination_city: null,
    weight_kg: null,
    volume_m3: null,
    package_count: null,
    transport_cost: 0,
    customer_price: 0,
    platform_fee: 0,
    currency,
    provider_code: null,
    notes: null,
  };
}
