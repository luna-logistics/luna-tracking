create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  customer_id           uuid references public.business_customers(id) on delete set null,
  shipment_id           uuid references public.shipments(id) on delete set null,
  quote_id              uuid references public.quotes(id) on delete set null,
  number                text unique,
  status                text not null default 'draft'
                        check (status in ('draft','issued','paid','overdue','cancelled')),
  currency              text not null default 'EUR' check (length(currency)=3),
  issued_on             date,
  due_on                date,
  paid_on               date,
  subtotal              numeric not null default 0 check (subtotal >= 0),
  vat_total             numeric not null default 0 check (vat_total >= 0),
  total                 numeric not null default 0 check (total >= 0),
  supplier_party        jsonb not null default '{}'::jsonb,
  customer_party        jsonb not null default '{}'::jsonb,
  endpoint_scheme       text default '9925',
  endpoint_id           text,
  payment_terms         text,
  payment_reference     text,
  notes                 text,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists invoices_business_idx on public.invoices (business_id, created_at desc);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_shipment_idx on public.invoices (shipment_id);
create index if not exists invoices_status_idx   on public.invoices (business_id, status);

alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting'));
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update using (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting'))
  with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting'));
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete using (
    public.business_role(business_id, auth.uid()) in ('owner','admin','accounting')
    and status = 'draft'
  );

create table if not exists public.invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  line_index        int not null default 1 check (line_index > 0),
  description       text not null,
  quantity          numeric not null default 1 check (quantity > 0),
  unit_price        numeric not null default 0 check (unit_price >= 0),
  vat_pct           numeric not null default 21 check (vat_pct >= 0 and vat_pct <= 100),
  item_code         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines (invoice_id, line_index);

alter table public.invoice_lines enable row level security;

drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and public.is_business_member(i.business_id, auth.uid())
  ));

drop policy if exists invoice_lines_write on public.invoice_lines;
create policy invoice_lines_write on public.invoice_lines
  for all using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and public.business_role(i.business_id, auth.uid()) in ('owner','admin','manager','accounting')
      and i.status = 'draft'
  )) with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and public.business_role(i.business_id, auth.uid()) in ('owner','admin','manager','accounting')
      and i.status = 'draft'
  ));

create or replace function public.invoices_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.invoices_touch();
drop trigger if exists invoice_lines_touch on public.invoice_lines;
create trigger invoice_lines_touch before update on public.invoice_lines
  for each row execute function public.invoices_touch();

create or replace function public.invoices_recompute_totals(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare sub numeric := 0; vat numeric := 0;
begin
  select
    coalesce(sum(round(quantity * unit_price, 2)), 0),
    coalesce(sum(round(quantity * unit_price * vat_pct / 100.0, 2)), 0)
  into sub, vat
  from public.invoice_lines
  where invoice_id = p_invoice;
  update public.invoices
  set subtotal = sub, vat_total = vat, total = sub + vat
  where id = p_invoice;
end;
$$;

create or replace function public.invoice_lines_totals_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.invoices_recompute_totals(old.invoice_id);
    return old;
  else
    perform public.invoices_recompute_totals(new.invoice_id);
    return new;
  end if;
end;
$$;

drop trigger if exists invoice_lines_totals on public.invoice_lines;
create trigger invoice_lines_totals
  after insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_totals_trigger();

-- Gapless numbering: FAC-YYYY-NNNNN under a per-business advisory lock.
-- Required by Belgian VAT / accounting rules: an issued invoice number
-- may never be reused, and the sequence must be uninterrupted per year.
create or replace function public.issue_invoice(p_invoice uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv    public.invoices;
  yr     text := to_char(now(), 'YYYY');
  n      int;
  new_no text;
  role   text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'not_found'; end if;

  role := public.business_role(inv.business_id, auth.uid());
  if role not in ('owner','admin','manager','accounting') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if inv.status in ('issued','paid','overdue') then
    return inv.number;
  end if;
  if inv.status = 'cancelled' then
    raise exception 'cannot_issue_cancelled_invoice';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice) then
    raise exception 'no_lines' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inv_' || inv.business_id::text || '_' || yr, 0));

  select coalesce(max(nullif(regexp_replace(number, '^FAC-' || yr || '-', ''), '')::int), 0)
  into n
  from public.invoices
  where business_id = inv.business_id
    and number is not null
    and number like 'FAC-' || yr || '-%';

  new_no := 'FAC-' || yr || '-' || lpad((n + 1)::text, 5, '0');

  update public.invoices
     set number = new_no,
         status = 'issued',
         issued_on = coalesce(issued_on, current_date)
   where id = p_invoice;

  return new_no;
end;
$$;

revoke all on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

create or replace function public.draft_invoice_from_shipment(p_shipment uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.shipments; inv uuid;
begin
  select * into s from public.shipments where id = p_shipment;
  if s.id is null then raise exception 'not_found'; end if;
  if public.business_role(s.business_id, auth.uid()) not in ('owner','admin','manager','accounting') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  insert into public.invoices (business_id, customer_id, shipment_id, currency, notes, created_by)
  values (s.business_id, s.customer_id, s.id, s.currency,
          'Généré depuis expédition ' || s.reference, auth.uid())
  returning id into inv;

  insert into public.invoice_lines (invoice_id, line_index, description, quantity, unit_price, vat_pct)
  select inv,
         row_number() over (order by c.created_at),
         c.label,
         1,
         c.amount,
         21
  from public.shipment_charges c
  where c.shipment_id = s.id and c.is_billable and c.currency = s.currency;

  return inv;
end;
$$;

revoke all on function public.draft_invoice_from_shipment(uuid) from public;
grant execute on function public.draft_invoice_from_shipment(uuid) to authenticated;
