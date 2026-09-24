// Shared Stripe plumbing for create-checkout-session, create-invoice-payment
// and stripe-webhook.
//
// Secrets (Supabase function secrets, never in code):
//   STRIPE_SECRET_KEY      sk_test_… — a live key is REFUSED unless
//                          STRIPE_ALLOW_LIVE=true is also set (TEST mode only
//                          until the production go-ahead).
//   STRIPE_WEBHOOK_SECRET  whsec_… — without it the webhook answers 503 and
//                          processes nothing (inactive by design).

import Stripe from 'npm:stripe@17.7.0';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
export const SITE_URL     = (Deno.env.get('SITE_URL') ?? 'https://lunatrackinglogistics.com').replace(/\/$/, '');

export const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/** Returns a Stripe client, or a ready-made error Response when the key is
 *  missing or is a live key while live mode has not been authorised. */
export function stripeOrError(): { stripe: Stripe } | { error: Response } {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (!key) return { error: json({ error: 'stripe_not_configured' }, 503) };
  const live = /^(sk|rk)_live_/.test(key);
  if (live && Deno.env.get('STRIPE_ALLOW_LIVE') !== 'true') {
    return { error: json({ error: 'stripe_live_key_refused' }, 503) };
  }
  return { stripe: new Stripe(key, { httpClient: Stripe.createFetchHttpClient() }) };
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/** Stripe amounts are integer minor units. EUR/USD both have 2 decimals. */
export function toMinor(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export const SUPPORTED_CURRENCIES = new Set(['eur', 'usd']);

export type Lang = 'fr' | 'en';
export const asLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'fr');

/** Public site paths (FR at the root, EN under /en) — keep in sync with the
 *  route registry (src/lib/url/routes). */
export const paths = {
  accountOrders: (l: Lang) => (l === 'en' ? '/en/account/orders' : '/compte/commandes'),
  invoice: (l: Lang, token: string) => (l === 'en' ? `/en/invoice/${token}` : `/facture/${token}`),
};
