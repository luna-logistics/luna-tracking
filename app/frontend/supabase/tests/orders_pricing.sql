-- Regression test: Achat & Envoi order amounts are server-computed.
--
-- Covers migration 20260925100000_orders_server_side_pricing:
--   * a forged unit_price / total / status from an authenticated client is
--     overwritten (price from products, status forced to pending_payment)
--   * inactive / unknown products and bad quantities are refused
--   * items / total cannot be changed afterwards by an API caller
--
-- Run: Supabase SQL editor, or `psql "$DB_URL" -f supabase/tests/orders_pricing.sql`.
-- It ALWAYS rolls back: the block ends by raising either
--   "ORDER PRICING TEST PASSED (rolled back) …"  or  "ORDER PRICING TEST FAILED …".
-- Fixtures (one active + one inactive product, orders) live only inside the
-- transaction.

do $$
declare
  uid      uuid;
  cat      uuid;
  p_on     uuid;
  p_off    uuid;
  o        public.orders;
  ok       text[] := '{}';
  bad      text[] := '{}';
  msg      text;
begin
  select id into uid from auth.users order by created_at limit 1;
  select id into cat from public.product_categories order by display_order limit 1;
  if uid is null or cat is null then raise exception 'ORDER PRICING TEST FAILED: no user or category to build fixtures'; end if;

  insert into public.products (slug, slug_fr, slug_en, name_fr, name_en, price, category_id, is_active)
    values ('zz-test-on', 'zz-test-on-fr', 'zz-test-on-en', 'Test FR', 'Test EN', 12.34, cat, true) returning id into p_on;
  insert into public.products (slug, slug_fr, slug_en, name_fr, name_en, price, category_id, is_active)
    values ('zz-test-off', 'zz-test-off-fr', 'zz-test-off-en', 'Off FR', 'Off EN', 5, cat, false) returning id into p_off;

  -- Act as the authenticated customer from here on.
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. forged price, total and status are ignored
  insert into public.orders (user_id, items, total, status, recipient_name, recipient_phone, recipient_address)
  values (uid,
    jsonb_build_array(jsonb_build_object('product_id', p_on, 'slug', 'zz-test-on-en', 'name', 'HACK', 'quantity', 3, 'unit_price', 0.01)),
    0.03, 'paid', 'T', '0', 'A')
  returning * into o;
  if o.total = 37.02 then ok := ok || 'total recomputed'::text; else bad := bad || format('total=%s (want 37.02)', o.total); end if;
  if o.status = 'pending_payment' then ok := ok || 'status forced'::text; else bad := bad || format('status=%s', o.status); end if;
  if (o.items->0->>'unit_price')::numeric = 12.34 and o.items->0->>'name' = 'Test EN' then ok := ok || 'line rebuilt (EN)'::text;
  else bad := bad || format('line=%s', o.items->0); end if;

  -- 2. frozen afterwards
  begin
    update public.orders set total = 0.01 where id = o.id;
    -- authenticated non-admins are filtered by RLS (0 rows) — also acceptable
    if (select total from public.orders where id = o.id) = 37.02 then ok := ok || 'total not updatable'::text;
    else bad := bad || 'total was updated'::text; end if;
  exception when others then
    if sqlerrm like 'order_amounts_frozen%' then ok := ok || 'total frozen'::text; else bad := bad || ('update: ' || sqlerrm); end if;
  end;

  -- 3. inactive product refused
  begin
    insert into public.orders (user_id, items, total, recipient_name, recipient_phone, recipient_address)
    values (uid, jsonb_build_array(jsonb_build_object('product_id', p_off, 'quantity', 1)), 0, 'T', '0', 'A');
    bad := bad || 'inactive product accepted'::text;
  exception when others then
    if sqlerrm like 'order_product_unavailable%' then ok := ok || 'inactive refused'::text; else bad := bad || ('inactive: ' || sqlerrm); end if;
  end;

  -- 4. bad quantity / empty cart refused
  begin
    insert into public.orders (user_id, items, total, recipient_name, recipient_phone, recipient_address)
    values (uid, jsonb_build_array(jsonb_build_object('product_id', p_on, 'quantity', 0)), 0, 'T', '0', 'A');
    bad := bad || 'qty 0 accepted'::text;
  exception when others then
    if sqlerrm like 'order_item_invalid%' then ok := ok || 'qty 0 refused'::text; else bad := bad || ('qty: ' || sqlerrm); end if;
  end;
  begin
    insert into public.orders (user_id, items, total, recipient_name, recipient_phone, recipient_address)
    values (uid, '[]'::jsonb, 0, 'T', '0', 'A');
    bad := bad || 'empty cart accepted'::text;
  exception when others then
    if sqlerrm like 'order_items_empty%' then ok := ok || 'empty refused'::text; else bad := bad || ('empty: ' || sqlerrm); end if;
  end;

  if array_length(bad, 1) is null then
    raise exception 'ORDER PRICING TEST PASSED (rolled back) — %', array_to_string(ok, ', ');
  end if;
  msg := array_to_string(bad, ' | ');
  raise exception 'ORDER PRICING TEST FAILED — % (ok: %)', msg, array_to_string(ok, ', ');
end $$;
