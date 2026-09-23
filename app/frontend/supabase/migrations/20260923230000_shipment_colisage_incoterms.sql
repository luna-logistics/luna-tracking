-- Expédition: colisage (packing list), totals derived from it, Incoterms 2020.
--
-- shipment_packages already existed (L/l/H cm, weight kg per piece,
-- quantity, HS code, value… — RLS: members read, owner/admin/manager/
-- operations write, NULL-safe `= ANY`). It was only editable from the
-- detail page and the shipment's total weight/volume were typed by hand
-- (or "adopted" with a button). Now:
--   * package_type: carton | paquet | palette.
--   * shipments.total_weight_kg / total_volume_m3 are DERIVED: recomputed by
--     trigger on every package change (weight × qty; L×l×H/1e6 × qty), so the
--     form, the detail page, public tracking and the API always agree.
--   * save_shipment_packages(): the shipment form's one-call save — updates
--     existing lines by id (ONLY the fields the form edits, so HS code /
--     value / marks set on the detail page survive), inserts new lines,
--     deletes the removed ones. SECURITY INVOKER → the caller's RLS applies.
--   * incoterm: one of the 11 Incoterms 2020 (was: any 3-5 chars).
-- Verified before applying: 0 shipments, 0 shipment_packages rows.

alter table public.shipment_packages
  add column if not exists package_type text not null default 'carton'
    check (package_type in ('carton', 'paquet', 'palette'));

alter table public.shipment_packages drop constraint if exists shipment_packages_dims_nonneg;
alter table public.shipment_packages add constraint shipment_packages_dims_nonneg check (
  (weight_kg is null or weight_kg >= 0) and (length_cm is null or length_cm >= 0)
  and (width_cm is null or width_cm >= 0) and (height_cm is null or height_cm >= 0));

-- ─── Derived totals ────────────────────────────────────────────────
create or replace function public.shipment_recompute_totals(p_shipment uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.shipments s
     set total_weight_kg = t.w,
         total_volume_m3 = t.v
    from (
      select
        case when count(*) = 0 then null
             else round(coalesce(sum(p.weight_kg * p.quantity), 0), 3) end as w,
        case when count(*) = 0 then null
             else round(coalesce(sum(p.length_cm * p.width_cm * p.height_cm / 1000000.0 * p.quantity), 0), 4) end as v
        from public.shipment_packages p
       where p.shipment_id = p_shipment
    ) t
   where s.id = p_shipment;
$$;
revoke all on function public.shipment_recompute_totals(uuid) from public, anon, authenticated;

create or replace function public.shipment_packages_rollup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.shipment_recompute_totals(new.shipment_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.shipment_id is distinct from new.shipment_id) then
    perform public.shipment_recompute_totals(old.shipment_id);
  end if;
  return null;
end;
$$;

drop trigger if exists shipment_packages_rollup on public.shipment_packages;
create trigger shipment_packages_rollup
  after insert or update or delete on public.shipment_packages
  for each row execute function public.shipment_packages_rollup();

-- ─── One-call save from the shipment form ─────────────────────────
-- p_lines: [{ id?, package_type, length_cm, width_cm, height_cm, weight_kg,
--             quantity, description? }] in display order.
create or replace function public.save_shipment_packages(p_shipment uuid, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  l jsonb;
  i int := 0;
  keep uuid[] := '{}';
  lid uuid;
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'lines_must_be_array';
  end if;

  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if nullif(l->>'id', '') is not null then keep := keep || (l->>'id')::uuid; end if;
  end loop;

  delete from public.shipment_packages
   where shipment_id = p_shipment and not (id = any(keep));

  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    i := i + 1;
    lid := nullif(l->>'id', '')::uuid;
    if lid is not null then
      update public.shipment_packages set
        package_index = i,
        package_type  = coalesce(nullif(l->>'package_type', ''), 'carton'),
        length_cm     = nullif(l->>'length_cm', '')::numeric,
        width_cm      = nullif(l->>'width_cm', '')::numeric,
        height_cm     = nullif(l->>'height_cm', '')::numeric,
        weight_kg     = nullif(l->>'weight_kg', '')::numeric,
        quantity      = greatest(coalesce(nullif(l->>'quantity', '')::int, 1), 1),
        description   = coalesce(nullif(l->>'description', ''), description)
      where id = lid and shipment_id = p_shipment;
      if not found then raise exception 'package_not_found'; end if;
    else
      insert into public.shipment_packages
        (shipment_id, package_index, package_type, length_cm, width_cm, height_cm, weight_kg, quantity, description)
      values
        (p_shipment, i, coalesce(nullif(l->>'package_type', ''), 'carton'),
         nullif(l->>'length_cm', '')::numeric, nullif(l->>'width_cm', '')::numeric,
         nullif(l->>'height_cm', '')::numeric, nullif(l->>'weight_kg', '')::numeric,
         greatest(coalesce(nullif(l->>'quantity', '')::int, 1), 1),
         nullif(l->>'description', ''));
    end if;
  end loop;

  -- Lines present → the rollup trigger already recomputed the totals. No
  -- lines at all → no trigger fired: clear them here (the caller's RLS
  -- write right on shipments applies; the recompute helper is not
  -- executable by clients).
  update public.shipments set total_weight_kg = null, total_volume_m3 = null
   where id = p_shipment
     and not exists (select 1 from public.shipment_packages p where p.shipment_id = p_shipment);
end;
$$;
revoke all on function public.save_shipment_packages(uuid, jsonb) from public, anon;
grant execute on function public.save_shipment_packages(uuid, jsonb) to authenticated;

-- ─── Incoterms 2020 ───────────────────────────────────────────────
alter table public.shipments drop constraint if exists shipments_incoterm_check;
alter table public.shipments add constraint shipments_incoterm_check check (
  incoterm is null or incoterm in ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'));
