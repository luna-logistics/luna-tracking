-- Réglages tarifs (/admin/tarifs) — change history + one publish RPC.
--
-- pricing_config (20260918120000) already IS the pricing settings table: one
-- versioned jsonb document, public read of the ACTIVE row only, admin writes.
-- This migration is purely ADDITIVE and idempotent — it creates new objects and
-- never alters, replaces or drops an existing one (save_pricing_config() and
-- the pricing_config policies are left exactly as they are):
--
--   • pricing_config_history — who changed what, when, old value → new value:
--     one row per changed field, append-only. Readable only by admins holding
--     the 'content' section (the same gate as the /admin/tarifs sidebar entry,
--     via admin_has_permission()); no client role may insert, update or delete.
--   • pricing_config_is_leaf / _leaves / _diff — pure helpers: a document as
--     "path → value" leaves (objects walked, arrays of objects walked by their
--     "key" or index, arrays of scalars kept whole) and old vs new. Mirrored by
--     src/lib/pricing/diff.ts so the admin's confirmation shows exactly what
--     gets logged.
--   • pricing_config_check — server-side guard: numbers where numbers are
--     expected, no negative rate, thresholds > 0, sea tiers increasing up to the
--     sea maximum.
--   • save_pricing_settings() — the publish action of /admin/tarifs, in ONE
--     transaction: permission check (admin_has_permission(uid, 'content')),
--     validation, optimistic concurrency (refuses to overwrite a version the
--     admin never saw), deactivate + insert the new version, history rows.
--   • history backfill — the versions published before this table existed get
--     their diff logged as 'backfill' (author not recorded at the time).
--   • seed — ONLY when no active row exists (never the case in production):
--     the grid published on 2026-09-25, identical to FALLBACK_PRICING_CONFIG in
--     src/lib/pricing/fallback.ts (fallback.test.ts keeps the two in sync).
--
-- Money stays in integer cents. Quotes, invoices and orders store their own
-- amounts, so publishing a new grid never changes an existing document.

-- ─── history table ────────────────────────────────────────────────
create table if not exists public.pricing_config_history (
  id               bigint generated always as identity primary key,
  config_id        uuid references public.pricing_config(id) on delete set null,
  action           text not null check (action in ('update', 'restore_defaults', 'backfill')),
  changed_by       uuid,
  changed_by_email text,
  changed_at       timestamptz not null default now(),
  path             text not null,
  old_value        jsonb,
  new_value        jsonb
);

create index if not exists pricing_config_history_changed_at_idx
  on public.pricing_config_history (changed_at desc);
create index if not exists pricing_config_history_config_id_idx
  on public.pricing_config_history (config_id);

alter table public.pricing_config_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'pricing_config_history'
       and policyname = 'pricing_config_history admin read'
  ) then
    create policy "pricing_config_history admin read" on public.pricing_config_history
      for select to authenticated
      using ((select public.admin_has_permission((select auth.uid()), 'content')));
  end if;
end $$;

-- Append-only log: reads through the policy above, writes only through
-- save_pricing_settings() (SECURITY DEFINER).
revoke all on public.pricing_config_history from anon;
revoke insert, update, delete, truncate, references, trigger on public.pricing_config_history from authenticated;
grant select on public.pricing_config_history to authenticated;

-- ─── pure helpers ─────────────────────────────────────────────────
create or replace function public.pricing_config_is_leaf(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p)
           when 'object' then p = '{}'::jsonb
           when 'array'  then not exists (
             select 1 from jsonb_array_elements(p) x where jsonb_typeof(x) in ('object', 'array'))
           else true
         end;
$$;

create or replace function public.pricing_config_leaves(p_doc jsonb)
returns table (path text, value jsonb)
language sql
immutable
set search_path = ''
as $$
  with recursive walk(path, value) as (
    select null::text, p_doc
    union all
    select case when w.path is null then c.seg else w.path || '.' || c.seg end, c.value
      from walk w
      cross join lateral (
        select e.key as seg, e.value
          from jsonb_each(case when jsonb_typeof(w.value) = 'object' then w.value else '{}'::jsonb end) e
        union all
        select coalesce(a.value ->> 'key', (a.ord - 1)::text), a.value
          from jsonb_array_elements(case when jsonb_typeof(w.value) = 'array' then w.value else '[]'::jsonb end)
               with ordinality a(value, ord)
      ) c
     where not public.pricing_config_is_leaf(w.value)
  )
  select w.path, w.value
    from walk w
   where w.path is not null
     and public.pricing_config_is_leaf(w.value);
