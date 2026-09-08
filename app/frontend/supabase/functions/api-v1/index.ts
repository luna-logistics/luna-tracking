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

// ─── OpenAPI 3.1 spec ────────────────────────────────────────────────
// Machine-readable contract, hand-maintained alongside the handlers.
// If you add / remove / change a route in this file, update this too.
const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Luna Tracking API',
    version: '1.0.0',
    summary: 'Freight logistics API for Luna Tracking Logistics.',
    description: 'Read-only public API today (shipments, quotes, rates, tracking, usage). Write endpoints, webhooks setup via API, and paid tiers are on the roadmap. Documentation: https://lunatrackinglogistics.com/docs/api',
    contact: { name: 'Luna Tracking Logistics', email: 'info@lunatrackinglogistics.be', url: 'https://lunatrackinglogistics.com/contact' },
    license: { name: 'Proprietary', url: 'https://lunatrackinglogistics.com/mentions-legales' },
  },
  servers: [
    { url: 'https://zlpzajjfzezjildvchoz.functions.supabase.co/api-v1', description: 'Production' },
  ],
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  tags: [
    { name: 'System', description: 'Health & discovery.' },
    { name: 'Account', description: 'Caller identity.' },
    { name: 'Shipments', description: 'Shipment records (business-scoped).' },
    { name: 'Customers', description: 'B2B customer address book (business-scoped).' },
    { name: 'Rates', description: 'Public rate calculator.' },
    { name: 'Tracking', description: 'Public shipment tracking by opt-in token.' },
    { name: 'Usage', description: 'API call telemetry (business-scoped).' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Supabase JWT session token — for interactive user calls.',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Long-lived key: `ApiKey lk_live_<prefix>.<secret>` — generated at /entreprise/cles-api.',
      },
    },
    responses: {
      Unauthorized: { description: 'Missing or invalid credentials.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Credentials valid but insufficient scope.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource does not exist or is not visible.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      BadRequest: { description: 'Invalid parameter.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
    parameters: {
      BusinessId: { name: 'business_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' },
        description: 'The business the request is scoped to. Ignored for ApiKey callers (locked to key\'s business).' },
      Limit100: { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
    },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: {
        error: { type: 'object', required: ['code', 'message'], properties: {
          code: { type: 'string', examples: ['unauthorized'] },
          message: { type: 'string' },
          detail: {},
        } },
      } },
      Health: { type: 'object', properties: {
        data: { type: 'object', properties: {
          status: { type: 'string', enum: ['ok'] },
          version: { type: 'string', enum: ['v1'] },
          time: { type: 'string', format: 'date-time' },
        } } } },
      Me: { type: 'object', properties: {
        data: { type: 'object', properties: {
          user_id: { type: 'string', format: 'uuid' },
          businesses: { type: 'array', items: { $ref: '#/components/schemas/BusinessSummary' } },
          memberships: { type: 'array', items: { type: 'object', properties: {
            business_id: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['owner','admin','manager','accounting','operations','viewer'] },
            joined_at: { type: 'string', format: 'date-time' },
          } } },
        } } } },
      BusinessSummary: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        country: { type: 'string', minLength: 2, maxLength: 2 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
      } },
      ShipmentSummary: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' },
        reference: { type: 'string', examples: ['SHP-2026-00042'] },
        status: { type: 'string', enum: ['draft','quoted','booked','received','in_transit','customs','delivered','cancelled'] },
        direction: { type: 'string', enum: ['export','import','domestic'] },
        mode: { type: 'string', enum: ['air','sea','road','rail','multi'] },
        currency: { type: 'string' },
        origin_city: { type: 'string', nullable: true },
        origin_country: { type: 'string', nullable: true },
        destination_city: { type: 'string', nullable: true },
        destination_country: { type: 'string', nullable: true },
        estimated_delivery: { type: 'string', format: 'date', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
      } },
      Customer: { type: 'object', properties: {
        id: { type: 'string', format: 'uuid' },
        display_name: { type: 'string' },
        kind: { type: 'string', enum: ['individual','company'] },
        email: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        city: { type: 'string', nullable: true },
        country: { type: 'string', nullable: true },
        is_active: { type: 'boolean' },
        created_at: { type: 'string', format: 'date-time' },
      } },
      Rate: { type: 'object', properties: {
        provider_code: { type: 'string' },
        provider_name: { type: 'string' },
        service_mode: { type: 'string', enum: ['air','sea','road','rail','multi'] },
        currency: { type: 'string' },
        customer_price: { type: 'number' },
        transit_days_min: { type: 'integer', nullable: true },
        transit_days_max: { type: 'integer', nullable: true },
      } },
      PublicTracking: { type: 'object', properties: {
        reference: { type: 'string' },
        status: { type: 'string' },
        direction: { type: 'string' },
        mode: { type: 'string' },
        carrier_name: { type: 'string', nullable: true },
        tracking_number: { type: 'string', nullable: true },
        origin_city: { type: 'string', nullable: true },
        origin_country: { type: 'string', nullable: true },
        destination_city: { type: 'string', nullable: true },
        destination_country: { type: 'string', nullable: true },
        estimated_pickup: { type: 'string', format: 'date', nullable: true },
        estimated_delivery: { type: 'string', format: 'date', nullable: true },
        actual_pickup: { type: 'string', format: 'date', nullable: true },
        actual_delivery: { type: 'string', format: 'date', nullable: true },
        package_count: { type: 'integer' },
        total_weight_kg: { type: 'number', nullable: true },
        events: { type: 'array', items: { type: 'object', properties: {
          kind: { type: 'string' },
          from_status: { type: 'string', nullable: true },
          to_status: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        } } },
      } },
      UsageSummary: { type: 'object', description: 'Full shape at /docs/api (business_api_usage).' },
    },
  },
  paths: {
    '/': { get: { tags: ['System'], summary: 'Discovery', description: 'Lists all endpoints for humans and reflective tools.', security: [],
      responses: { '200': { description: 'OK', content: { 'application/json': {} } } } } },
    '/health': { get: { tags: ['System'], summary: 'Liveness probe', security: [],
      responses: { '200': { description: 'Alive', content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } } } } } },
    '/openapi.json': { get: { tags: ['System'], summary: 'This document', security: [],
      responses: { '200': { description: 'OpenAPI 3.1 spec', content: { 'application/json': {} } } } } },
    '/me': { get: { tags: ['Account'], summary: 'Caller identity + businesses', security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Me' } } } },
        '401': { $ref: '#/components/responses/Unauthorized' } } } },
    '/shipments': { get: { tags: ['Shipments'], summary: 'List shipments',
      parameters: [
        { $ref: '#/components/parameters/BusinessId' },
        { $ref: '#/components/parameters/Limit100' },
        { name: 'status', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/ShipmentSummary' } },
          meta: { type: 'object', properties: { count: { type: 'integer' }, limit: { type: 'integer' } } },
        } } } } },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' } } } },
    '/shipments/{id}': { get: { tags: ['Shipments'], summary: 'Get a shipment by id',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'OK', content: { 'application/json': {} } },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { $ref: '#/components/responses/NotFound' } } } },
    '/customers': { get: { tags: ['Customers'], summary: 'List customers',
      parameters: [
        { $ref: '#/components/parameters/BusinessId' },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 100 } },
        { name: 'include_inactive', in: 'query', schema: { type: 'boolean', default: false } },
      ],
      responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Customer' } },
        meta: { type: 'object' },
      } } } } } } } },
    '/customers/{id}': { get: { tags: ['Customers'], summary: 'Get a customer by id',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'OK', content: { 'application/json': {} } },
        '404': { $ref: '#/components/responses/NotFound' } } } },
    '/rates': { get: { tags: ['Rates'], summary: 'Freight rate calculator', security: [],
      parameters: [
        { name: 'origin',      in: 'query', required: true, schema: { type: 'string', minLength: 2, maxLength: 2 }, description: 'ISO 3166-1 alpha-2 country code.' },
        { name: 'destination', in: 'query', required: true, schema: { type: 'string', minLength: 2, maxLength: 2 } },
        { name: 'mode',        in: 'query', schema: { type: 'string', enum: ['air','sea','road','rail','multi'] } },
        { name: 'weight_kg',   in: 'query', schema: { type: 'number', minimum: 0 } },
        { name: 'volume_m3',   in: 'query', schema: { type: 'number', minimum: 0 } },
      ],
      responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Rate' } },
        meta: { type: 'object' },
      } } } } } } } },
    '/tracking/{token}': { get: { tags: ['Tracking'], summary: 'Public shipment tracking by opt-in token', security: [],
      parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: {
          data: { $ref: '#/components/schemas/PublicTracking' } } } } } },
        '404': { $ref: '#/components/responses/NotFound' } } } },
    '/legacy-tracking/{code}': { get: { tags: ['Tracking'], summary: 'Legacy tracking bridge (FileMaker Data API)',
      description: 'Reads Luna\'s pre-platform tracking data from the legacy FileMaker Server and returns a normalized JSON payload (raw positions + parsed structured events). Public — no auth. The 12-character alphanum codes issued before Luna Tracking launched keep working here.',
      security: [],
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9]{4,32}$' } }],
      responses: {
        '200': { description: 'OK', content: { 'application/json': {} } },
        '400': { $ref: '#/components/responses/BadRequest' },
        '404': { $ref: '#/components/responses/NotFound' },
        '502': { description: 'Upstream FileMaker error' },
        '503': { description: 'Upstream session dropped — retry once' } } } },
    '/usage/summary': { get: { tags: ['Usage'], summary: 'Aggregated API usage',
      parameters: [
        { $ref: '#/components/parameters/BusinessId' },
        { name: 'range', in: 'query', schema: { type: 'string', enum: ['24h','7d','30d'], default: '7d' } },
      ],
      responses: { '200': { description: 'OK', content: { 'application/json': {} } } } } },
  },
};

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

  if (parsed.scheme === 'apikey') {
    // Verify via SECURITY DEFINER RPC (safe for anon). Returns the
    // matching (api_key_id, business_id, permissions) row when the key
    // is valid and not revoked.
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data } = await anon.rpc('verify_api_key', { p_full_key: parsed.value });
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) return { auth: null, supabase: null };
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // If a service-role key is set (Phase 7 wiring), scope reads to the
    // business via a service client. Without one we still authenticate
    // the caller but reads that need row-level filtering fall back to
    // the anon client with an explicit business_id filter in the query.
    const supabase = service
      ? createClient(Deno.env.get('SUPABASE_URL')!, service)
      : anon;
    return {
      auth: {
        kind: 'api_key',
        api_key_id: row.api_key_id,
        business_id: row.business_id,
        permissions: (row.permissions ?? []) as string[],
      },
      supabase,
    };
  }

  return { auth: null, supabase: null };
}

