import { supabase } from '@/lib/supabase';

export type ReportRange = 'this_month' | 'last_month' | 'ytd' | 'last_12m';

export type BusinessReport = {
  range: { since: string; until: string };
  currency: string;
  totals: {
    invoices_issued_count: number;
    invoices_paid_count: number;
    invoices_revenue_ex_vat: number;
    invoices_vat_collected: number;
    invoices_revenue_inc_vat: number;
    expenses_total: number;
    shipments_created: number;
    shipments_delivered: number;
    quotes_created: number;
    quotes_accepted: number;
  };
  revenue_by_mode: { mode: string; invoices: number; subtotal: number }[];
  top_customers: { id: string; display_name: string; invoices: number; subtotal: number }[];
  sales_journal: {
    number: string | null; issued_on: string | null; paid_on: string | null;
    customer_name: string | null; customer_vat: string | null; customer_country: string | null;
    subtotal: number; vat_total: number; total: number; currency: string; status: string;
  }[];
  expenses_journal: {
    incurred_on: string; kind: string; label: string;
    vendor: string | null; invoice_ref: string | null; shipment_ref: string | null;
    amount: number; vat_pct: number; currency: string;
  }[];
};

export function resolveReportRange(r: ReportRange): { since: Date; until: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (r === 'this_month')  return { since: new Date(y, m, 1),     until: new Date(y, m + 1, 1) };
  if (r === 'last_month')  return { since: new Date(y, m - 1, 1), until: new Date(y, m, 1) };
  if (r === 'ytd')         return { since: new Date(y, 0, 1),     until: new Date(y + 1, 0, 1) };
  return { since: new Date(y, m - 11, 1), until: new Date(y, m + 1, 1) };
}

export async function fetchReport(businessId: string, range: ReportRange): Promise<BusinessReport | null> {
  const { since, until } = resolveReportRange(range);
  const { data, error } = await supabase.rpc('get_business_report', {
    p_business: businessId,
    p_since: since.toISOString(),
    p_until: until.toISOString(),
  });
  if (error) { console.warn('[report] fetch failed:', error.message); return null; }
  return data as BusinessReport;
}

// ─── CSV export (client-side, no dep) ─────────────────────────────

/** RFC-4180 safe: quote every field, escape quotes by doubling, join
 *  with CRLF. Works for Excel + Numbers + LibreOffice + accounting
 *  imports. */
export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0) return '';
  const cols = headers ?? Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = cols.map(escape).join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\r\n');
  return head + '\r\n' + body + '\r\n';
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
