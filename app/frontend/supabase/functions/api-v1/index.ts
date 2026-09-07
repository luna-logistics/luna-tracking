// Supabase Edge Function: api-v1
//
// The versioned public/partner API for Luna Tracking. A single Edge
// Function with an internal router keeps us on the free tier (Supabase
// bills per function, not per route) and gives us one place to enforce
// auth, logging, and response shape.
//
// verify_jwt = false — we do our own auth so we can accept either a
// Supabase JWT (`Authorization: Bearer <jwt>`, today's frontend) OR an
// API key (`Authorization: ApiKey <prefix>.<secret>`, prepared for the
// future in Phase 7). Public endpoints (health, tracking-by-token)
// skip the auth step entirely.
//
// Response envelope (every response):
//   Success →  { data, meta? }
//   Error   →  { error: { code, message, detail? } }
//
// Deploy:
//   supabase functions deploy api-v1 --project-ref <ref> --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const API_VERSION = 'v1';

// ─── Routing helpers ─────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Handler = (ctx: Ctx) => Promise<Response>;
type Ctx = {
  req: Request;
  path: string;              // normalized path, e.g. "/shipments/abc"
  segments: string[];        // path split by '/', empty entries removed
  method: Method;
  auth: Auth | null;         // filled by requireAuth() when needed
  supabase: SupabaseClient | null; // caller-scoped client (RLS honoured)
  rawAuthHeader: string | null;
};

type Auth =
  | { kind: 'jwt'; user_id: string }
  | { kind: 'api_key'; api_key_id: string; business_id: string; permissions: string[] };

/** Normalize the request path so the router does not care whether the
 *  function was invoked at /functions/v1/api-v1/... or /api-v1/... or
 *  directly at /health. */
function normalizePath(url: URL): string {
  let p = url.pathname;
  // Strip Supabase Functions prefix if present
  p = p.replace(/^\/functions\/v1/, '');
  // Strip our function slug so routes are declared relative
  p = p.replace(/^\/api-v1/, '');
  // Strip explicit /api/v1 if someone proxied us that way
  p = p.replace(/^\/api\/v1/, '');
  if (p === '' || p === '/') return '/';
  return p.replace(/\/+$/, '');
}

// ─── Auth ────────────────────────────────────────────────────────────

function parseAuthHeader(h: string | null): { scheme: string; value: string } | null {
  if (!h) return null;
  const [scheme, ...rest] = h.split(/\s+/);
  if (!scheme || rest.length === 0) return null;
  return { scheme: scheme.toLowerCase(), value: rest.join(' ') };
}

/** Extract auth from the request. Returns null when no credentials sent.
 *  Also returns a SupabaseClient scoped to the caller so RLS applies as
 *  it would in the browser. */
async function extractAuth(req: Request): Promise<{ auth: Auth | null; supabase: SupabaseClient | null }> {
  const raw = req.headers.get('Authorization');
  const parsed = parseAuthHeader(raw);
  if (!parsed) return { auth: null, supabase: null };

  if (parsed.scheme === 'bearer') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: raw! } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { auth: null, supabase };
    return { auth: { kind: 'jwt', user_id: user.id }, supabase };
  }

  // ApiKey scheme is reserved for Phase 7 — recognized here so callers
  // fail with 401 rather than a mislabelled 400 once keys ship.
  if (parsed.scheme === 'apikey') {
    return { auth: null, supabase: null };
  }

  return { auth: null, supabase: null };
}

// ─── Response helpers ────────────────────────────────────────────────

