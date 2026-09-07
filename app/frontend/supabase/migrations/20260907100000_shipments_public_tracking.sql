-- ─── Columns on shipments ────────────────────────────────────────
alter table public.shipments
  add column if not exists tracking_token uuid unique default gen_random_uuid(),
  add column if not exists tracking_enabled boolean not null default false;

update public.shipments set tracking_token = gen_random_uuid() where tracking_token is null;

alter table public.shipments alter column tracking_token set not null;

-- Rotate token (invalidates the previous link)
create or replace function public.rotate_shipment_tracking_token(p_shipment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token uuid := gen_random_uuid();
  biz uuid;
begin
  select business_id into biz from public.shipments where id = p_shipment;
  if biz is null then
    raise exception 'shipment not found';
  end if;
  if public.business_role(biz, auth.uid()) not in ('owner','admin','manager','operations') then
    raise exception 'insufficient role';
  end if;
  update public.shipments set tracking_token = new_token where id = p_shipment;
  return new_token;
end;
$$;

revoke all on function public.rotate_shipment_tracking_token(uuid) from public;
grant execute on function public.rotate_shipment_tracking_token(uuid) to authenticated;

-- ─── Public read RPC ─────────────────────────────────────────────
-- Returns a curated payload only when the token matches AND tracking is
-- enabled. Never exposes: internal notes, full addresses, contact info,
-- goods value, charges. Timeline is limited to status changes.
create or replace function public.get_public_shipment(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  s public.shipments;
  events_json jsonb;
  package_count int;
begin
  if p_token is null then
    return null;
  end if;

  select * into s from public.shipments where tracking_token = p_token and tracking_enabled = true;
  if s.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kind', e.kind,
      'from_status', e.from_status,
      'to_status', e.to_status,
      'created_at', e.created_at
    )
    order by e.created_at asc
  ), '[]'::jsonb)
  into events_json
  from public.shipment_events e
  where e.shipment_id = s.id
    and e.kind in ('created','status_change');

  select count(*) into package_count from public.shipment_packages where shipment_id = s.id;

  return jsonb_build_object(
    'reference', s.reference,
    'status', s.status,
    'direction', s.direction,
    'mode', s.mode,
    'carrier_name', s.carrier_name,
    'tracking_number', s.tracking_number,
    'origin_city', s.origin_city,
    'origin_country', s.origin_country,
    'destination_city', s.destination_city,
    'destination_country', s.destination_country,
    'estimated_pickup', s.estimated_pickup,
    'estimated_delivery', s.estimated_delivery,
    'actual_pickup', s.actual_pickup,
    'actual_delivery', s.actual_delivery,
    'package_count', package_count,
    'total_weight_kg', s.total_weight_kg,
    'events', events_json
  );
end;
$$;

revoke all on function public.get_public_shipment(uuid) from public;
grant execute on function public.get_public_shipment(uuid) to anon, authenticated;
