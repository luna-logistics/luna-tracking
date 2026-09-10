-- IndexNow automated submissions (Option A: pg_cron watermark).
-- Same pattern as Homie Book: stamp seo_changed_at on meaningful edits
-- to entities that own crawlable public URLs, and let a pg_cron job
-- every 15 min submit the delta to api.indexnow.org via an edge
-- function.
--
-- Luna's public/indexable dynamic entities:
--   products      is_active=true, slug not null → /achat-envoi/{slug} (+/en/shop-and-ship/)
--   blog_posts    published=true                → /blog/{slug} (+/en/blog/)
--   custom_pages  published=true                → /{slug_fr} (+/en/{slug_en})
--
-- Static URLs (from the URL registry) are NOT re-submitted every cycle
-- — they're covered once at first crawl, then only entities that change
-- flow through here.

create extension if not exists pg_net;

-- ─── 1. Change markers ─────────────────────────────────────────
alter table public.products     add column if not exists seo_changed_at timestamptz;
alter table public.blog_posts   add column if not exists seo_changed_at timestamptz;
alter table public.custom_pages add column if not exists seo_changed_at timestamptz;

-- ─── 2. Watermark (single row) ────────────────────────────────
create table if not exists public.indexnow_state (
  id boolean primary key default true,
  last_run_at timestamptz not null default now(),
  constraint indexnow_state_singleton check (id)
);
insert into public.indexnow_state (id, last_run_at) values (true, now())
on conflict (id) do nothing;

-- ─── 3. Triggers ──────────────────────────────────────────────
create or replace function public.tg_products_seo_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.seo_changed_at := now();
  elsif tg_op = 'UPDATE' and (
       new.is_active            is distinct from old.is_active
    or new.slug                 is distinct from old.slug
    or new.slug_fr              is distinct from old.slug_fr
    or new.slug_en              is distinct from old.slug_en
    or new.name_fr              is distinct from old.name_fr
    or new.name_en              is distinct from old.name_en
    or new.description_fr       is distinct from old.description_fr
    or new.description_en       is distinct from old.description_en
    or new.meta_title_fr        is distinct from old.meta_title_fr
    or new.meta_title_en        is distinct from old.meta_title_en
    or new.meta_description_fr  is distinct from old.meta_description_fr
    or new.meta_description_en  is distinct from old.meta_description_en
  ) then new.seo_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_products_seo_changed on public.products;
create trigger trg_products_seo_changed
  before insert or update on public.products
  for each row execute function public.tg_products_seo_changed();

create or replace function public.tg_blog_posts_seo_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.seo_changed_at := now();
  elsif tg_op = 'UPDATE' and (
       new.published            is distinct from old.published
    or new.slug                 is distinct from old.slug
    or new.slug_fr              is distinct from old.slug_fr
    or new.slug_en              is distinct from old.slug_en
    or new.title_fr             is distinct from old.title_fr
    or new.title_en             is distinct from old.title_en
    or new.meta_title_fr        is distinct from old.meta_title_fr
    or new.meta_title_en        is distinct from old.meta_title_en
    or new.meta_description_fr  is distinct from old.meta_description_fr
    or new.meta_description_en  is distinct from old.meta_description_en
  ) then new.seo_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_blog_posts_seo_changed on public.blog_posts;
create trigger trg_blog_posts_seo_changed
  before insert or update on public.blog_posts
  for each row execute function public.tg_blog_posts_seo_changed();

create or replace function public.tg_custom_pages_seo_changed()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.seo_changed_at := now();
  elsif tg_op = 'UPDATE' and (
       new.published            is distinct from old.published
    or new.slug_fr              is distinct from old.slug_fr
    or new.slug_en              is distinct from old.slug_en
    or new.title_fr             is distinct from old.title_fr
    or new.title_en             is distinct from old.title_en
    or new.meta_title_fr        is distinct from old.meta_title_fr
    or new.meta_title_en        is distinct from old.meta_title_en
    or new.meta_description_fr  is distinct from old.meta_description_fr
    or new.meta_description_en  is distinct from old.meta_description_en
  ) then new.seo_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_custom_pages_seo_changed on public.custom_pages;
create trigger trg_custom_pages_seo_changed
  before insert or update on public.custom_pages
  for each row execute function public.tg_custom_pages_seo_changed();

-- ─── 4. pg_cron (every 15 min) ───────────────────────────────
-- Requires Vault secrets: indexnow_submit_url (edge fn URL) and
-- anon_key (for the JWT-verified gateway auth). Same shape as Homie
-- Book. Job is idempotent — if the last run already emptied the queue,
-- the next fires but submits 0 URLs (200 OK, no side effect).
do $$
declare fn_url text; anon text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'indexnow_submit_url' limit 1;
  select decrypted_secret into anon   from vault.decrypted_secrets where name = 'anon_key'            limit 1;
  if fn_url is null or anon is null then
    raise notice 'indexnow cron: missing Vault secrets indexnow_submit_url or anon_key — cron NOT scheduled. Add them and re-run this DO block.';
    return;
  end if;
  perform cron.unschedule('indexnow-submit');
exception when others then null;
end $$;

do $$
declare fn_url text; anon text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'indexnow_submit_url' limit 1;
  select decrypted_secret into anon   from vault.decrypted_secrets where name = 'anon_key'            limit 1;
  if fn_url is null or anon is null then return; end if;
  perform cron.schedule('indexnow-submit', '*/15 * * * *', format($job$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','Authorization', 'Bearer %s'),
      body := '{}'::jsonb
    );
  $job$, fn_url, anon));
end $$;
