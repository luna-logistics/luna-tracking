-- Shipment status redesign — a freight import/export lifecycle.
--
-- Before: draft, quoted, booked, received, in_transit, customs, delivered,
-- cancelled. "quoted" (Devis) is not a shipment state — quotes are their own
-- entity (Devis menu) and become a shipment only when accepted.
-- After:  draft → confirmed → pickup → in_transit → [customs] → delivered,
--         cancelled = exception reachable from any status except delivered.
--   booked   (Réservée)        → confirmed  (booking confirmed)
--   received (Prise en charge) → pickup     (goods being collected / collected)
--   quoted   (Devis)           → draft      (a shipment can't be "a quote")
--   customs stays, but is optional: the UI only shows it for shipments that go
--   through customs (current status or history), not as a mandatory step.
-- Data: verified 0 shipments before applying; the mapping below is kept so the
-- migration is correct on any environment that does have rows.
--
-- "Actual" dates are no longer typed in the form: they are stamped here when
-- the status says so (in_transit ⇒ goods were picked up; delivered ⇒ delivered).

update public.shipments set status = case status
  when 'quoted'   then 'draft'
  when 'booked'   then 'confirmed'
  when 'received' then 'pickup'
  else status end
 where status in ('quoted', 'booked', 'received');

alter table public.shipments drop constraint if exists shipments_status_check;
alter table public.shipments add constraint shipments_status_check check (
  status in ('draft', 'confirmed', 'pickup', 'in_transit', 'customs', 'delivered', 'cancelled'));

create or replace function public.shipments_status_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'delivered' and new.status = 'cancelled' then
    raise exception 'cannot_cancel_delivered_shipment' using errcode = 'P0001';
  end if;
  if new.status in ('in_transit', 'customs', 'delivered') and new.actual_pickup is null then
    new.actual_pickup := current_date;
  end if;
  if new.status = 'delivered' and new.actual_delivery is null then
    new.actual_delivery := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_status_rules on public.shipments;
create trigger shipments_status_rules
  before insert or update of status on public.shipments
  for each row execute function public.shipments_status_rules();

-- Quote → shipment: the new shipment starts as "confirmed" (was 'booked').
-- The function is redefined anyway, so its role guard is made NULL-safe at
-- the same time (a non-member's business_role() is NULL and `NULL NOT IN`
-- never raised → any authenticated non-member holding a quote UUID could
-- create a shipment).
create or replace function public.accept_quote_to_shipment(p_quote uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  q     public.quotes;
  sid   uuid;
  role  text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into q from public.quotes where id = p_quote;
  if q.id is null then
    raise exception 'quote_not_found';
  end if;

  role := public.business_role(q.business_id, auth.uid());
  if coalesce(role, '') not in ('owner','admin','manager','operations') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if q.status = 'converted' and q.shipment_id is not null then
    return q.shipment_id;
  end if;
  if q.status not in ('draft','sent','accepted') then
    raise exception 'quote_cannot_be_converted from status %', q.status;
  end if;

  insert into public.shipments (
    business_id, customer_id, direction, mode, status, currency,
    origin_country, origin_city, destination_country, destination_city,
    total_weight_kg, total_volume_m3, notes, created_by
  ) values (
    q.business_id, q.customer_id, q.direction, q.mode, 'confirmed', q.currency,
    q.origin_country, q.origin_city, q.destination_country, q.destination_city,
    q.weight_kg, q.volume_m3, q.notes, auth.uid()
  ) returning id into sid;

  update public.quotes
     set status = 'converted',
         shipment_id = sid,
         accepted_at = coalesce(accepted_at, now()),
         updated_at = now()
   where id = p_quote;

  return sid;
end;
$function$;
revoke execute on function public.accept_quote_to_shipment(uuid) from public, anon;
grant execute on function public.accept_quote_to_shipment(uuid) to authenticated;
