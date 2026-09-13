-- Phase 1 corrections (functional cleanup of the business area).
--
-- 1. Quote reference sequence was GLOBAL across every tenant: the
--    max() scan in quotes_generate_reference() was not filtered by
--    business_id, so DEV-YYYY-NNNNN leaked platform-wide activity and
--    two businesses collided on the same counter. Scope it per business
--    + year, matching the invoice-numbering pattern. A collision-skip
--    loop makes the switch safe even if legacy global references exist
--    (the reference column keeps its global UNIQUE constraint; quotes
--    are not legally required to be gapless, so skipping a taken number
--    during the transition is acceptable).
--
-- 2. accept_quote_to_shipment() copied quote.customer_price into
--    shipments.goods_value. Those mean different things:
--      - goods_value  = declared value of the transported goods
--                       (used for customs + insurance),
--      - customer_price = what the customer pays for the transport.
--    Copying one into the other corrupts customs/insurance figures.
--    Leave goods_value NULL on conversion (nullable column, no default)
--    so the operator fills the real declared value themselves.

-- ─── 1. Per-business quote numbering ────────────────────────────
create or replace function public.quotes_generate_reference()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  yr        text := to_char(now(), 'YYYY');
  n         int;
  candidate text;
begin
  if new.reference is not null and length(new.reference) > 0 then
    return new;
  end if;

  -- Lock on business + year so each tenant keeps its own counter and
  -- two tenants never serialize on the same advisory lock.
  perform pg_advisory_xact_lock(
    hashtextextended('quote_ref_' || new.business_id::text || '_' || yr, 0));

  select coalesce(max(nullif(regexp_replace(reference, '^DEV-' || yr || '-', ''), '')::int), 0)
    into n
    from public.quotes
    where business_id = new.business_id
      and reference like 'DEV-' || yr || '-%';

  -- Skip past any reference already taken globally (defensive: handles
  -- legacy global-sequence rows without hitting the UNIQUE constraint).
  loop
    n := n + 1;
    candidate := 'DEV-' || yr || '-' || lpad(n::text, 5, '0');
    exit when not exists (select 1 from public.quotes where reference = candidate);
  end loop;

  new.reference := candidate;
  return new;
end;
$$;

-- ─── 2. Do not seed goods_value from the customer price ─────────
create or replace function public.accept_quote_to_shipment(p_quote uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  if role not in ('owner','admin','manager','operations') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if q.status = 'converted' and q.shipment_id is not null then
    return q.shipment_id;
  end if;
  if q.status not in ('draft','sent','accepted') then
    raise exception 'quote_cannot_be_converted from status %', q.status;
  end if;

  -- goods_value intentionally left NULL: it is the declared customs /
  -- insurance value of the cargo, NOT the transport price the customer
  -- is quoted. The operator sets it on the shipment when known.
  insert into public.shipments (
    business_id, customer_id, direction, mode, status, currency,
    origin_country, origin_city, destination_country, destination_city,
    total_weight_kg, total_volume_m3, notes, created_by
  ) values (
    q.business_id, q.customer_id, q.direction, q.mode, 'booked', q.currency,
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
$$;

revoke all on function public.accept_quote_to_shipment(uuid) from public;
grant execute on function public.accept_quote_to_shipment(uuid) to authenticated;
