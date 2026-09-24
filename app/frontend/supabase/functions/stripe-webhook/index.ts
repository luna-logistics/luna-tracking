// stripe-webhook — the ONLY writer of "paid" for online payments.
//
// Deploy with --no-verify-jwt (Stripe does not send a Supabase JWT); the
// authentication is Stripe's signature, verified strictly on the raw body
// with STRIPE_WEBHOOK_SECRET. No secret → 503, nothing processed (inactive
// until the secrets are set). Bad or missing signature → 400.
//
// Idempotency: every event id is claimed in public.stripe_events before any
// write (claim_stripe_event); a redelivered or concurrent event is applied
// at most once. A transient failure returns 500 so Stripe retries, and the
// 'failed' row is reclaimable.
//
// Events:
//   checkout.session.completed            paid now (card, Bancontact…) → settle
//                                         unpaid (async method) → wait
//   checkout.session.async_payment_succeeded → settle
//   checkout.session.async_payment_failed    → recorded, order/invoice untouched
//   anything else                            → recorded as ignored
//
// Settling re-checks the amount and currency against the database (order
// total / invoice total). A mismatch is NEVER marked paid: the event is
// recorded as failed with the detail, for the office to look at.

import type Stripe from 'npm:stripe@17.7.0';
import { cryptoProvider, json, serviceClient, stripeOrError, toMinor } from '../_shared/stripe.ts';

type Outcome = { status: 'processed' | 'ignored' | 'failed'; detail: string | null };

const brusselsToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });

// deno-lint-ignore no-explicit-any
async function settle(db: any, session: Stripe.Checkout.Session): Promise<Outcome> {
  const kind = session.metadata?.kind;
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  const paidMinor = session.amount_total ?? -1;
  const currency = (session.currency ?? '').toLowerCase();

  if (kind === 'order') {
    const id = session.metadata?.order_id ?? '';
    const { data: o, error } = await db.from('orders').select('id, total, status').eq('id', id).maybeSingle();
    if (error) throw new Error(`order read: ${error.message}`);
    if (!o) return { status: 'failed', detail: `order ${id} not found` };
    if (currency !== 'eur' || paidMinor !== toMinor(o.total)) {
      return { status: 'failed', detail: `amount mismatch on order ${id}: paid ${paidMinor} ${currency}, expected ${toMinor(o.total)} eur` };
    }
    if (o.status !== 'pending_payment') {
      return o.status === 'cancelled'
        ? { status: 'failed', detail: `order ${id} was cancelled but got paid (${session.id}) — refund or reinstate` }
        : { status: 'processed', detail: `order ${id} already ${o.status}` };
    }
    const { error: upErr } = await db.from('orders').update({
      status: 'paid', paid_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id, stripe_payment_intent_id: paymentIntent,
    }).eq('id', id).eq('status', 'pending_payment');
    if (upErr) throw new Error(`order update: ${upErr.message}`);
    return { status: 'processed', detail: `order ${id} paid` };
  }

  if (kind === 'invoice') {
    const id = session.metadata?.invoice_id ?? '';
    const [{ data: inv, error }, { data: bizId }] = await Promise.all([
      db.from('invoices').select('id, business_id, number, currency, total, status').eq('id', id).maybeSingle(),
      db.rpc('stripe_invoice_business_id'),
    ]);
    if (error) throw new Error(`invoice read: ${error.message}`);
    if (!inv) return { status: 'failed', detail: `invoice ${id} not found` };
    if (inv.business_id !== bizId) return { status: 'failed', detail: `invoice ${inv.number} is not the platform business's` };
    if (currency !== String(inv.currency).toLowerCase() || paidMinor !== toMinor(inv.total)) {
      return { status: 'failed', detail: `amount mismatch on ${inv.number}: paid ${paidMinor} ${currency}, expected ${toMinor(inv.total)} ${inv.currency}` };
    }
    if (inv.status === 'paid') return { status: 'processed', detail: `${inv.number} already paid` };
    if (inv.status === 'cancelled') {
      return { status: 'failed', detail: `${inv.number} was cancelled but got paid (${session.id}) — refund` };
    }
    const { error: upErr } = await db.from('invoices').update({
      status: 'paid', paid_on: brusselsToday(), paid_via: 'stripe',
      stripe_checkout_session_id: session.id, stripe_payment_intent_id: paymentIntent,
    }).eq('id', id).in('status', ['issued', 'overdue']);
    if (upErr) throw new Error(`invoice update: ${upErr.message}`);
    return { status: 'processed', detail: `${inv.number} paid` };
  }

  return { status: 'ignored', detail: `session ${session.id} has no known metadata.kind` };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!secret) return json({ error: 'webhook_not_configured' }, 503);
  const s = stripeOrError();
  if ('error' in s) return s.error;
  const { stripe } = s;

  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'missing_signature' }, 400);
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret, undefined, cryptoProvider);
  } catch (e) {
    console.warn('[stripe-webhook] signature rejected', String(e));
    return json({ error: 'bad_signature' }, 400);
  }

  const db = serviceClient();
  const { data: claimed, error: claimErr } = await db.rpc('claim_stripe_event', {
    p_id: event.id, p_type: event.type, p_livemode: event.livemode,
  });
  if (claimErr) return json({ error: 'claim_failed' }, 500);
  if (!claimed) return json({ received: true, duplicate: true });

  const finish = (o: Outcome) => db.rpc('finish_stripe_event', { p_id: event.id, p_status: o.status, p_detail: o.detail });

  if (event.livemode && Deno.env.get('STRIPE_ALLOW_LIVE') !== 'true') {
    await finish({ status: 'ignored', detail: 'live event refused (TEST mode only)' });
    return json({ received: true, ignored: true });
  }

  try {
    let outcome: Outcome;
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        outcome = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
          ? await settle(db, session)
          : { status: 'processed', detail: `session ${session.id} awaiting async payment` };
        break;
      }
      case 'checkout.session.async_payment_succeeded':
        outcome = await settle(db, event.data.object as Stripe.Checkout.Session);
        break;
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        outcome = { status: 'processed', detail: `async payment failed for ${session.metadata?.kind} ${session.metadata?.order_id ?? session.metadata?.invoice_id}` };
        break;
      }
      default:
        outcome = { status: 'ignored', detail: null };
    }
    await finish(outcome);
    if (outcome.status === 'failed') console.error('[stripe-webhook] needs attention', event.id, outcome.detail);
    return json({ received: true, status: outcome.status });
  } catch (e) {
    const detail = String((e as Error).message ?? e).slice(0, 500);
    await finish({ status: 'failed', detail });
    console.error('[stripe-webhook] processing error', event.id, detail);
    return json({ error: 'processing_failed' }, 500);   // Stripe will retry
  }
});
