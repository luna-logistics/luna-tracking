/**
 * Payment gateway — STUB.
 *
 * The Shop & Ship checkout creates the order in Supabase first (status
 * `pending_payment`), then calls `initiatePayment(order)` which — once a real
 * gateway is wired — will redirect the user to Stripe / Mollie / Bancontact /
 * whichever is picked. Until then, the stub returns a friendly message the UI
 * shows to the user; the order stays `pending_payment` and Luna's team follows
 * up manually to collect payment out of band.
 *
 * The contract:
 *   - `status: 'redirect'`  →  a real gateway will send the user to `url`
 *   - `status: 'deferred'`  →  no gateway wired yet; show `message` to the user
 *   - `status: 'error'`     →  a gateway attempted but failed; show `message`
 *
 * When the real gateway lands, only this file changes — the checkout page
 * already handles all three status shapes.
 */

import type { Order } from '@/lib/orders';

export type PaymentResult =
  | { status: 'redirect'; url: string }
  | { status: 'deferred'; message: string }
  | { status: 'error'; message: string };

export async function initiatePayment(_order: Order, locale: 'fr' | 'en' = 'fr'): Promise<PaymentResult> {
  const message =
    locale === 'en'
      ? "Online payment isn't live yet — we'll contact you to finalise the payment."
      : "Paiement en ligne bientôt disponible — nous vous contacterons pour finaliser le règlement.";
  return { status: 'deferred', message };
}
