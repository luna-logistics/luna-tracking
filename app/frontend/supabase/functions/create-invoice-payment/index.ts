// create-invoice-payment — Stripe Checkout (hosted) that COLLECTS an internal
// FAC-… invoice.
//
// POST { token, lang } — no login: the customer holds the unguessable
// payment_token from the e-mail / invoice page (/facture/<token>).
//
// Decision (a) 2026-09-25: only the platform business
// (platform_settings.stripe_invoice_business_id) takes online payment.
// Stripe is a payment channel only — no Stripe Invoice document, no Stripe
// Tax: the amount charged is exactly invoices.total (VAT already computed on
// the internal, legally numbered invoice), in the invoice's currency.
//
// Errors (JSON { error }): stripe_not_configured / stripe_live_key_refused
// (503), bad_request (400), not_found (404), invoice_already_paid /
// invoice_not_payable / invoice_payment_processing (409),
// unsupported_currency (422), stripe_error (502).

import {
  SITE_URL, SUPPORTED_CURRENCIES, asLang, cors, json, paths, serviceClient, stripeOrError, toMinor,
} from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const s = stripeOrError();
  if ('error' in s) return s.error;
  const { stripe } = s;

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const token = typeof body?.token === 'string' ? body.token : '';
  const lang = asLang(body?.lang);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'bad_request' }, 400);

  const db = serviceClient();
  const [{ data: inv, error }, { data: bizId }] = await Promise.all([
    db.from('invoices')
      .select('id, business_id, number, status, currency, total, customer_party, stripe_checkout_session_id')
      .eq('payment_token', token).maybeSingle(),
    db.rpc('stripe_invoice_business_id'),
  ]);
  if (error) return json({ error: 'db_error' }, 500);
  if (!inv || inv.status === 'draft') return json({ error: 'not_found' }, 404);
  if (inv.status === 'paid') return json({ error: 'invoice_already_paid' }, 409);
  if (!bizId || inv.business_id !== bizId || !['issued', 'overdue'].includes(inv.status)) {
    return json({ error: 'invoice_not_payable' }, 409);
  }
  const currency = String(inv.currency).toLowerCase();
  if (!SUPPORTED_CURRENCIES.has(currency)) return json({ error: 'unsupported_currency' }, 422);
  const amount = toMinor(inv.total);
  if (amount <= 0) return json({ error: 'invoice_not_payable' }, 409);

  if (inv.stripe_checkout_session_id) {
    try {
      const prev = await stripe.checkout.sessions.retrieve(inv.stripe_checkout_session_id);
      if (prev.status === 'open' && prev.url) return json({ url: prev.url });
      if (prev.status === 'complete') return json({ error: 'invoice_payment_processing' }, 409);
    } catch (e) {
      console.warn('[invoice-payment] previous session not retrievable', String(e));
    }
  }

  const email = typeof inv.customer_party?.email === 'string' ? inv.customer_party.email.trim() : '';
  const back = `${SITE_URL}${paths.invoice(lang, token)}`;
  const label = lang === 'en' ? `Invoice ${inv.number}` : `Facture ${inv.number}`;
  const metadata = { kind: 'invoice', invoice_id: inv.id, invoice_number: String(inv.number) };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: inv.id,
      ...(email ? { customer_email: email } : {}),
      locale: lang,
      line_items: [{
        quantity: 1,
        price_data: { currency, unit_amount: amount, product_data: { name: label } },
      }],
      metadata,
      payment_intent_data: { metadata, description: label },
      success_url: `${back}?paiement=ok`,
      cancel_url:  `${back}?paiement=annule`,
    }, {
      idempotencyKey: `invoice:${inv.id}:${inv.stripe_checkout_session_id ?? 'first'}:${lang}`,
    });

    const { error: upErr } = await db.from('invoices')
      .update({ stripe_checkout_session_id: session.id }).eq('id', inv.id).in('status', ['issued', 'overdue']);
    if (upErr) console.error('[invoice-payment] could not store session id', upErr.message);
    return json({ url: session.url });
  } catch (e) {
    console.error('[invoice-payment] stripe error', String(e));
    return json({ error: 'stripe_error' }, 502);
  }
});
