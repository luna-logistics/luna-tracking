-- ─── Plan catalog ─────────────────────────────────────────────────
create table if not exists public.api_plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[a-z0-9_-]{2,32}$'),
  name           text not null,
  monthly_quota  int check (monthly_quota is null or monthly_quota > 0),
  monthly_price  numeric check (monthly_price is null or monthly_price >= 0),
  currency       text not null default 'EUR' check (length(currency)=3),
  features       jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  display_order  int not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.api_plans enable row level security;

drop policy if exists api_plans_public_read on public.api_plans;
create policy api_plans_public_read on public.api_plans
  for select using (is_active);

drop policy if exists api_plans_admin_write on public.api_plans;
create policy api_plans_admin_write on public.api_plans
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Seed the four indicative tiers. Prices are placeholders — enforcement
-- is OFF today; the switch is platform_settings.api_quota_enforced.
insert into public.api_plans (code, name, monthly_quota, monthly_price, features, display_order)
values
  ('free',       'Free',       100,     0,    '["read-only endpoints","community support"]'::jsonb, 10),
  ('pro',        'Pro',        5000,    13,   '["all endpoints","webhooks","email support 48h"]'::jsonb, 20),
  ('business',   'Business',   50000,   49,   '["higher quota","priority email support 24h","SLA on request"]'::jsonb, 30),
  ('enterprise', 'Enterprise', null,    null, '["unlimited quota","dedicated support","SLA","custom SSO"]'::jsonb, 40)
on conflict (code) do nothing;

-- ─── Which plan each business is on ─────────────────────────────
create table if not exists public.business_plans (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null unique references public.businesses(id) on delete cascade,
  plan_id      uuid not null references public.api_plans(id),
  started_at   timestamptz not null default now(),
  expires_at   timestamptz,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists business_plans_business_idx on public.business_plans (business_id);
create index if not exists business_plans_plan_idx     on public.business_plans (plan_id);

alter table public.business_plans enable row level security;

drop policy if exists business_plans_select on public.business_plans;
create policy business_plans_select on public.business_plans
  for select using (public.is_business_member(business_id, auth.uid()));

drop policy if exists business_plans_admin_write on public.business_plans;
create policy business_plans_admin_write on public.business_plans
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace function public.business_default_free_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  free_id uuid;
begin
  select id into free_id from public.api_plans where code = 'free' and is_active limit 1;
  if free_id is null then return new; end if;
  insert into public.business_plans (business_id, plan_id)
  values (new.id, free_id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

drop trigger if exists businesses_default_free_plan on public.businesses;
create trigger businesses_default_free_plan
  after insert on public.businesses
  for each row execute function public.business_default_free_plan();

-- Backfill for existing businesses that don't have a plan row yet.
insert into public.business_plans (business_id, plan_id)
select b.id, (select id from public.api_plans where code='free' limit 1)
from public.businesses b
left join public.business_plans bp on bp.business_id = b.id
where bp.id is null;

-- ─── Touch updated_at ────────────────────────────────────────────
create or replace function public.api_plans_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists api_plans_touch on public.api_plans;
create trigger api_plans_touch before update on public.api_plans
  for each row execute function public.api_plans_touch();
drop trigger if exists business_plans_touch on public.business_plans;
create trigger business_plans_touch before update on public.business_plans
  for each row execute function public.api_plans_touch();

-- ─── Platform settings ───────────────────────────────────────────
create table if not exists public.platform_settings (
  key    text primary key,
  value  jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('api_quota_enforced',    'false'::jsonb),
  ('api_log_retention_days', '90'::jsonb)
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings
  for select using (true);
drop policy if exists platform_settings_admin_write on public.platform_settings;
create policy platform_settings_admin_write on public.platform_settings
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─── Quota RPC ───────────────────────────────────────────────────
create or replace function public.get_business_quota(p_business uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  role       text;
  plan_row   record;
  used_month int;
  now_ts     timestamptz := now();
  month_start timestamptz := date_trunc('month', now_ts);
  month_next  timestamptz := (date_trunc('month', now_ts) + interval '1 month');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  role := public.business_role(p_business, auth.uid());
  if role is null then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  select p.code, p.name, p.monthly_quota, p.monthly_price, p.currency, p.features
  into plan_row
  from public.business_plans bp
  join public.api_plans p on p.id = bp.plan_id
  where bp.business_id = p_business
  limit 1;

  if plan_row.code is null then
    select code, name, monthly_quota, monthly_price, currency, features
    into plan_row from public.api_plans where code='free' limit 1;
  end if;

  select count(*)::int into used_month
  from public.api_usage_log
  where business_id = p_business
    and created_at >= month_start
    and created_at <  month_next;

  return jsonb_build_object(
    'plan', jsonb_build_object(
      'code', plan_row.code,
      'name', plan_row.name,
      'monthly_quota', plan_row.monthly_quota,
      'monthly_price', plan_row.monthly_price,
      'currency', plan_row.currency,
      'features', plan_row.features
    ),
    'period', jsonb_build_object(
      'start', month_start,
      'end',   month_next,
      'reset_in_days', greatest(0, extract(day from (month_next - now_ts))::int)
    ),
    'used_this_month', used_month,
    'unlimited', (plan_row.monthly_quota is null),
    'remaining',
      case when plan_row.monthly_quota is null then null
           else greatest(0, plan_row.monthly_quota - used_month) end,
    'percent_used',
      case when plan_row.monthly_quota is null then 0
           when plan_row.monthly_quota = 0 then 100
           else least(100, round((used_month::numeric / plan_row.monthly_quota::numeric) * 100)::int) end
  );
end;
$$;

revoke all on function public.get_business_quota(uuid) from public;
grant execute on function public.get_business_quota(uuid) to authenticated;

-- ─── Retention: purge api_usage_log older than N days ────────────
create or replace function public.purge_api_usage_log()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  days int := 90;
  cutoff timestamptz;
  deleted int;
begin
  select coalesce((value #>> '{}')::int, 90) into days
  from public.platform_settings where key = 'api_log_retention_days';
  cutoff := now() - make_interval(days => days);
  delete from public.api_usage_log where created_at < cutoff;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.purge_api_usage_log() from public;
grant execute on function public.purge_api_usage_log() to authenticated;

-- Schedule daily at 03:15 UTC.
select cron.schedule(
  'luna-api-log-retention',
  '15 3 * * *',
  $$select public.purge_api_usage_log();$$
);
