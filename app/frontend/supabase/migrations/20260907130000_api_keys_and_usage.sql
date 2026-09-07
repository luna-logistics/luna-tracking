create extension if not exists pgcrypto;

-- ─── api_keys ────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  key_prefix    text not null unique,
  key_hash      text not null,
  permissions   jsonb not null default '[]'::jsonb,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists api_keys_business_idx on public.api_keys (business_id, revoked_at);

alter table public.api_keys enable row level security;

drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys
  for select using (public.is_business_member(business_id, auth.uid()));

drop policy if exists api_keys_insert on public.api_keys;
create policy api_keys_insert on public.api_keys
  for insert with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin')
  );

drop policy if exists api_keys_update on public.api_keys;
create policy api_keys_update on public.api_keys
  for update using (
    public.business_role(business_id, auth.uid()) in ('owner','admin')
  ) with check (
    public.business_role(business_id, auth.uid()) in ('owner','admin')
  );

drop policy if exists api_keys_delete on public.api_keys;
create policy api_keys_delete on public.api_keys
  for delete using (
    public.business_role(business_id, auth.uid()) in ('owner','admin')
  );

-- ─── api_usage_log ───────────────────────────────────────────────
create table if not exists public.api_usage_log (
  id            uuid primary key default gen_random_uuid(),
  api_key_id    uuid references public.api_keys(id) on delete set null,
  business_id   uuid references public.businesses(id) on delete set null,
  method        text not null,
  path          text not null,
  status        int not null,
  response_ms   int,
  created_at    timestamptz not null default now()
);
create index if not exists api_usage_log_business_idx on public.api_usage_log (business_id, created_at desc);
create index if not exists api_usage_log_key_idx      on public.api_usage_log (api_key_id, created_at desc);

alter table public.api_usage_log enable row level security;

drop policy if exists api_usage_log_select on public.api_usage_log;
create policy api_usage_log_select on public.api_usage_log
  for select using (
    business_id is null
      or public.business_role(business_id, auth.uid()) in ('owner','admin')
  );

-- No INSERT policy — inserts go through log_api_call() RPC (SECURITY DEFINER).

-- ─── RPCs ────────────────────────────────────────────────────────

-- Create a new key. Returns (id, full_key) — the raw key is shown ONCE.
create or replace function public.create_api_key(
  p_business    uuid,
  p_name        text,
  p_permissions jsonb default '[]'::jsonb
)
returns table (id uuid, full_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  prefix text;
  secret text;
  full_k text;
  hash   text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if public.business_role(p_business, auth.uid()) not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name_required';
  end if;

  prefix := 'lk_live_' || encode(gen_random_bytes(6), 'hex');
  secret := encode(gen_random_bytes(24), 'hex');
  full_k := prefix || '.' || secret;
  hash   := encode(digest(secret, 'sha256'), 'hex');

  insert into public.api_keys (business_id, name, key_prefix, key_hash, permissions, created_by)
  values (p_business, trim(p_name), prefix, hash, coalesce(p_permissions, '[]'::jsonb), auth.uid())
  returning public.api_keys.id into new_id;

  return query select new_id as id, full_k as full_key;
end;
$$;

revoke all on function public.create_api_key(uuid, text, jsonb) from public;
grant execute on function public.create_api_key(uuid, text, jsonb) to authenticated;

-- Revoke a key (soft — keeps audit trail).
create or replace function public.revoke_api_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  biz uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select business_id into biz from public.api_keys where id = p_id;
  if biz is null then
    raise exception 'not_found';
  end if;
  if public.business_role(biz, auth.uid()) not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end;
$$;

revoke all on function public.revoke_api_key(uuid) from public;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- Verify a full key. Returns the row's business_id + permissions if
-- the key is valid and not revoked. Called from api-v1 for ApiKey auth.
-- Anon-executable because the caller has not authenticated with a JWT yet.
create or replace function public.verify_api_key(p_full_key text)
returns table (api_key_id uuid, business_id uuid, permissions jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  parts text[];
  prefix text;
  secret text;
  hash text;
begin
  if p_full_key is null then return; end if;
  parts := string_to_array(p_full_key, '.');
  if array_length(parts, 1) <> 2 then return; end if;
  prefix := parts[1];
  secret := parts[2];
  if length(prefix) = 0 or length(secret) = 0 then return; end if;
  hash := encode(digest(secret, 'sha256'), 'hex');

  return query
    select k.id, k.business_id, k.permissions
    from public.api_keys k
    where k.key_prefix = prefix
      and k.key_hash   = hash
      and k.revoked_at is null;
end;
$$;

revoke all on function public.verify_api_key(text) from public;
grant execute on function public.verify_api_key(text) to anon, authenticated;

-- Log a call. Fire-and-forget from api-v1.
create or replace function public.log_api_call(
  p_api_key_id  uuid,
  p_business_id uuid,
  p_method      text,
  p_path        text,
  p_status      int,
  p_response_ms int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.api_usage_log (api_key_id, business_id, method, path, status, response_ms)
  values (p_api_key_id, p_business_id, p_method, p_path, p_status, p_response_ms);

  if p_api_key_id is not null then
    update public.api_keys set last_used_at = now() where id = p_api_key_id;
  end if;
end;
$$;

revoke all on function public.log_api_call(uuid, uuid, text, text, int, int) from public;
grant execute on function public.log_api_call(uuid, uuid, text, text, int, int) to anon, authenticated;