/** Fire-and-forget log entry. Never throws so a slow logger can't
 *  make the API request itself fail. */
function logCall(
  auth: Auth | null,
  method: string,
  path: string,
  status: number,
  elapsedMs: number,
): void {
  try {
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    void anon.rpc('log_api_call', {
      p_api_key_id: auth?.kind === 'api_key' ? auth.api_key_id : null,
      p_business_id: auth?.kind === 'api_key' ? auth.business_id : null,
      p_method: method,
      p_path: path,
      p_status: status,
      p_response_ms: elapsedMs,
    }).then(() => {}, () => {});
  } catch { /* ignore */ }
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

/** OpenAPI 3.1 spec — served as JSON. Consumers paste this URL into
 *  Postman / Insomnia / Bruno / Hoppscotch / editor.swagger.io / any
 *  OpenAPI-based SDK generator. Content-Type is application/json (not
 *  the envelope wrapper — this is a well-known standard shape). */
const openapi: Handler = async () => {
  return new Response(JSON.stringify(OPENAPI_SPEC, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Api-Version': API_VERSION, ...CORS },
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
  const scoped = resolveBusinessId(ctx, url.searchParams.get('business_id'));
  if ('response' in scoped) return scoped.response;
  const businessId = scoped.businessId;
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
  let q = ctx.supabase.from('shipments').select('*').eq('id', id);
  // API-key auth uses a service-role client; RLS is bypassed, so
  // enforce the business scope explicitly.
  if (ctx.auth.kind === 'api_key') q = q.eq('business_id', ctx.auth.business_id);
  const { data, error } = await q.maybeSingle();
  if (error) return fail('db_error', error.message, 500);
  if (!data) return fail('not_found', 'shipment not found', 404);
  return ok(data);
};

const listCustomers: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  const url = new URL(ctx.req.url);
  const scoped = resolveBusinessId(ctx, url.searchParams.get('business_id'));
  if ('response' in scoped) return scoped.response;
  const businessId = scoped.businessId;
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
  let q = ctx.supabase.from('business_customers').select('*').eq('id', id);
  if (ctx.auth.kind === 'api_key') q = q.eq('business_id', ctx.auth.business_id);
  const { data, error } = await q.maybeSingle();
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

/** Usage summary — authenticated only. Returns totals + timeline +
 *  per-endpoint + per-key breakdown for the given range. Same shape
 *  the /entreprise/cles-api/usage page uses (dogfooding). */
const usageSummary: Handler = async (ctx) => {
  if (!ctx.auth || !ctx.supabase) return fail('unauthorized', 'authentication required', 401);
  const url = new URL(ctx.req.url);
  const scoped = resolveBusinessId(ctx, url.searchParams.get('business_id'));
  if ('response' in scoped) return scoped.response;
  const businessId = scoped.businessId;

  const range = url.searchParams.get('range') ?? '7d';
  const now = new Date();
  const since = new Date(now);
  let bucket: 'hour' | 'day' = 'day';
  if (range === '24h') { since.setHours(since.getHours() - 24); bucket = 'hour'; }
  else if (range === '30d') { since.setDate(since.getDate() - 30); bucket = 'day'; }
  else { since.setDate(since.getDate() - 7); bucket = 'day'; }

  const { data, error } = await ctx.supabase.rpc('get_api_usage', {
    p_business: businessId,
    p_since: since.toISOString(),
    p_until: now.toISOString(),
    p_bucket: bucket,
  });
  if (error) return fail('db_error', error.message, 500);
  return ok(data);
};

/** Legacy tracking bridge — proxies to Luna's FileMaker Server so
 *  the historical tracking codes (12-char alphanum like 2DDXCPG6PXP8)
 *  keep working while new shipments migrate to the native Luna
 *  tracking (UUID tokens via /tracking/:token). FileMaker credentials
 *  live only in server env (FILEMAKER_PASSWORD); the browser never
 *  sees them.
 *
 *  Session token is cached in Edge Function memory for ~14 min to
 *  avoid a login round-trip per call. FileMaker Server times out
 *  inactive sessions at 15 min so we refresh before that. */

const FM_BASE = 'https://a0712525.fmphost.com/fmi/data/vLatest/databases/MPC_COLISAGE';
const FM_USER = 'sensomedia';
type FmSession = { token: string; expires_at: number };
let fmSession: FmSession | null = null;

async function fmOpenSession(): Promise<string> {
  const now = Date.now();
  if (fmSession && fmSession.expires_at > now + 30_000) return fmSession.token;
  const password = Deno.env.get('FILEMAKER_PASSWORD');
  if (!password) throw new Error('filemaker_password_not_configured');
  const basic = btoa(`${FM_USER}:${password}`);
  const res = await fetch(`${FM_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`filemaker_login_failed_${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json() as { response?: { token?: string } };
  const token = data.response?.token;
  if (!token) throw new Error('filemaker_login_no_token');
  fmSession = { token, expires_at: now + 14 * 60_000 };
  return token;
}

/** Turn "Colis livré le 19-08-2026 à 22:56:43" into { kind, occurred_at,
 *  city? } — best-effort parse, falls back to a note-kind event with
 *  the raw string when the pattern is unknown. */
function parseFmLibelle(libelle: string): {
  kind: 'picked_up' | 'in_transit' | 'delivered' | 'note';
  occurred_at: string | null;
  origin_city?: string | null;
  destination_city?: string | null;
  raw: string;
} {
  const dateRe = /(\d{2})-(\d{2})-(\d{4})(?:\s+à\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/;
  const parseDate = (s: string): string | null => {
    const m = s.match(dateRe);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  };
  const occurred_at = parseDate(libelle);

  let m = libelle.match(/Remise du colis[^]*?de\s+([A-ZÀ-ɏ\s-]+?)\s+le/i);
  if (m) {
    return { kind: 'picked_up', occurred_at, origin_city: m[1].trim(), raw: libelle };
  }
  m = libelle.match(/Colis en Transit depuis\s+([A-ZÀ-ɏ\s-]+?)\s+vers\s+([A-ZÀ-ɏ\s-]+?)\s+le/i);
  if (m) {
    return { kind: 'in_transit', occurred_at, origin_city: m[1].trim(), destination_city: m[2].trim(), raw: libelle };
  }
  if (/Colis livr[eé]/i.test(libelle)) {
    return { kind: 'delivered', occurred_at, raw: libelle };
  }
  return { kind: 'note', occurred_at, raw: libelle };
}

const legacyTracking: Handler = async (ctx) => {
  const code = ctx.segments[1];
  if (!code || !/^[A-Za-z0-9]{4,32}$/.test(code)) {
    return fail('bad_code', 'invalid tracking code', 400);
  }

  let token: string;
  try {
    token = await fmOpenSession();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'filemaker_password_not_configured') {
      return fail('server_misconfigured', 'FILEMAKER_PASSWORD not set on the edge function', 500);
    }
    return fail('upstream_error', 'could not authenticate to legacy tracking system', 502, msg);
  }

  const findRes = await fetch(`${FM_BASE}/layouts/joomla/_find`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: [{ 'internet_tracking_mot_de_passe': `==${code.toUpperCase()}` }],
    }),
  });

  // 401 → token was rotated / expired between fetches; drop cache and let the caller retry.
  if (findRes.status === 401) {
    fmSession = null;
    return fail('upstream_auth_lost', 'legacy tracking session dropped — retry', 503);
  }

  // 404 from FileMaker means "no matching record" — that's a legit "not found" for us.
  if (findRes.status === 404) {
    return fail('not_found', 'tracking code not found', 404);
  }

  if (!findRes.ok) {
    const detail = await findRes.text().catch(() => '');
    return fail('upstream_error', `legacy tracking returned ${findRes.status}`, 502, detail.slice(0, 200));
  }

  const body = await findRes.json() as {
    response?: { data?: Array<{ fieldData?: Record<string, unknown> }> };
    messages?: Array<{ code?: string; message?: string }>;
  };
  const rows = body.response?.data ?? [];
  if (rows.length === 0) return fail('not_found', 'tracking code not found', 404);

  const positions = rows.map((r) => {
    const fd = r.fieldData ?? {};
    return {
      numero_colis: String(fd.numero_colis ?? ''),
      libelle: String(fd.libelle ?? ''),
    };
  });
  const events = positions.map((p) => ({ ...parseFmLibelle(p.libelle), numero_colis: p.numero_colis }));

  return ok({
    tracking_code: code.toUpperCase(),
    tracking_number: positions[0]?.numero_colis || null,
    source: 'legacy',
    positions,   // raw shape for the current /suivi page
    events,      // structured shape for future SDKs and richer UIs
  });
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
  { method: 'GET', match: (s) => s.length === 2 && s[0] === 'legacy-tracking' && /^[A-Za-z0-9]{4,32}$/.test(s[1]), handler: legacyTracking },
  { method: 'GET', match: (s) => s.length === 1 && s[0] === 'rates',                     handler: rates },
  { method: 'GET', match: (s) => s.length === 2 && s[0] === 'usage' && s[1] === 'summary', handler: usageSummary },
  { method: 'GET', match: (s) => s.length === 1 && (s[0] === 'openapi.json' || s[0] === 'openapi'), handler: openapi },
];

// ─── Entrypoint ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const started = Date.now();
  const url = new URL(req.url);
  const path = normalizePath(url);
  const segments = path.split('/').filter(Boolean);
  const method = req.method.toUpperCase() as Method;

  const finish = (auth: Auth | null, res: Response): Response => {
    logCall(auth, method, path, res.status, Date.now() - started);
    return res;
  };

  // Root discovery — helpful when someone hits the function URL bare.
  if (segments.length === 0) {
    return finish(null, ok({
      name: 'Luna Tracking API',
      version: API_VERSION,
      docs: null,
      endpoints: routes.map((r) => `${r.method} /${describeRoute(r)}`),
    }));
  }

  const route = routes.find((r) => r.method === method && r.match(segments));
  if (!route) return finish(null, fail('not_found', `no route for ${method} ${path}`, 404));

  const { auth, supabase } = await extractAuth(req);
  const ctx: Ctx = {
    req, path, segments, method, auth, supabase,
    rawAuthHeader: req.headers.get('Authorization'),
  };

  try {
    const res = await route.handler(ctx);
    return finish(auth, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return finish(auth, fail('internal', 'unexpected error', 500, message));
  }
});

// ─── Small utilities ─────────────────────────────────────────────────

function isUuid(s: string | undefined): s is string {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
/** Resolve business_id for a scoped list/query. An ApiKey caller is
 *  locked to its own business_id (a mismatched query param is a 403).
 *  A JWT caller must pass business_id — RLS still enforces membership. */
function resolveBusinessId(
  ctx: Ctx,
  fromQuery: string | null,
): { businessId: string } | { response: Response } {
  if (ctx.auth?.kind === 'api_key') {
    const scoped = ctx.auth.business_id;
    if (fromQuery && fromQuery !== scoped) {
      return { response: fail('forbidden', 'API key is not scoped to that business', 403) };
    }
    return { businessId: scoped };
  }
  if (!fromQuery) return { response: fail('missing_param', 'business_id query parameter is required', 400) };
  if (!isUuid(fromQuery)) return { response: fail('bad_id', 'business_id must be a UUID', 400) };
  return { businessId: fromQuery };
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
  if (src.includes("=== 'legacy-tracking'")) return 'legacy-tracking/:code';
  if (src.includes("=== 'rates'"))      return 'rates?origin=..&destination=..&mode=..&weight_kg=..&volume_m3=..';
  if (src.includes("=== 'usage'"))      return 'usage/summary?business_id=..&range=24h|7d|30d';
  if (src.includes("=== 'openapi.json'")) return 'openapi.json';
  if (src.includes("=== 'health'"))     return 'health';
  if (src.includes("=== 'me'"))         return 'me';
  return '(unknown)';
}
