-- ─── Quotes ──────────────────────────────────────────────────────
create table if not exists public.quotes (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses(id) on delete cascade,
  customer_id          uuid references public.business_customers(id) on delete set null,
  reference            text not null unique,
  status               text not null default 'draft'
                       check (status in ('draft','sent','accepted','declined','expired','converted')),
  valid_until          date,
  direction            text not null default 'export'
                       check (direction in ('export','import','domestic')),
  mode                 text not null default 'road'
                       check (mode in ('air','sea','road','rail','multi')),
  origin_country       text check (origin_country is null or length(origin_country)=2),
  origin_city          text,
  destination_country  text check (destination_country is null or length(destination_country)=2),
  destination_city     text,
  weight_kg            numeric,
  volume_m3            numeric,
  package_count        int,
  transport_cost       numeric not null default 0 check (transport_cost >= 0),
  customer_price       numeric not null default 0 check (customer_price >= 0),
  platform_fee         numeric not null default 0 check (platform_fee >= 0),
  currency             text not null default 'EUR' check (length(currency)=3),
  provider_code        text,
  notes                text,
  shipment_id          uuid references public.shipments(id) on delete set null,
  accepted_at          timestamptz,
  sent_at              timestamptz,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists quotes_business_status_idx on public.quotes (business_id, status, created_at desc);
create index if not exists quotes_customer_idx        on public.quotes (customer_id);

alter table public.quotes enable row level security;

drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
  for insert with check (public.is_business_member(business_id, auth.uid()));
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes
  for update using (public.is_business_member(business_id, auth.uid()))
  with check (public.is_business_member(business_id, auth.uid()));
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes
  for delete using (public.is_business_member(business_id, auth.uid()));

-- ─── Quote lines ─────────────────────────────────────────────────
create table if not exists public.quote_lines (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes(id) on delete cascade,
  line_index   int not null default 1 check (line_index > 0),
  description  text not null,
  quantity     numeric not null default 1 check (quantity > 0),
  unit_price   numeric not null default 0 check (unit_price >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists quote_lines_quote_idx on public.quote_lines (quote_id, line_index);

alter table public.quote_lines enable row level security;

drop policy if exists quote_lines_select on public.quote_lines;
create policy quote_lines_select on public.quote_lines
  for select using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and public.is_business_member(q.business_id, auth.uid())
  ));
drop policy if exists quote_lines_write on public.quote_lines;
create policy quote_lines_write on public.quote_lines
  for all using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and public.is_business_member(q.business_id, auth.uid())
  )) with check (exists (
    select 1 from public.quotes q
    where q.id = quote_id and public.is_business_member(q.business_id, auth.uid())
  ));

-- ─── Auto-reference DEV-YYYY-NNNNN ──────────────────────────────
create or replace function public.quotes_generate_reference()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  yr text := to_char(now(), 'YYYY');
  n  int;
begin
  if new.reference is not null and length(new.reference) > 0 then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('quotes_ref_' || yr));
  select coalesce(max(nullif(regexp_replace(reference, '^DEV-' || yr || '-', ''), '')::int), 0)
    into n
    from public.quotes
    where reference like 'DEV-' || yr || '-%';
  new.reference := 'DEV-' || yr || '-' || lpad((n + 1)::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists quotes_ref_bi on public.quotes;
create trigger quotes_ref_bi before insert on public.quotes
  for each row execute function public.quotes_generate_reference();

-- ─── Touch updated_at ───────────────────────────────────────────
create or replace function public.quotes_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
  for each row execute function public.quotes_touch();
drop trigger if exists quote_lines_touch on public.quote_lines;
create trigger quote_lines_touch before update on public.quote_lines
  for each row execute function public.quotes_touch();

-- ─── Atomic conversion quote → shipment ─────────────────────────
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

  insert into public.shipments (
    business_id, customer_id, direction, mode, status, currency,
    origin_country, origin_city, destination_country, destination_city,
    total_weight_kg, total_volume_m3, goods_value, notes, created_by
  ) values (
    q.business_id, q.customer_id, q.direction, q.mode, 'booked', q.currency,
    q.origin_country, q.origin_city, q.destination_country, q.destination_city,
    q.weight_kg, q.volume_m3, q.customer_price, q.notes, auth.uid()
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
