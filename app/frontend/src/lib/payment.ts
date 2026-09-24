/**
 * Online payment — Stripe Checkout (hosted), TEST mode until the production
 * go-ahead.
 *
 * The Shop & Ship checkout creates the order first (status `pending_payment`,
 * amount rebuilt server-side by the orders_reprice trigger), then calls
 * `initiatePayment(order)`: the `create-checkout-session` edge function builds
 * the Stripe session from the stored order — never from anything the browser
 * sends — and we redirect. The order only becomes `paid` through the Stripe
 * webhook.
 *
 * `startInvoicePayment(token)` does the same for an internal FAC-… invoice
 * (platform business only), from the customer's /facture/<token> page.
 *
 * The contract:
 *   - `status: 'redirect'`  →  send the user to `url` (Stripe-hosted page)
 *   - `status: 'deferred'`  →  online payment not switched on yet (function
 *                              not deployed / Stripe keys not set): show
 *                              `message`, Luna follows up manually
 *   - `status: 'error'`     →  show `message` (says what happened + what to do)
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/orders';

export type PaymentResult =
  | { status: 'redirect'; url: string }
  | { status: 'deferred'; message: string }
  | { status: 'error'; message: string; code?: string };

type Lang = 'fr' | 'en';

/** Codes meaning "online payment is not switched on" rather than a failure. */
const NOT_LIVE = new Set(['stripe_not_configured', 'stripe_live_key_refused', 'function_unavailable']);

async function callCheckout(fn: string, body: Record<string, unknown>): Promise<{ url: string } | { code: string }> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(fn, { body });
  if (!error && data?.url) return { url: data.url };
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const payload = await res.json().catch(() => null) as { error?: string } | null;
    // 404 without our JSON = the function is not deployed yet.
    if (!payload?.error && res.status === 404) return { code: 'function_unavailable' };
    return { code: payload?.error ?? `http_${res.status}` };
  }
  if (error) return { code: 'function_unavailable' };
  return { code: data?.error ?? 'unexpected_response' };
}

const MESSAGES: Record<string, Record<Lang, string>> = {
  deferred: {
    fr: 'Paiement en ligne bientôt disponible — nous vous contacterons pour finaliser le règlement.',
    en: "Online payment isn't live yet — we'll contact you to finalise the payment.",
  },
  order_already_paid: {
    fr: 'Cette commande est déjà réglée.',
    en: 'This order has already been paid.',
  },
  order_payment_processing: {
    fr: 'Votre paiement est en cours de confirmation. Rechargez la page dans quelques instants.',
    en: 'Your payment is being confirmed. Reload the page in a moment.',
  },
  order_not_payable: {
    fr: "Cette commande a été annulée et ne peut plus être payée. Contactez-nous si c'est une erreur.",
    en: 'This order was cancelled and can no longer be paid. Contact us if this is a mistake.',
  },
  invoice_already_paid: {
    fr: 'Cette facture est déjà réglée.',
    en: 'This invoice has already been paid.',
  },
  invoice_payment_processing: {
    fr: 'Votre paiement est en cours de confirmation. Rechargez la page dans quelques instants.',
    en: 'Your payment is being confirmed. Reload the page in a moment.',
  },
  invoice_not_payable: {
    fr: 'Cette facture ne peut pas être payée en ligne. Utilisez le virement indiqué sur la facture ou contactez-nous.',
    en: 'This invoice cannot be paid online. Use the bank transfer details on the invoice or contact us.',
  },
  unsupported_currency: {
    fr: "Le paiement en ligne n'est pas disponible dans cette devise. Utilisez le virement indiqué sur la facture.",
    en: 'Online payment is not available in this currency. Use the bank transfer details on the invoice.',
  },
  generic: {
    fr: "Le paiement n'a pas pu démarrer. Réessayez dans un instant ; si le problème persiste, contactez-nous.",
    en: "The payment couldn't start. Try again in a moment; if it keeps failing, contact us.",
  },
};

function toResult(r: { url: string } | { code: string }, lang: Lang): PaymentResult {
  if ('url' in r) return { status: 'redirect', url: r.url };
  if (NOT_LIVE.has(r.code)) return { status: 'deferred', message: MESSAGES.deferred[lang] };
  return { status: 'error', code: r.code, message: (MESSAGES[r.code] ?? MESSAGES.generic)[lang] };
}

export async function initiatePayment(order: Pick<Order, 'id'>, locale: Lang = 'fr'): Promise<PaymentResult> {
  return toResult(await callCheckout('create-checkout-session', { order_id: order.id, lang: locale }), locale);
}

export async function startInvoicePayment(token: string, locale: Lang = 'fr'): Promise<PaymentResult> {
  return toResult(await callCheckout('create-invoice-payment', { token, lang: locale }), locale);
}
