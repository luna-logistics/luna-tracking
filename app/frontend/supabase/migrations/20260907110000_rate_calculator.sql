-- ─── Providers (internal or external) ────────────────────────────
create table if not exists public.rate_providers (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique
                        check (code ~ '^[a-z0-9_-]{2,32}$'),
  name                  text not null,
  is_internal           boolean not null default true,
  is_active             boolean not null default true,
  platform_markup_pct   numeric not null default 0
                        check (platform_markup_pct >= 0 and platform_markup_pct <= 200),
  platform_markup_flat  numeric not null default 0
                        check (platform_markup_flat >= 0),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Rate rules ──────────────────────────────────────────────────
create table if not exists public.rate_rules (
  id                 uuid primary key default gen_random_uuid(),
  provider_id        uuid not null references public.rate_providers(id) on delete cascade,
  origin_country     text not null check (length(origin_country)=2),
  destination_country text not null check (length(destination_country)=2),
  mode               text not null check (mode in ('air','sea','road','rail','multi')),
  currency           text not null default 'EUR' check (length(currency)=3),
  base_fee           numeric not null default 0 check (base_fee >= 0),
  per_kg             numeric not null default 0 check (per_kg >= 0),
  per_m3             numeric not null default 0 check (per_m3 >= 0),
  min_charge         numeric not null default 0 check (min_charge >= 0),
  density_factor     numeric not null default 167 check (density_factor > 0),
  transit_days_min   int check (transit_days_min is null or transit_days_min >= 0),
  transit_days_max   int check (transit_days_max is null or transit_days_max >= 0),
  effective_from     date,
  effective_to       date,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rate_rules_transit_order check (
    transit_days_min is null or transit_days_max is null or transit_days_max >= transit_days_min
  ),
  constraint rate_rules_effective_order check (
    effective_from is null or effective_to is null or effective_to >= effective_from
  )
);
create index if not exists rate_rules_lookup_idx on public.rate_rules
  (origin_country, destination_country, mode, is_active);
create index if not exists rate_rules_provider_idx on public.rate_rules (provider_id);

-- ─── RLS — admin-only direct access, public via RPC ─────────────
alter table public.rate_providers enable row level security;
alter table public.rate_rules     enable row level security;

drop policy if exists rate_providers_admin_all on public.rate_providers;
create policy rate_providers_admin_all on public.rate_providers
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists rate_rules_admin_all on public.rate_rules;
create policy rate_rules_admin_all on public.rate_rules
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Touch updated_at
create or replace function public.rate_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists rate_providers_touch on public.rate_providers;
create trigger rate_providers_touch before update on public.rate_providers
  for each row execute function public.rate_touch();
drop trigger if exists rate_rules_touch on public.rate_rules;
create trigger rate_rules_touch before update on public.rate_rules
  for each row execute function public.rate_touch();

-- ─── The one RPC callers use ─────────────────────────────────────
-- Public (anon+auth). Only ever returns curated customer-facing fields.
-- Internal transport_cost + provider_id + markup details STAY INSIDE.
drop function if exists public.calculate_rates(text,text,text,numeric,numeric);

create or replace function public.calculate_rates(
  p_origin_country      text,
  p_destination_country text,
  p_mode                text default null,
  p_weight_kg           numeric default 0,
  p_volume_m3           numeric default 0
)
returns table (
  provider_code       text,
  provider_name       text,
  service_mode        text,
  currency            text,
  customer_price      numeric,
  transit_days_min    int,
  transit_days_max    int
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  today date := current_date;
begin
  if p_origin_country is null or length(p_origin_country) <> 2 then
    raise exception 'origin_country must be a 2-letter ISO code';
  end if;
  if p_destination_country is null or length(p_destination_country) <> 2 then
    raise exception 'destination_country must be a 2-letter ISO code';
  end if;

  return query
    with picked as (
      select
        p.code as p_code,
        p.name as p_name,
        r.mode as r_mode,
        r.currency as r_currency,
        r.base_fee, r.per_kg, r.per_m3, r.min_charge, r.density_factor,
        r.transit_days_min as r_min, r.transit_days_max as r_max,
        p.platform_markup_pct, p.platform_markup_flat
      from public.rate_rules r
      join public.rate_providers p on p.id = r.provider_id
      where r.is_active and p.is_active
        and upper(r.origin_country)      = upper(p_origin_country)
        and upper(r.destination_country) = upper(p_destination_country)
        and (p_mode is null or r.mode = p_mode)
        and (r.effective_from is null or r.effective_from <= today)
        and (r.effective_to   is null or r.effective_to   >= today)
    ),
    priced as (
      select
        p_code, p_name, r_mode, r_currency,
        greatest(coalesce(p_weight_kg, 0), coalesce(p_volume_m3, 0) * density_factor)
          as chargeable_weight,
        base_fee, per_kg, per_m3, min_charge,
        platform_markup_pct, platform_markup_flat,
        r_min, r_max
      from picked
    ),
    computed as (
      select
        p_code, p_name, r_mode, r_currency, r_min, r_max,
        greatest(
          min_charge,
          base_fee + chargeable_weight * per_kg + coalesce(p_volume_m3, 0) * per_m3
        ) as transport_cost,
        platform_markup_pct, platform_markup_flat
      from priced
    )
    select
      p_code as provider_code,
      p_name as provider_name,
      r_mode as service_mode,
      r_currency as currency,
      round(transport_cost * (1 + platform_markup_pct / 100.0) + platform_markup_flat, 2)
        as customer_price,
      r_min as transit_days_min,
      r_max as transit_days_max
    from computed
    order by customer_price asc;
end;
$$;

revoke all on function public.calculate_rates(text,text,text,numeric,numeric) from public;
grant execute on function public.calculate_rates(text,text,text,numeric,numeric) to anon, authenticated;

-- ─── Seed one internal provider + BE↔CD rules ───────────────────
insert into public.rate_providers (code, name, is_internal, platform_markup_pct, platform_markup_flat)
values ('luna-internal', 'Luna Tracking', true, 15, 5)
on conflict (code) do nothing;

with p as (select id from public.rate_providers where code='luna-internal')
insert into public.rate_rules
  (provider_id, origin_country, destination_country, mode, currency,
   base_fee, per_kg, per_m3, min_charge, density_factor,
   transit_days_min, transit_days_max)
select p.id, o, d, m, 'EUR', bf, pk, pm, mc, df, tmin, tmax
from p, (values
  ('BE','CD','air',   50, 6.50, 0,   80, 167,  5,  9),
  ('BE','CD','sea',   35, 0.35, 150, 60, 1000, 30, 50),
  ('BE','CD','road',  45, 3.00, 0,   60, 300,  14, 25),
  ('CD','BE','air',   50, 6.50, 0,   80, 167,  5,  9),
  ('CD','BE','sea',   35, 0.35, 150, 60, 1000, 30, 50)
) as v(o, d, m, bf, pk, pm, mc, df, tmin, tmax)
on conflict do nothing;
