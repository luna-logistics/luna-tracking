import { supabase } from '@/lib/supabase';

/**
 * Bank-transfer payment for Achat & Envoi orders.
 *
 * The receiving account lives in platform_settings 'bank_transfer_details'
 * (public read, admin write) and is edited in /admin/paiements. It may still
 * be empty: the checkout offers the transfer anyway and tells the customer
 * Luna will send the details — `isBankTransferReady` decides which message.
 */

export type BankTransferDetails = {
  account_holder: string;
  iban: string;
  bic: string;
  bank_name: string;
  /** Optional extra line shown to the customer, per language. */
  note_fr: string;
  note_en: string;
};

const KEY = 'bank_transfer_details';

export const EMPTY_BANK_DETAILS: BankTransferDetails = {
  account_holder: '', iban: '', bic: '', bank_name: '', note_fr: '', note_en: '',
};

function normalize(value: unknown): BankTransferDetails {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const str = (k: keyof BankTransferDetails) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  return {
    account_holder: str('account_holder'),
    iban: str('iban'),
    bic: str('bic'),
    bank_name: str('bank_name'),
    note_fr: str('note_fr'),
    note_en: str('note_en'),
  };
}

/** The minimum a customer needs to wire money: who to pay and where. */
export function isBankTransferReady(d: BankTransferDetails | null): d is BankTransferDetails {
  return !!d && d.account_holder.trim() !== '' && d.iban.trim() !== '';
}

export async function fetchBankTransferDetails(): Promise<BankTransferDetails> {
  const { data, error } = await supabase.from('platform_settings')
    .select('value').eq('key', KEY).maybeSingle();
  if (error) { console.warn('[bank-transfer] lookup failed:', error.message); return EMPTY_BANK_DETAILS; }
  return normalize(data?.value);
}

export async function saveBankTransferDetails(d: BankTransferDetails): Promise<void> {
  const value: BankTransferDetails = {
    account_holder: d.account_holder.trim(),
    iban: formatIban(d.iban),
    bic: d.bic.replace(/\s+/g, '').toUpperCase(),
    bank_name: d.bank_name.trim(),
    note_fr: d.note_fr.trim(),
    note_en: d.note_en.trim(),
  };
  const { error } = await supabase.from('platform_settings')
    .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** "be68 5390 0754 7034" / "BE68539007547034" → "BE68 5390 0754 7034". */
export function formatIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
}

/** ISO 13616 mod-97 check. An empty IBAN is "valid" (details not filled yet). */
export function isValidIban(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (s === '') return true;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of n) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

/** The communication the customer puts on the transfer so the admin can
 *  match it to the order: "LUNA-" + the first 8 characters of the order id. */
export function orderPaymentReference(orderId: string): string {
  return `LUNA-${orderId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
