-- Shipments: soft delete + restore (same model as support conversations,
-- 20260924050000). Before this, a shipment could only be HARD-deleted, and
-- only through the raw table API (the "manager write" ALL policy) — nothing in
-- the dashboard offered it, so a test shipment could never be removed.
--
-- Deleting stamps deleted_at / deleted_by: the shipment leaves every list,
-- report count and API response, its public tracking link stops resolving, and
-- its packages / charges / documents / events disappear with it (their RLS goes
-- through the shipments row). Nothing is destroyed: invoices, quotes and
-- expenses that point at it keep their link, and the business's staff can
-- restore it from Expéditions → "Supprimées".
--
-- Who: the roles that already write shipments (owner, admin, manager,
-- operations — they could already hard-delete through RLS) + platform admins.
-- Hard DELETE is no longer granted to clients at all.

alter table public.shipments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists shipments_deleted_idx
  on public.shipments (business_id, deleted_at desc) where deleted_at is not null;

-- ─── RLS: a deleted shipment is invisible to every client query ───────────
-- The old ALL policy also granted SELECT (policies OR together), so it is
-- split into INSERT + UPDATE; no DELETE policy remains.
drop policy if exists "shipments member read"   on public.shipments;
drop policy if exists "shipments manager write" on public.shipments;

create policy "shipments member read" on public.shipments
  for select using (
    deleted_at is null
    and public.is_business_member(business_id, (select auth.uid()))
  );

create policy "shipments manager insert" on public.shipments
  for insert with check (
    coalesce(public.business_role(business_id, (select auth.uid())), '') in ('owner','admin','manager','operations')
  );

create policy "shipments manager update" on public.shipments
  for update using (
    deleted_at is null
    and coalesce(public.business_role(business_id, (select auth.uid())), '') in ('owner','admin','manager','operations')
  ) with check (
    coalesce(public.business_role(business_id, (select auth.uid())), '') in ('owner','admin','manager','operations')
  );

-- deleted_at / deleted_by only move through the functions below (they run as
-- the owner); a client UPDATE that touches them is refused.
create or replace function public.shipments_guard_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT' and (new.deleted_at is not null or new.deleted_by is not null))
     or (tg_op = 'UPDATE' and (new.deleted_at is distinct from old.deleted_at
                               or new.deleted_by is distinct from old.deleted_by)) then
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists shipments_guard_delete on public.shipments;
create trigger shipments_guard_delete
  before insert or update on public.shipments
  for each row execute function public.shipments_guard_delete();

-- ─── Delete / restore / list deleted ──────────────────────────────────────
create or replace function public.shipment_can_delete(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null and (
    coalesce(public.business_role(p_business, auth.uid()), '') in ('owner','admin','manager','operations')
    or coalesce(public.is_admin(auth.uid()), false)
  );
$function$;

create or replace function public.delete_shipment(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare biz uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select business_id into biz from public.shipments where id = p_id and deleted_at is null;
  if biz is null then raise exception 'not_found'; end if;
  if not public.shipment_can_delete(biz) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  update public.shipments set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
end;
$function$;

create or replace function public.restore_shipment(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare biz uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select business_id into biz from public.shipments where id = p_id and deleted_at is not null;
  if biz is null then raise exception 'not_found'; end if;
  if not public.shipment_can_delete(biz) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  update public.shipments set deleted_at = null, deleted_by = null where id = p_id;
end;
$function$;

create or replace function public.list_deleted_shipments(p_business uuid)
returns table (
  id uuid, reference text, status text, direction text, mode text, customer_id uuid,
  origin_city text, origin_country text, destination_city text, destination_country text,
  updated_at timestamptz, deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.shipment_can_delete(p_business) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  return query
    select s.id, s.reference, s.status, s.direction, s.mode, s.customer_id,
           s.origin_city, s.origin_country, s.destination_city, s.destination_country,
           s.updated_at, s.deleted_at
      from public.shipments s
     where s.business_id = p_business and s.deleted_at is not null
     order by s.deleted_at desc;
end;
$function$;

revoke all on function public.shipment_can_delete(uuid)    from public, anon;
revoke all on function public.delete_shipment(uuid)         from public, anon;
revoke all on function public.restore_shipment(uuid)        from public, anon;
revoke all on function public.list_deleted_shipments(uuid)  from public, anon;
grant execute on function public.shipment_can_delete(uuid)   to authenticated;
grant execute on function public.delete_shipment(uuid)        to authenticated;
grant execute on function public.restore_shipment(uuid)       to authenticated;
grant execute on function public.list_deleted_shipments(uuid) to authenticated;

-- ─── SECURITY DEFINER readers bypass RLS: make each one skip deleted rows ──
-- Patched in place from the live definition (exact-text replace, asserted), so
-- nothing else in these functions changes.
do $$
declare
  fixes constant text[][] := array[
    ['public.get_public_shipment(uuid)',
     'where tracking_token = p_token and tracking_enabled = true;',
     'where tracking_token = p_token and tracking_enabled = true and deleted_at is null;'],
    ['public.draft_invoice_from_shipment(uuid)',
     'select * into s from public.shipments where id = p_shipment;',
     'select * into s from public.shipments where id = p_shipment and deleted_at is null;'],
    ['public.get_shipment_margin(uuid)',
     'select * into s from public.shipments where id = p_shipment;',
     'select * into s from public.shipments where id = p_shipment and deleted_at is null;'],
    ['public.rotate_shipment_tracking_token(uuid)',
     'select business_id into biz from public.shipments where id = p_shipment;',
     'select business_id into biz from public.shipments where id = p_shipment and deleted_at is null;'],
    ['public.get_business_report(uuid, timestamp with time zone, timestamp with time zone)',
     'and created_at between p_since and p_until),
      ''shipments_delivered''',
     'and created_at between p_since and p_until
          and deleted_at is null),
      ''shipments_delivered'''],
    ['public.get_business_report(uuid, timestamp with time zone, timestamp with time zone)',
     'and actual_delivery between since_d and until_d),',
     'and actual_delivery between since_d and until_d
          and deleted_at is null),']
  ];
  i int; def text; patched text;
begin
  for i in 1 .. array_length(fixes, 1) loop
    def := pg_get_functiondef(fixes[i][1]::regprocedure);
    if position(fixes[i][2] in def) = 0 then
      raise exception 'soft-delete patch: expected text not found in %: %', fixes[i][1], fixes[i][2];
    end if;
    patched := replace(def, fixes[i][2], fixes[i][3]);
    execute patched;
  end loop;
end $$;
