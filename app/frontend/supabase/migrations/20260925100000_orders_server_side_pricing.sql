-- Achat & Envoi — the database is the only authority on an order's price.
--
-- Until now the browser sent `items[].unit_price` and `total`, and the
-- insert policy only checked `user_id`: anyone could create a 0.01 € order,
-- or insert one directly as `status = 'paid'`. This trigger rebuilds every
-- line from public.products on INSERT (price, name, slug), rejects unknown /
-- inactive products and bad quantities, recomputes `total`, and forces the
-- starting status for API callers. Whatever the client sends for price or
-- total is ignored. Stripe (create-checkout-session) charges orders.total,
-- which is therefore always server-computed.
--
-- After insert, `items` and `total` are frozen for API callers (admins
-- included): a Checkout Session is created from them, so they must never
-- drift from what the customer is asked to pay. Only the service role
-- (edge functions) or a direct SQL session may still change them.

create or replace function public.orders_reprice()
returns trigger
language plpgsql
security definer          -- must see inactive products to reject them explicitly
set search_path = public
as $$
declare
  api_caller boolean := coalesce(auth.role(), '') in ('anon', 'authenticated');
  it         jsonb;
  p          public.products;
  pid        uuid;
  qty        int;
  en         boolean;
  lines      jsonb := '[]'::jsonb;
  sum_total  numeric := 0;
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
    raise exception 'order_items_empty' using errcode = '22023';
  end if;
  if jsonb_array_length(new.items) > 100 then
    raise exception 'order_items_too_many' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    begin
      pid := (it->>'product_id')::uuid;
      qty := (it->>'quantity')::int;
    exception when others then
      raise exception 'order_item_invalid' using errcode = '22023';
    end;
    if pid is null or qty is null or qty < 1 or qty > 999 then
      raise exception 'order_item_invalid' using errcode = '22023';
    end if;

    select * into p from public.products where id = pid;
    if p.id is null or not p.is_active then
      raise exception 'order_product_unavailable: %', pid using errcode = 'P0001';
    end if;

    -- Keep the language the customer shopped in (their slug), but take the
    -- name and slug from the catalogue, never from the client.
    en := (it->>'slug') is not null and (it->>'slug') = p.slug_en;
    lines := lines || jsonb_build_object(
      'product_id', p.id,
      'slug',       coalesce(case when en then p.slug_en else p.slug_fr end, p.slug),
      'name',       case when en then p.name_en else p.name_fr end,
      'quantity',   qty,
      'unit_price', p.price
    );
    sum_total := sum_total + p.price * qty;
  end loop;

  new.items := lines;
  new.total := round(sum_total, 2);
  if api_caller then
    new.status := 'pending_payment';
  end if;
  return new;
end $$;

revoke all on function public.orders_reprice() from public, anon, authenticated;

drop trigger if exists orders_reprice on public.orders;
create trigger orders_reprice
  before insert on public.orders
  for each row execute function public.orders_reprice();

create or replace function public.orders_freeze_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and (new.items is distinct from old.items or new.total is distinct from old.total) then
    raise exception 'order_amounts_frozen' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists orders_freeze_amounts on public.orders;
create trigger orders_freeze_amounts
  before update on public.orders
  for each row execute function public.orders_freeze_amounts();
