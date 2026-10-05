-- Brussels → Lubumbashi, a second priced corridor — additive and Kinshasa-safe.
--
-- The pricing grid stays ONE versioned jsonb document with ONE active row. The
-- Kinshasa grid stays at the ROOT of the document, byte-for-byte unchanged. A new
-- optional `corridors` object holds extra destinations keyed by city slug; each
-- entry is a COMPLETE grid for Brussels → <slug> (same shape as the root, minus
-- the corridor identity) and may carry a `seaWeightSurchargeCentsPerKg` — a flat
-- €/kg sea surcharge added to every tier and carton (Lubumbashi: €3/kg). A
-- corridor with no sous-douane sets `customsAdminFeeCents` to null.
--
-- This migration:
--   • splits the server-side validator into pricing_config_check_grid() (the
--     rate/fee/tier/preset part) + pricing_config_check() (corridor identity +
--     root grid + every corridor grid), so save_pricing_settings() and the
--     history keep working unchanged for both corridors;
--   • adds the Lubumbashi corridor to the active row IN PLACE (jsonb_set adds only
--     the `corridors` key — every Kinshasa value stays byte-identical), validates
--     the result and logs the added leaves to the history. Idempotent.
--
-- The diff/leaves helpers already walk nested objects generically, so they need
-- no change. The in-code fallback grid (src/lib/pricing/fallback.ts) deliberately
-- stays Kinshasa-only: an offline site degrades Lubumbashi to "Sur devis" rather
-- than inventing a price.

-- ─── validator: the grid part (shared by root and every corridor) ──
create or replace function public.pricing_config_check_grid(p jsonb)
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
  if jsonb_typeof(p) is distinct from 'object' then return 'grid'; end if;

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

  -- Sea weight surcharge (optional, €/kg): null or a number >= 0.
  v := p -> 'seaWeightSurchargeCentsPerKg';
  if v is not null and jsonb_typeof(v) <> 'null' then
    x := case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
    if x is null or x < 0 then return 'seaWeightSurchargeCentsPerKg'; end if;
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

-- ─── validator: corridor identity + root grid + every corridor grid ──
create or replace function public.pricing_config_check(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  g    text;
  ckey text;
begin
  if jsonb_typeof(p) is distinct from 'object' then return 'config'; end if;

  if jsonb_typeof(p #> '{corridor,origin}') is distinct from 'string'
     or btrim(p #>> '{corridor,origin}') = ''
     or jsonb_typeof(p #> '{corridor,destination}') is distinct from 'string'
     or btrim(p #>> '{corridor,destination}') = '' then
    return 'corridor';
  end if;

  g := public.pricing_config_check_grid(p);
  if g is not null then return g; end if;

  -- Extra corridors (optional): each a full grid keyed by destination slug.
  if p ? 'corridors' and jsonb_typeof(p -> 'corridors') <> 'null' then
    if jsonb_typeof(p -> 'corridors') <> 'object' then return 'corridors'; end if;
    for ckey in select key from jsonb_each(p -> 'corridors') loop
      g := public.pricing_config_check_grid(p -> 'corridors' -> ckey);
      if g is not null then return 'corridors.' || ckey || '.' || g; end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke all on function public.pricing_config_check_grid(jsonb) from public, anon, authenticated;
revoke all on function public.pricing_config_check(jsonb) from public, anon, authenticated;

-- ─── data: add the Lubumbashi corridor to the active row (in place) ──
-- jsonb_set adds only the `corridors` key; every Kinshasa value is untouched.
-- Idempotent: skipped once the corridor exists. Validated before it is written.
do $$
declare
  v_prev   public.pricing_config;
  v_newcfg jsonb;
  v_problem text;
  v_lub    jsonb := $lub${
    "handlingFeeCents": 500,
    "customsAdminFeeCents": null,
    "volumetricDivisor": 6000,
    "volumetricSurchargeRateCentsPerKg": 550,
    "seaWeightSurchargeCentsPerKg": 300,
    "ratioQuote": { "thresholdKgPerM3": 374, "appliesTo": ["sea"] },
    "modes": {
      "express": { "perKgCents": 2100, "flatMinCents": 2100, "minKg": 0.1, "maxKg": 200 },
      "cargo":   { "perKgCents": 1750, "minKg": 1, "maxKg": 500 },
      "sea": {
        "tiers": [
          { "uptoM3": 5,  "perM3Cents": 75000 },
          { "uptoM3": 10, "perM3Cents": 72500 },
          { "uptoM3": 30, "perM3Cents": 70000 }
        ],
        "maxM3": 30
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
    "includes": null
  }$lub$::jsonb;
begin
  select * into v_prev from public.pricing_config where is_active for update;
  if v_prev.id is null then return; end if;                 -- no active grid (fresh install handles its own seed)
  if (v_prev.config #> '{corridors,lubumbashi}') is not null then return; end if; -- already added

  -- Set the top-level `corridors` key (merging if it already holds other
  -- corridors). jsonb_set cannot create the missing intermediate object, so the
  -- nested path is built here rather than with '{corridors,lubumbashi}'.
  v_newcfg := jsonb_set(
    v_prev.config, '{corridors}',
    coalesce(v_prev.config -> 'corridors', '{}'::jsonb) || jsonb_build_object('lubumbashi', v_lub),
    true);

  v_problem := public.pricing_config_check(v_newcfg);
  if v_problem is not null then
    raise exception 'lubumbashi corridor rejected by pricing_config_check: %', v_problem;
  end if;

  update public.pricing_config set config = v_newcfg where id = v_prev.id;

  insert into public.pricing_config_history (config_id, action, changed_by, changed_by_email, path, old_value, new_value)
  select v_prev.id, 'backfill', null, 'migration:lubumbashi', d.path, d.old_value, d.new_value
    from public.pricing_config_diff(v_prev.config, v_newcfg) d;
end $$;