function ok(data: unknown, meta?: Record<string, unknown>, status = 200): Response {
  const body: Record<string, unknown> = { data };
  if (meta) body.meta = meta;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Api-Version': API_VERSION, ...CORS },
  });
}
function fail(code: string, message: string, status = 400, detail?: unknown): Response {
  return new Response(JSON.stringify({ error: { code, message, detail } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Api-Version': API_VERSION, ...CORS },
  });
}

// ─── Endpoint handlers ───────────────────────────────────────────────

const health: Handler = async () => {
  return ok({
    status: 'ok',
    version: API_VERSION,
    time: new Date().toISOString(),
  });
};

const me: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  if (ctx.auth.kind !== 'jwt') return fail('unauthorized', 'JWT required for this endpoint', 401);

  const { data: memberships } = await ctx.supabase
    .from('business_members').select('business_id, role, joined_at');
  const businessIds = (memberships ?? []).map((m: any) => m.business_id);
  let businesses: any[] = [];
  if (businessIds.length > 0) {
    const { data } = await ctx.supabase
      .from('businesses').select('id, name, country, currency').in('id', businessIds);
    businesses = data ?? [];
  }
  return ok({ user_id: ctx.auth.user_id, businesses, memberships: memberships ?? [] });
};

const listShipments: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  const url = new URL(ctx.req.url);
  const businessId = url.searchParams.get('business_id');
  if (!businessId) return fail('missing_param', 'business_id query parameter is required', 400);
  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 50);
  const status = url.searchParams.get('status');

  let q = ctx.supabase.from('shipments')
    .select('id, reference, status, direction, mode, currency, origin_city, origin_country, destination_city, destination_country, estimated_delivery, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return fail('db_error', error.message, 500);
  return ok(data ?? [], { count: data?.length ?? 0, limit });
};

const getShipment: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  const id = ctx.segments[1];
  if (!isUuid(id)) return fail('bad_id', 'invalid shipment id', 400);
  const { data, error } = await ctx.supabase.from('shipments').select('*').eq('id', id).maybeSingle();
  if (error) return fail('db_error', error.message, 500);
  if (!data) return fail('not_found', 'shipment not found', 404);
  return ok(data);
};

const listCustomers: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  const url = new URL(ctx.req.url);
  const businessId = url.searchParams.get('business_id');
  if (!businessId) return fail('missing_param', 'business_id query parameter is required', 400);
  const limit = clampInt(url.searchParams.get('limit'), 1, 200, 100);
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  let q = ctx.supabase.from('business_customers')
    .select('id, display_name, kind, email, phone, city, country, is_active, created_at')
    .eq('business_id', businessId)
    .order('display_name', { ascending: true })
    .limit(limit);
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return fail('db_error', error.message, 500);
  return ok(data ?? [], { count: data?.length ?? 0, limit });
};

const getCustomer: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  const id = ctx.segments[1];
  if (!isUuid(id)) return fail('bad_id', 'invalid customer id', 400);
  const { data, error } = await ctx.supabase.from('business_customers').select('*').eq('id', id).maybeSingle();
  if (error) return fail('db_error', error.message, 500);
  if (!data) return fail('not_found', 'customer not found', 404);
  return ok(data);
};

/** Rate calculator — public, backed by calculate_rates() RPC. Only
 *  ever returns curated customer-facing pricing. Internal costs and
 *  markup details stay in Postgres and never cross this boundary. */
const rates: Handler = async (ctx) => {
  const url = new URL(ctx.req.url);
  const origin = url.searchParams.get('origin');
  const destination = url.searchParams.get('destination');
  const mode = url.searchParams.get('mode');
  const weight = parseFloat(url.searchParams.get('weight_kg') || '0');
  const volume = parseFloat(url.searchParams.get('volume_m3') || '0');

  if (!origin || origin.length !== 2) return fail('missing_param', 'origin (2-letter ISO country code) is required', 400);
  if (!destination || destination.length !== 2) return fail('missing_param', 'destination (2-letter ISO country code) is required', 400);
  if (mode && !['air','sea','road','rail','multi'].includes(mode)) return fail('bad_mode', 'mode must be one of air, sea, road, rail, multi', 400);
  if (!Number.isFinite(weight) || weight < 0) return fail('bad_weight', 'weight_kg must be a non-negative number', 400);
  if (!Number.isFinite(volume) || volume < 0) return fail('bad_volume', 'volume_m3 must be a non-negative number', 400);
  if (weight === 0 && volume === 0) return fail('missing_param', 'weight_kg or volume_m3 must be > 0', 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data, error } = await supabase.rpc('calculate_rates', {
    p_origin_country: origin.toUpperCase(),
    p_destination_country: destination.toUpperCase(),
    p_mode: mode,
    p_weight_kg: weight,
    p_volume_m3: volume,
  });
  if (error) return fail('db_error', error.message, 500);
  return ok(data ?? [], { count: (data ?? []).length });
};

