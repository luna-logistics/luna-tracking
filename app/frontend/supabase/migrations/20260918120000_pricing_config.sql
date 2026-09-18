-- pricing_config — the Brussels → Kinshasa published tariff as a single, versioned
-- configuration document (jsonb). The owner changes a rate by editing one row; no
-- deploy. Exactly one active row drives the /calculateur page.
--
-- The grid is STRUCTURED DATA, so it lives here, not in site_content (which is text
-- only). Explanatory copy / examples / FAQ still go through site_content.
--
-- RLS mirrors the site_content pattern: public may read ONLY the active row; writes
-- are restricted to admins via is_admin(auth.uid()), in the initplan-wrapped form
-- used by the newest migrations.
--
-- Every value below is the owner's CONFIRMED tariff. Unconfirmed values (transit
-- times, VAT status, what's included, effective date) are null — the UI omits the
-- corresponding element rather than inventing anything.

create table if not exists public.pricing_config (
  id           uuid primary key default gen_random_uuid(),
  effective_from date,
  is_active    boolean not null default false,
  config       jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- At most one active row (partial unique index on a constant expression).
create unique index if not exists pricing_config_one_active
  on public.pricing_config ((true)) where is_active;

alter table public.pricing_config enable row level security;

drop policy if exists "pricing_config public read active" on public.pricing_config;
create policy "pricing_config public read active" on public.pricing_config
  for select using (is_active = true);

drop policy if exists "pricing_config admin write" on public.pricing_config;
create policy "pricing_config admin write" on public.pricing_config
  for all
  using ((select public.is_admin((select auth.uid()))))
  with check ((select public.is_admin((select auth.uid()))));

-- updated_at maintenance (mirrors rate_touch()).
create or replace function public.pricing_config_touch() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists pricing_config_set_updated_at on public.pricing_config;
create trigger pricing_config_set_updated_at
  before update on public.pricing_config
  for each row execute function public.pricing_config_touch();

-- Seed the confirmed tariff. Money is in integer CENTS. Nulls everywhere the value
-- is unconfirmed, so the UI simply omits those elements.
insert into public.pricing_config (is_active, effective_from, config)
select true, null, $${
  "corridor": { "origin": "brussels", "destination": "kinshasa" },
  "handlingFeeCents": 500,
  "customsAdminFeeCents": 12500,
  "volumetricDivisor": 6000,
  "volumetricSurchargeRateCentsPerKg": 800,
  "ratioQuote": { "thresholdKgPerM3": 374, "appliesTo": ["sea"] },
  "modes": {
    "express": { "perKgCents": 1800, "flatMinCents": 1800, "minKg": 0.1, "maxKg": 200 },
    "cargo":   { "perKgCents": 1600, "minKg": 1, "maxKg": 500 },
    "sea": {
      "tiers": [
        { "uptoM3": 5,  "perM3Cents": 75000 },
        { "uptoM3": 10, "perM3Cents": 72500 }
      ],
      "maxM3": 10
    }
  },
  "presets": [
    { "key": "carton_std",   "lengthCm": 60, "widthCm": 40, "heightCm": 40, "sheetPriceCents": 7500, "seaFlatTransportCents": 7000 },
    { "key": "carton_small", "lengthCm": 40, "widthCm": 30, "heightCm": 30, "sheetPriceCents": 3000, "seaFlatTransportCents": 2500 },
    { "key": "suitcase",     "weightKg": 23 },
    { "key": "move_3m3",     "volumeM3": 3 }
  ],
  "transitTimes": { "express": null, "cargo": null, "sea": null },
  "vatStatus": null,
  "includes": {
    "homeDeliveryKinshasa": null,
    "collection": null,
    "customsDuties": null,
    "congoleseVatOnArrival": null,
    "insurance": null,
    "insuranceCeiling": null
  },
  "effectiveFrom": null
}$$::jsonb
where not exists (select 1 from public.pricing_config where is_active);
