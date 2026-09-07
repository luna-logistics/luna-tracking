create table if not exists public.shipment_events (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references public.shipments(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  kind         text not null check (kind in ('created','status_change','note','document_added','document_removed')),
  from_status  text,
  to_status    text,
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists shipment_events_shipment_id_idx on public.shipment_events (shipment_id, created_at desc);
create index if not exists shipment_events_business_id_idx on public.shipment_events (business_id);

alter table public.shipment_events enable row level security;

drop policy if exists shipment_events_select on public.shipment_events;
create policy shipment_events_select on public.shipment_events
  for select using (public.is_business_member(business_id, auth.uid()));

drop policy if exists shipment_events_insert on public.shipment_events;
create policy shipment_events_insert on public.shipment_events
  for insert with check (public.is_business_member(business_id, auth.uid()));

-- No UPDATE / DELETE policy: audit trail stays immutable.

-- ─── Trigger: auto-log created + status_change ─────────────────
create or replace function public.shipment_events_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.shipment_events (shipment_id, business_id, kind, to_status, created_by)
    values (new.id, new.business_id, 'created', new.status, actor);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.shipment_events (shipment_id, business_id, kind, from_status, to_status, created_by)
      values (new.id, new.business_id, 'status_change', old.status, new.status, actor);
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_track_events on public.shipments;
create trigger shipments_track_events
  after insert or update of status on public.shipments
  for each row execute function public.shipment_events_track();

-- ─── Auto-log document add/remove ───────────────────────────────
create or replace function public.shipment_documents_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.shipment_events (shipment_id, business_id, kind, note, created_by)
    values (new.shipment_id, new.business_id, 'document_added', new.filename, actor);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.shipment_events (shipment_id, business_id, kind, note, created_by)
    values (old.shipment_id, old.business_id, 'document_removed', old.filename, actor);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists shipment_documents_track_events on public.shipment_documents;
create trigger shipment_documents_track_events
  after insert or delete on public.shipment_documents
  for each row execute function public.shipment_documents_track();

-- ─── Actor display names (co-members only) ──────────────────────
-- profiles is owner-only RLS; this RPC returns id + full_name for
-- users the caller shares at least one business with, so we can label
-- events without opening profiles broadly.
create or replace function public.business_actor_names(p_user_ids uuid[])
returns table (id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and exists (
      select 1
      from public.business_members m1
      join public.business_members m2 on m2.business_id = m1.business_id
      where m1.user_id = auth.uid()
        and m2.user_id = p.id
    );
$$;

revoke all on function public.business_actor_names(uuid[]) from public;
grant execute on function public.business_actor_names(uuid[]) to authenticated;