/** Public tracking — no auth. Token grants read; RPC enforces
 *  tracking_enabled and returns null otherwise (mapped to 404 here). */
const publicTracking: Handler = async (ctx) => {
  const token = ctx.segments[1];
  if (!isUuid(token)) return fail('bad_token', 'invalid tracking token', 400);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data, error } = await supabase.rpc('get_public_shipment', { p_token: token });
  if (error) return fail('db_error', error.message, 500);
  if (!data) return fail('not_found', 'tracking link not found or expired', 404);
  return ok(data);
};

// ─── Router ──────────────────────────────────────────────────────────

type Route = { method: Method; match: (segments: string[]) => boolean; handler: Handler };

const routes: Route[] = [
  { method: 'GET', match: (s) => s.length === 1 && s[0] === 'health',                   handler: health },
  { method: 'GET', match: (s) => s.length === 1 && s[0] === 'me',                       handler: me },
  { method: 'GET', match: (s) => s.length === 1 && s[0] === 'shipments',                handler: listShipments },
  { method: 'GET', match: (s) => s.length === 2 && s[0] === 'shipments' && isUuid(s[1]), handler: getShipment },
  { method: 'GET', match: (s) => s.length === 1 && s[0] === 'customers',                handler: listCustomers },
  { method: 'GET', match: (s) => s.length === 2 && s[0] === 'customers' && isUuid(s[1]), handler: getCustomer },
  { method: 'GET', match: (s) => s.length === 2 && s[0] === 'tracking' && isUuid(s[1]),  handler: publicTracking },
  { method: 'GET', match: (s) => s.length === 1 && s[0] === 'rates',                     handler: rates },
];

// ─── Entrypoint ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = normalizePath(url);
  const segments = path.split('/').filter(Boolean);
  const method = req.method.toUpperCase() as Method;

  // Root discovery — helpful when someone hits the function URL bare.
  if (segments.length === 0) {
    return ok({
      name: 'Luna Tracking API',
      version: API_VERSION,
      docs: null,
      endpoints: routes.map((r) => `${r.method} /${describeRoute(r)}`),
    });
  }

  const route = routes.find((r) => r.method === method && r.match(segments));
  if (!route) return fail('not_found', `no route for ${method} ${path}`, 404);

  const { auth, supabase } = await extractAuth(req);
  const ctx: Ctx = {
    req, path, segments, method, auth, supabase,
    rawAuthHeader: req.headers.get('Authorization'),
  };

  try {
    return await route.handler(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail('internal', 'unexpected error', 500, message);
  }
});

// ─── Small utilities ─────────────────────────────────────────────────

function isUuid(s: string | undefined): s is string {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
function clampInt(v: string | null, min: number, max: number, def: number): number {
  const n = v == null ? def : parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
function describeRoute(r: Route): string {
  // Cheap human label — good enough for a discovery listing.
  const src = r.match.toString();
  if (src.includes("=== 'shipments'"))  return src.includes('length === 2') ? 'shipments/:id' : 'shipments';
  if (src.includes("=== 'customers'"))  return src.includes('length === 2') ? 'customers/:id' : 'customers';
  if (src.includes("=== 'tracking'"))   return 'tracking/:token';
  if (src.includes("=== 'rates'"))      return 'rates?origin=..&destination=..&mode=..&weight_kg=..&volume_m3=..';
  if (src.includes("=== 'health'"))     return 'health';
  if (src.includes("=== 'me'"))         return 'me';
  return '(unknown)';
}
