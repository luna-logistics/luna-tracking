-- Follow-up to 20260910000000_support_chat: adds guest access (no
-- account needed) and an admin-controlled access-mode setting. The
-- guest path uses a capability-URL pattern (guest_token in URL, stored
-- in localStorage) and bypasses RLS through SECURITY DEFINER RPCs.

-- ─── Guest columns on support_conversations ─────────────────────
alter table public.support_conversations alter column user_id drop not null;

alter table public.support_conversations
  add column if not exists guest_email text,
  add column if not exists guest_name  text,
  add column if not exists guest_token uuid;

alter table public.support_conversations drop constraint if exists support_conversations_owner_check;
alter table public.support_conversations add constraint support_conversations_owner_check check (
  (user_id is not null and guest_token is null)
  or (user_id is null and guest_token is not null)
);

create unique index if not exists support_conversations_guest_token_uidx
  on public.support_conversations (guest_token) where guest_token is not null;

-- ─── platform_settings: support_access_mode ────────────────────
insert into public.platform_settings (key, value)
values ('support_access_mode', '"everyone"'::jsonb)
on conflict (key) do nothing;

-- ─── Access gate for authenticated INSERTs ─────────────────────
create or replace function public.support_access_allowed()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare mode text; acc text;
begin
  if public.is_admin(auth.uid()) then return true; end if;
  select coalesce(value #>> '{}', 'everyone') into mode
    from public.platform_settings where key = 'support_access_mode';
  if mode = 'everyone' then return true; end if;
  if auth.uid() is null then return false; end if;
  if mode = 'authenticated' then return true; end if;
  select account_type into acc from public.profiles where id = auth.uid();
  if mode = 'individual' and acc = 'individual' then return true; end if;
  if mode = 'business'   and acc = 'business'   then return true; end if;
  return false;
end;
$$;
revoke all on function public.support_access_allowed() from public;
grant execute on function public.support_access_allowed() to anon, authenticated;

drop policy if exists support_conversations_insert on public.support_conversations;
create policy support_conversations_insert on public.support_conversations
  for insert with check (user_id = auth.uid() and public.support_access_allowed());

-- ─── Guest RPCs (guest_token = capability) ─────────────────────
create or replace function public.guest_create_support_conversation(
  p_email text, p_name text, p_subject text, p_body text
) returns table (conversation_id uuid, guest_token uuid)
language plpgsql security definer set search_path = public as $$
declare mode text; new_conv uuid; new_token uuid := gen_random_uuid();
begin
  select coalesce(value #>> '{}', 'everyone') into mode
    from public.platform_settings where key = 'support_access_mode';
  if mode <> 'everyone' then raise exception 'guest_access_disabled' using errcode = '42501'; end if;
  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then raise exception 'invalid_email'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(trim(p_body)) > 5000 then raise exception 'invalid_body'; end if;

  insert into public.support_conversations (user_id, guest_email, guest_name, guest_token, subject)
  values (null, lower(trim(p_email)), nullif(trim(p_name), ''), new_token,
          nullif(trim(coalesce(p_subject, '')), ''))
  returning id into new_conv;

  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (new_conv, null, 'client', trim(p_body));

  return query select new_conv, new_token;
end;
$$;
revoke all on function public.guest_create_support_conversation(text, text, text, text) from public;
grant execute on function public.guest_create_support_conversation(text, text, text, text) to anon, authenticated;

create or replace function public.guest_send_support_message(p_token uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare conv_id uuid; conv_status text; new_id uuid;
begin
  if p_token is null then raise exception 'invalid_token'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(trim(p_body)) > 5000 then raise exception 'invalid_body'; end if;
  select id, status into conv_id, conv_status from public.support_conversations where guest_token = p_token;
  if conv_id is null then raise exception 'not_found'; end if;
  if conv_status = 'closed' then raise exception 'conversation_closed'; end if;
  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (conv_id, null, 'client', trim(p_body))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.guest_send_support_message(uuid, text) from public;
grant execute on function public.guest_send_support_message(uuid, text) to anon, authenticated;

create or replace function public.guest_fetch_support_conversation(p_token uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare conv record; msgs jsonb;
begin
  if p_token is null then return null; end if;
  select id, subject, status, created_at, guest_email, guest_name
    into conv from public.support_conversations where guest_token = p_token;
  if conv.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'sender_role', m.sender_role, 'body', m.body,
    'created_at', m.created_at, 'read_at', m.read_at
  ) order by m.created_at), '[]'::jsonb)
    into msgs from public.support_messages m where m.conversation_id = conv.id;

  update public.support_messages set read_at = now()
  where conversation_id = conv.id and sender_role = 'admin' and read_at is null;

  return jsonb_build_object(
    'id', conv.id, 'subject', conv.subject, 'status', conv.status,
    'created_at', conv.created_at, 'email', conv.guest_email, 'name', conv.guest_name,
    'messages', msgs
  );
end;
$$;
revoke all on function public.guest_fetch_support_conversation(uuid) from public;
grant execute on function public.guest_fetch_support_conversation(uuid) to anon, authenticated;

-- ─── Enriched conversation list (adds is_guest + guest fallback) ─
drop function if exists public.support_conversations_with_unread();
create or replace function public.support_conversations_with_unread()
returns table (
  id uuid, user_id uuid, subject text, status text,
  last_message_at timestamptz, created_at timestamptz,
  last_body text, last_sender_role text, unread_count int,
  user_email text, user_display_name text, is_guest boolean
)
language plpgsql security definer stable set search_path = public as $$
declare is_a boolean := public.is_admin(auth.uid());
begin
  return query
  select
    c.id, c.user_id, c.subject, c.status, c.last_message_at, c.created_at,
    (select body from public.support_messages m
      where m.conversation_id = c.id order by created_at desc limit 1) as last_body,
    (select sender_role from public.support_messages m
      where m.conversation_id = c.id order by created_at desc limit 1) as last_sender_role,
    (select count(*)::int from public.support_messages m
      where m.conversation_id = c.id and m.read_at is null
        and m.sender_role = case when is_a then 'client' else 'admin' end) as unread_count,
    coalesce((select email from auth.users u where u.id = c.user_id)::text, c.guest_email) as user_email,
    coalesce((select full_name from public.profiles p where p.id = c.user_id)::text, c.guest_name) as user_display_name,
    (c.user_id is null) as is_guest
  from public.support_conversations c
  where c.user_id = auth.uid() or is_a
  order by c.last_message_at desc nulls last, c.created_at desc;
end;
$$;
revoke all on function public.support_conversations_with_unread() from public;
grant execute on function public.support_conversations_with_unread() to authenticated;

-- ─── Admin sets the access mode ─────────────────────────────────
create or replace function public.set_support_access_mode(p_mode text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if p_mode not in ('everyone','authenticated','individual','business') then
    raise exception 'invalid_mode';
  end if;
  insert into public.platform_settings (key, value)
  values ('support_access_mode', to_jsonb(p_mode))
  on conflict (key) do update set value = to_jsonb(p_mode), updated_at = now();
  return p_mode;
end;
$$;
revoke all on function public.set_support_access_mode(text) from public;
grant execute on function public.set_support_access_mode(text) to authenticated;
