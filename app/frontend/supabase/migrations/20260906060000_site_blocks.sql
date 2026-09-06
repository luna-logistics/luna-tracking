-- Luna Tracking — hide/show blocks on public pages.
--
-- One row per block_key with a `hidden` flag. Absent row = visible by
-- default (never seed here — additions arrive silently as pages ship).
-- Admin toggle via /admin/contenus or the in-place edit-mode overlay.

create table if not exists public.site_blocks (
  id         uuid primary key default gen_random_uuid(),
  block_key  text not null unique check (block_key ~ '^[a-z0-9-]+$'),
  hidden     boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists site_blocks_touch on public.site_blocks;
create trigger site_blocks_touch
  before update on public.site_blocks
  for each row execute function public.touch_updated_at();

alter table public.site_blocks enable row level security;

drop policy if exists "site_blocks public read" on public.site_blocks;
create policy "site_blocks public read" on public.site_blocks for select using (true);

drop policy if exists "site_blocks admin write" on public.site_blocks;
create policy "site_blocks admin write" on public.site_blocks for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
