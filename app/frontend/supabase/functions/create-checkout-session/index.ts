// create-checkout-session — Stripe Checkout (hosted) for an Achat & Envoi order.
//
// POST { order_id, lang } with the customer's session JWT.
// The amount is NEVER taken from the request: lines come from orders.items,
// which the orders_reprice trigger rebuilt from the catalogue at insert time
// (and which are frozen afterwards). We re-check that the lines add up to
// orders.total before charging.
//
// Reuses the order's open Checkout Session when there is one (a double click
// or a retry never creates two payable sessions). Stripe Tax is applied only
// when platform_settings.stripe_automatic_tax_enabled is true — OFF until the
// accountant confirms the VAT treatment.
//
// Errors (JSON { error }): stripe_not_configured / stripe_live_key_refused
// (503), not_authenticated (401), bad_request (400), not_found (404),
// order_already_paid / order_not_payable / order_payment_processing (409),
// amount_mismatch / stripe_error (500/502).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  ANON_KEY, SITE_URL, SUPABASE_URL, asLang, cors, json, paths, serviceClient, stripeOrError, toMinor,
} from '../_shared/stripe.ts';

type Item = { product_id: string; name: string; quantity: number; unit_price: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const s = stripeOrError();
  if ('error' in s) return s.error;
  const { stripe } = s;

  const authHeader = req.headers.get('authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'not_authenticated' }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const orderId = typeof body?.order_id === 'string' ? body.order_id : '';
  const lang = asLang(body?.lang);
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'bad_request' }, 400);

  const db = serviceClient();
  const { data: order, error } = await db.from('orders')
    .select('id, user_id, items, total, status, stripe_checkout_session_id')
    .eq('id', orderId).maybeSingle();
  if (error) return json({ error: 'db_error' }, 500);
  // Someone else's order answers exactly like a missing one.
  if (!order || order.user_id !== user.id) return json({ error: 'not_found' }, 404);
  if (order.status !== 'pending_payment') {
    return json({ error: order.status === 'cancelled' ? 'order_not_payable' : 'order_already_paid' }, 409);
  }

  const items = (Array.isArray(order.items) ? order.items : []) as Item[];
  const totalMinor = toMinor(order.total);
  const linesMinor = items.reduce((sum, it) => sum + toMinor(it.unit_price) * Number(it.quantity), 0);
  if (items.length === 0 || totalMinor <= 0 || linesMinor !== totalMinor) {
    console.error('[checkout] amount_mismatch', { orderId, totalMinor, linesMinor });
    return json({ error: 'amount_mismatch' }, 500);
  }

  // Reuse an open session; a completed one means payment is being confirmed.
  if (order.stripe_checkout_session_id) {
    try {
      const prev = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      if (prev.status === 'open' && prev.url) return json({ url: prev.url });
      if (prev.status === 'complete') return json({ error: 'order_payment_processing' }, 409);
    } catch (e) {
      console.warn('[checkout] previous session not retrievable', String(e));
    }
  }

  const { data: taxSetting } = await db.from('platform_settings')
    .select('value').eq('key', 'stripe_automatic_tax_enabled').maybeSingle();
  const automaticTax = taxSetting?.value === true;

  const back = `${SITE_URL}${paths.accountOrders(lang)}`;
  const metadata = { kind: 'order', order_id: order.id };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: order.id,
      customer_email: user.email ?? undefined,
      locale: lang,
      line_items: items.map((it) => ({
        quantity: Number(it.quantity),
        price_data: {
          currency: 'eur',
          unit_amount: toMinor(it.unit_price),
          // Catalogue prices are shown VAT-included to consumers.
          ...(automaticTax ? { tax_behavior: 'inclusive' as const } : {}),
          product_data: { name: String(it.name).slice(0, 250), metadata: { product_id: it.product_id } },
        },
      })),
      ...(automaticTax ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' as const } : {}),
      metadata,
      payment_intent_data: { metadata, description: `Achat & Envoi ${order.id.slice(0, 8)}` },
      success_url: `${back}?paiement=ok&commande=${order.id}`,
      cancel_url:  `${back}?paiement=annule&commande=${order.id}`,
    }, {
      // Same order + same previous session + same language = same request:
      // a network retry cannot create a second session.
      idempotencyKey: `order:${order.id}:${order.stripe_checkout_session_id ?? 'first'}:${lang}:${automaticTax ? 'tax' : 'notax'}`,
    });

    const { error: upErr } = await db.from('orders')
      .update({ stripe_checkout_session_id: session.id }).eq('id', order.id).eq('status', 'pending_payment');
    if (upErr) console.error('[checkout] could not store session id', upErr.message);
    return json({ url: session.url });
  } catch (e) {
    console.error('[checkout] stripe error', String(e));
    return json({ error: 'stripe_error' }, 502);
  }
});
