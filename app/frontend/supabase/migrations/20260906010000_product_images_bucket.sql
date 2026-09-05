-- Luna Tracking — product-images Storage bucket.
--
-- Admin upload of product photos via /admin/produits. Public read so <img>
-- from the shop catalog + product detail pages just works with the URL
-- returned by getPublicUrl().

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product-images bucket public read" on storage.objects;
create policy "product-images bucket public read" on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "product-images bucket admin write" on storage.objects;
create policy "product-images bucket admin write" on storage.objects for all
  using (bucket_id = 'product-images' and public.is_admin(auth.uid()))
  with check (bucket_id = 'product-images' and public.is_admin(auth.uid()));
