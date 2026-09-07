# Luna Tracking API — `/api/v1`

A single Edge Function (`api-v1`) with an internal router. One function
keeps us on the free tier (Supabase bills per function, not per route)
and gives us one place to enforce auth, logging, and the response shape.

## Base URL

```
https://zlpzajjfzezjildvchoz.functions.supabase.co/api-v1
```

Legacy prefixes are also accepted so a Cloudflare Worker (or future
proxy) can rewrite `/api/v1/*` → the function without needing a config
change here: `/functions/v1/api-v1/*`, `/api-v1/*`, `/api/v1/*`.

## Response envelope

```json
{ "data": <payload>, "meta": <optional object> }
```

or

```json
{ "error": { "code": "string", "message": "string", "detail": <optional> } }
```

Every response carries `X-Api-Version: v1`.

## Authentication

Two schemes are recognized on `Authorization`:

- `Authorization: Bearer <supabase_jwt>` — today's frontend uses this.
  Membership + RLS is enforced by Postgres.
- `Authorization: ApiKey <prefix>.<secret>` — **reserved for Phase 7**.
  Recognized here so future clients get a clean `401` rather than a
  misleading `400`.

Endpoints that don't require auth (`/health`, `/tracking/:token`) do
not check for it.

## Endpoints (initial cut)

| Method | Path                         | Auth       | Notes |
| ------ | ---------------------------- | ---------- | ----- |
| GET    | `/health`                    | none       | Liveness probe. |
| GET    | `/`                          | none       | Discovery — lists endpoints. |
| GET    | `/me`                        | JWT        | Caller + memberships + businesses. |
| GET    | `/shipments?business_id=…`   | JWT        | `limit=1..100` (50), `status=<enum>`. |
| GET    | `/shipments/:id`             | JWT        | Full row (RLS scoped). |
| GET    | `/customers?business_id=…`   | JWT        | `include_inactive=true` to include archived. |
| GET    | `/customers/:id`             | JWT        | Full row. |
| GET    | `/tracking/:token`           | none       | Curated public tracking payload (opt-in per shipment). |

More endpoints (`POST /shipments`, `POST /quotes`, `GET /rates`, `POST /bookings`,
`POST /webhooks`) are added in later phases.

## Design rules

1. **Business logic lives in Postgres** (`SECURITY DEFINER` RPCs and
   RLS). The Edge Function is a thin adapter — it never re-implements
   authorization or invariants.
2. **Multi-tenant by default.** Every query is either scoped by RLS
   (JWT scheme) or by `business_id` extracted from an API key (Phase 7).
   `business_id` in a query string is a filter, not a bypass.
3. **No secrets leak downstream.** Internal `transport_cost`,
   `platform_fee`, `professional_margin`, provider identifiers — none of
   these appear in public-facing payloads (see `get_public_shipment`
   RPC for the vetted contract).
4. **Versioned path.** Breaking changes get a new function
   (`api-v2`); `v1` keeps its shape.

## Deploy

```bash
supabase functions deploy api-v1 --project-ref <ref> --no-verify-jwt
```

`--no-verify-jwt` is required because the function accepts anonymous
public routes and multiple auth schemes; JWT verification runs inside.
