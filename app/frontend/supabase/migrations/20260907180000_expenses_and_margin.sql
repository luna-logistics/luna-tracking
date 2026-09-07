create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  shipment_id   uuid references public.shipments(id) on delete set null,
  kind          text not null default 'other'
                check (kind in ('transport','handling','insurance','customs','storage','fuel','tax','subcontractor','office','other')),
  label         text not null,
  amount        numeric not null check (amount >= 0),
  currency      text not null default 'EUR' check (length(currency) = 3),
  vat_pct       numeric not null default 0 check (vat_pct >= 0 and vat_pct <= 100),
  vendor        text,
  invoice_ref   text,
  incurred_on   date not null default current_date,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists expenses_business_idx on public.expenses (business_id, incurred_on desc);
create index if not exists expenses_shipment_idx on public.expenses (shipment_id);

alter table public.expenses enable row level security;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting','operations'));
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting','operations'))
  with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting','operations'));
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (
    public.business_role(business_id, auth.uid()) in ('owner','admin','manager','accounting'));

create or replace function public.expenses_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.expenses_touch();

-- Per-shipment revenue / cost / margin in the shipment's currency,
-- plus per-currency tallies for lines in foreign currencies.
create or replace function public.get_shipment_margin(p_shipment uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  s              public.shipments;
  revenue_native numeric := 0;
  cost_native    numeric := 0;
  other_revenue  jsonb := '[]'::jsonb;
  other_cost     jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into s from public.shipments where id = p_shipment;
  if s.id is null then raise exception 'not_found'; end if;
  if not public.is_business_member(s.business_id, auth.uid()) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  select coalesce(sum(amount), 0) into revenue_native
  from public.shipment_charges
  where shipment_id = s.id and is_billable and currency = s.currency;

  select coalesce(sum(amount), 0) into cost_native
  from public.expenses
  where shipment_id = s.id and currency = s.currency;

  select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'amount', total) order by currency), '[]'::jsonb)
    into other_revenue
  from (
    select currency, sum(amount) as total
    from public.shipment_charges
    where shipment_id = s.id and is_billable and currency <> s.currency
    group by currency
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'amount', total) order by currency), '[]'::jsonb)
    into other_cost
  from (
    select currency, sum(amount) as total
    from public.expenses
    where shipment_id = s.id and currency <> s.currency
    group by currency
  ) t;

  return jsonb_build_object(
    'currency',       s.currency,
    'revenue',        revenue_native,
    'cost',           cost_native,
    'margin',         revenue_native - cost_native,
    'margin_pct',
      case when revenue_native = 0 then null
           else round(((revenue_native - cost_native) / revenue_native) * 100, 1) end,
    'other_currencies', jsonb_build_object(
      'revenue', other_revenue,
      'cost',    other_cost
    )
  );
end;
$$;

revoke all on function public.get_shipment_margin(uuid) from public;
grant execute on function public.get_shipment_margin(uuid) to authenticated;
