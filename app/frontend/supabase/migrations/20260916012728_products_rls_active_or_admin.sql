-- Fix draft leak: products "public read" was USING(true), exposing
-- is_active=false rows to anon via the API. Mirror blog_posts: public sees
-- active rows, admin sees all. Verified safe: Courses list already filters
-- is_active=true; product-by-slug drafts become 404 for anon (intended);
-- orders.items is a jsonb snapshot and the client cart is snapshot-based,
-- so no existing order/quote/cart reads a live product row.
drop policy "products public read" on public.products;
create policy "products public read active" on public.products for select
  using ((is_active = true) or is_admin(auth.uid()));