$$;

create or replace function public.pricing_config_diff(p_old jsonb, p_new jsonb)
returns table (path text, old_value jsonb, new_value jsonb)
language sql
immutable
set search_path = ''
as $$
  select coalesce(o.path, n.path), o.value, n.value
    from public.pricing_config_leaves(p_old) o
    full join public.pricing_config_leaves(p_new) n on n.path = o.path
   where o.value is distinct from n.value;
$$;

-- NULL when the document is safe to publish, else the path of the first problem.
create or replace function public.pricing_config_check(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  f    text;
  v    jsonb;
  x    numeric;
  prev numeric := 0;
  i    int := 0;
begin
  if jsonb_typeof(p) is distinct from 'object' then return 'config'; end if;

  if jsonb_typeof(p #> '{corridor,origin}') is distinct from 'string'
     or btrim(p #>> '{corridor,origin}') = ''
     or jsonb_typeof(p #> '{corridor,destination}') is distinct from 'string'
     or btrim(p #>> '{corridor,destination}') = '' then
    return 'corridor';
  end if;

  -- Rates and fees: numbers >= 0.
  foreach f in array array['handlingFeeCents', 'volumetricSurchargeRateCentsPerKg',
                           'modes.express.perKgCents', 'modes.express.flatMinCents',
                           'modes.cargo.perKgCents'] loop
    v := p #> string_to_array(f, '.');
    x := case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
    if x is null or x < 0 then return f; end if;
  end loop;

  -- Sous-douane fee: null (not set) or a number >= 0.
  v := p -> 'customsAdminFeeCents';
  if v is not null and jsonb_typeof(v) <> 'null' then
    x := case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
    if x is null or x < 0 then return 'customsAdminFeeCents'; end if;
  end if;

  -- Divisor and quote thresholds: numbers > 0.
  foreach f in array array['volumetricDivisor', 'modes.express.maxKg', 'modes.cargo.maxKg',
                           'modes.sea.maxM3'] loop
    v := p #> string_to_array(f, '.');
    x := case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
    if x is null or x <= 0 then return f; end if;
  end loop;

  -- Density threshold (optional): > 0, scoped to known modes.
  v := p -> 'ratioQuote';
  if v is not null and jsonb_typeof(v) <> 'null' then
    x := case when jsonb_typeof(v -> 'thresholdKgPerM3') = 'number' then (v ->> 'thresholdKgPerM3')::numeric end;
    if x is null or x <= 0 then return 'ratioQuote.thresholdKgPerM3'; end if;
    if jsonb_typeof(v -> 'appliesTo') is distinct from 'array' then return 'ratioQuote.appliesTo'; end if;
    if exists (select 1 from jsonb_array_elements(v -> 'appliesTo') m
                where m not in ('"express"'::jsonb, '"cargo"'::jsonb, '"sea"'::jsonb)) then
      return 'ratioQuote.appliesTo';
    end if;
  end if;

  -- Sea tiers: at least one, bounds > 0 and strictly increasing, prices >= 0,
  -- the last bound equal to the sea maximum (no gap before the quote threshold).
  v := p #> '{modes,sea,tiers}';
  if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) = 0 then
    return 'modes.sea.tiers';
  end if;
  for v in select t from jsonb_array_elements(p #> '{modes,sea,tiers}') t loop
    x := case when jsonb_typeof(v -> 'uptoM3') = 'number' then (v ->> 'uptoM3')::numeric end;
    if x is null or x <= prev then return 'modes.sea.tiers.' || i || '.uptoM3'; end if;
    prev := x;
    x := case when jsonb_typeof(v -> 'perM3Cents') = 'number' then (v ->> 'perM3Cents')::numeric end;
    if x is null or x < 0 then return 'modes.sea.tiers.' || i || '.perM3Cents'; end if;
    i := i + 1;
  end loop;
  if prev <> (p #>> '{modes,sea,maxM3}')::numeric then return 'modes.sea.maxM3'; end if;

  -- Carton presets (optional): objects with a unique text key, flat price null or >= 0.
  v := p -> 'presets';
  if v is not null and jsonb_typeof(v) <> 'null' then
    if jsonb_typeof(v) <> 'array' then return 'presets'; end if;
    if exists (select 1 from jsonb_array_elements(v) e
                where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'key') is distinct from 'string') then
      return 'presets';
    end if;
    if (select count(*) <> count(distinct e ->> 'key') from jsonb_array_elements(v) e) then
      return 'presets';
    end if;
    for v in select e from jsonb_array_elements(p -> 'presets') e loop
      if jsonb_typeof(v -> 'seaFlatTransportCents') in ('string', 'boolean', 'object', 'array') then
        return 'presets.' || (v ->> 'key') || '.seaFlatTransportCents';
      end if;
      if jsonb_typeof(v -> 'seaFlatTransportCents') = 'number' and (v ->> 'seaFlatTransportCents')::numeric < 0 then
        return 'presets.' || (v ->> 'key') || '.seaFlatTransportCents';
      end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke all on function public.pricing_config_is_leaf(jsonb) from public, anon, authenticated;
revoke all on function public.pricing_config_leaves(jsonb) from public, anon, authenticated;
revoke all on function public.pricing_config_diff(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pricing_config_check(jsonb) from public, anon, authenticated;

-- ─── publish (admin) ──────────────────────────────────────────────
-- p_expected_active_id = id of the active row the admin's form was loaded from
-- (null when there was none). Errors: 'not authorized', 'invalid_action',
-- 'invalid_config: <path>', 'pricing_config_stale', 'no_changes'.
create or replace function public.save_pricing_settings(
  p_config             jsonb,
  p_effective_from     date default null,
  p_action             text default 'update',
  p_expected_active_id uuid default null
)
returns public.pricing_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_problem text;
  v_config  jsonb;
  v_prev    public.pricing_config;
  v_new     public.pricing_config;
  v_email   text;
begin
  if v_uid is null or not coalesce(public.admin_has_permission(v_uid, 'content'), false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('update', 'restore_defaults') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  v_problem := public.pricing_config_check(p_config);
  if v_problem is not null then
    raise exception 'invalid_config: %', v_problem using errcode = '22023';
  end if;
  -- The date lives in the column; the document carries the copy the site reads.
  v_config := jsonb_set(p_config, '{effectiveFrom}', coalesce(to_jsonb(p_effective_from), 'null'::jsonb), true);

  -- Serialise concurrent publishes and never overwrite a version the admin
  -- did not see.
  select * into v_prev from public.pricing_config where is_active for update;
  if v_prev.id is distinct from p_expected_active_id then
    raise exception 'pricing_config_stale';
  end if;
  if v_prev.id is not null and v_prev.config = v_config
     and v_prev.effective_from is not distinct from p_effective_from then
    raise exception 'no_changes';
  end if;

  update public.pricing_config set is_active = false where id = v_prev.id;
  insert into public.pricing_config (is_active, effective_from, config)
  values (true, p_effective_from, v_config)
  returning * into v_new;

  v_email := coalesce((select u.email::text from auth.users u where u.id = v_uid), auth.jwt() ->> 'email');

  insert into public.pricing_config_history (config_id, action, changed_by, changed_by_email, path, old_value, new_value)
  select v_new.id, p_action, v_uid, v_email, d.path, d.old_value, d.new_value
    from public.pricing_config_diff(v_prev.config, v_config) d;

  return v_new;
end;
$$;

revoke all on function public.save_pricing_settings(jsonb, date, text, uuid) from public, anon;
grant execute on function public.save_pricing_settings(jsonb, date, text, uuid) to authenticated;

-- ─── backfill: versions published before the history existed ─────
insert into public.pricing_config_history (config_id, action, changed_by, changed_by_email, changed_at, path, old_value, new_value)
select cur.id, 'backfill', null, null, cur.created_at, d.path, d.old_value, d.new_value
  from (select pc.id, pc.config, pc.created_at,
               lag(pc.config) over (order by pc.created_at, pc.id) as prev_config
          from public.pricing_config pc) cur
  cross join lateral public.pricing_config_diff(cur.prev_config, cur.config) d
 where cur.prev_config is not null
   and not exists (select 1 from public.pricing_config_history h where h.config_id = cur.id);

-- ─── seed: only when no grid is active ────────────────────────────
insert into public.pricing_config (is_active, effective_from, config)
select true, null, $json${
  "corridor": { "origin": "brussels", "destination": "kinshasa" },
  "handlingFeeCents": 500,
  "customsAdminFeeCents": 12500,
  "volumetricDivisor": 6000,
  "volumetricSurchargeRateCentsPerKg": 550,
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
}$json$::jsonb
where not exists (select 1 from public.pricing_config where is_active);
