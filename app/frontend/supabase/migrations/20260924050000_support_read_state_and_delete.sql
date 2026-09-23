-- Support inbox: unread state that actually clears + admin soft-delete.
--
-- Read state stays per message (support_messages.read_at, stamped by whoever
-- the message was FOR: client messages by staff, staff messages by the client).
-- Three bugs made the badges wrong:
--   1. mark_conversation_read() raised 'not_found' for every GUEST
--      conversation (user_id is null) — staff could never mark a Contact /
--      /tarifs guest thread as read, so its badge never cleared.
--   2. guest_fetch_support_conversation() marked staff replies read on EVERY
--      fetch — including the chat bubble's 15-second background poll — so a
--      guest's badge vanished (and staff saw "read") without anyone opening
--      the conversation. Marking is now its own call, made only when the
--      bubble actually shows the conversation: guest_mark_support_read().
--   3. (front end) the dashboard badges refreshed on new messages only, never
--      after a read — fixed in lib/support-chat.ts.
--
-- Deletion is a SOFT delete (deleted_at / deleted_by): the conversation leaves
-- every list and unread count, nobody can post into it, and staff can restore
-- it from the inbox's "Supprimées" view. Messages and the office send log
-- (office_notifications → support_messages) stay intact, so nothing is
-- orphaned. Admin-only; guests and clients can never delete.

alter table public.support_conversations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- 1. Staff can mark guest conversations read (owner NULL no longer "not found").
create or replace function public.mark_conversation_read(p_conversation uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  conv record;
  affected int;
  caller_is_admin boolean := coalesce(public.is_admin(auth.uid()), false);
begin
  select id, user_id into conv from public.support_conversations where id = p_conversation;
  if conv.id is null then raise exception 'not_found'; end if;
  if not caller_is_admin and (conv.user_id is null or conv.user_id is distinct from auth.uid()) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  update public.support_messages
    set read_at = now()
  where conversation_id = p_conversation
    and read_at is null
    and sender_role = case when caller_is_admin then 'client' else 'admin' end;
  get diagnostics affected = row_count;
  return affected;
end;
$function$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- 2. Guest fetch no longer marks anything read; a deleted thread is gone.
create or replace function public.guest_fetch_support_conversation(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare conv record; msgs jsonb;
begin
  if p_token is null then return null; end if;
  select id, subject, status, created_at, guest_email, guest_name
    into conv from public.support_conversations
   where guest_token = p_token and deleted_at is null;
  if conv.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'sender_role', m.sender_role, 'body', m.body,
    'created_at', m.created_at, 'read_at', m.read_at
  ) order by m.created_at), '[]'::jsonb)
    into msgs from public.support_messages m where m.conversation_id = conv.id;

  return jsonb_build_object(
    'id', conv.id, 'subject', conv.subject, 'status', conv.status,
    'created_at', conv.created_at, 'email', conv.guest_email, 'name', conv.guest_name,
    'messages', msgs
  );
end;
$function$;

create or replace function public.guest_mark_support_read(p_token uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare affected int;
begin
  if p_token is null then return 0; end if;
  update public.support_messages m
     set read_at = now()
    from public.support_conversations c
   where c.guest_token = p_token and c.deleted_at is null
     and m.conversation_id = c.id and m.sender_role = 'admin' and m.read_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$function$;
revoke all on function public.guest_mark_support_read(uuid) from public;
grant execute on function public.guest_mark_support_read(uuid) to anon, authenticated;

create or replace function public.guest_send_support_message(p_token uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare conv_id uuid; conv_status text; new_id uuid;
begin
  if p_token is null then raise exception 'invalid_token'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(trim(p_body)) > 5000 then raise exception 'invalid_body'; end if;
  select id, status into conv_id, conv_status from public.support_conversations
   where guest_token = p_token and deleted_at is null;
  if conv_id is null then raise exception 'not_found'; end if;
  if conv_status = 'closed' then raise exception 'conversation_closed'; end if;
  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (conv_id, null, 'client', trim(p_body))
  returning id into new_id;
  return new_id;
end;
$function$;

-- Nobody posts into a deleted conversation (no hidden threads, no e-mails
-- pointing at a conversation the inbox no longer shows).
create or replace function public.support_messages_stamp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare owner_id uuid; conv_deleted timestamptz;
begin
  new.sender_id := auth.uid();
  select c.user_id, c.deleted_at into owner_id, conv_deleted
    from public.support_conversations c where c.id = new.conversation_id;
  if conv_deleted is not null then
    raise exception 'conversation_deleted' using errcode = 'P0001';
  end if;
  new.sender_role := case
    when coalesce(public.is_admin(auth.uid()), false)
         and (owner_id is null or owner_id is distinct from auth.uid()) then 'admin'
    else 'client'
  end;
  return new;
end;
$function$;

-- Lists: deleted conversations leave every list; staff can ask for them.
drop function if exists public.support_conversations_with_unread();
create function public.support_conversations_with_unread(p_deleted boolean default false)
returns table(id uuid, user_id uuid, subject text, status text, last_message_at timestamptz,
  created_at timestamptz, last_body text, last_sender_role text, unread_count integer,
  user_email text, user_display_name text, is_guest boolean, deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare is_a boolean := coalesce(public.is_admin(auth.uid()), false);
begin
  return query
  select
    c.id, c.user_id, c.subject, c.status, c.last_message_at, c.created_at,
    (select m.body from public.support_messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select m.sender_role from public.support_messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select count(*)::int from public.support_messages m
      where m.conversation_id = c.id and m.read_at is null
        and m.sender_role = case when is_a then 'client' else 'admin' end),
    coalesce((select u.email from auth.users u where u.id = c.user_id)::text, c.guest_email),
    coalesce((select p.full_name from public.profiles p where p.id = c.user_id)::text, c.guest_name),
    (c.user_id is null),
    c.deleted_at
  from public.support_conversations c
  where (c.user_id = auth.uid() or is_a)
    and case when is_a and coalesce(p_deleted, false) then c.deleted_at is not null
             else c.deleted_at is null end
  order by c.last_message_at desc nulls last, c.created_at desc;
end;
$function$;
revoke all on function public.support_conversations_with_unread(boolean) from public, anon;
grant execute on function public.support_conversations_with_unread(boolean) to authenticated;

create or replace function public.support_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  n int;
  is_a boolean := coalesce(public.is_admin(auth.uid()), false);
begin
  if is_a then
    select count(*)::int into n
    from public.support_messages m
    join public.support_conversations c on c.id = m.conversation_id
    where m.read_at is null and m.sender_role = 'client' and c.deleted_at is null;
  else
    select count(*)::int into n
    from public.support_messages m
    join public.support_conversations c on c.id = m.conversation_id
    where m.read_at is null and m.sender_role = 'admin' and c.user_id = auth.uid()
      and c.deleted_at is null;
  end if;
  return coalesce(n, 0);
end;
$function$;
revoke all on function public.support_unread_count() from public, anon;
grant execute on function public.support_unread_count() to authenticated;

-- Admin-only soft delete / restore.
create or replace function public.admin_delete_support_conversation(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.support_conversations
     set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, auth.uid())
   where id = p_id;
  if not found then raise exception 'not_found'; end if;
end;
$function$;

create or replace function public.admin_restore_support_conversation(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.support_conversations set deleted_at = null, deleted_by = null where id = p_id;
  if not found then raise exception 'not_found'; end if;
end;
$function$;
revoke all on function public.admin_delete_support_conversation(uuid) from public, anon;
revoke all on function public.admin_restore_support_conversation(uuid) from public, anon;
grant execute on function public.admin_delete_support_conversation(uuid) to authenticated;
grant execute on function public.admin_restore_support_conversation(uuid) to authenticated;

-- Clients may UPDATE their own conversation row (RLS: status), so the delete
-- columns are guarded separately: only staff — or the SECURITY DEFINER admin
-- functions above, which run as the owner — may set or clear them.
create or replace function public.support_conversations_guard_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT' and (new.deleted_at is not null or new.deleted_by is not null))
     or (tg_op = 'UPDATE' and (new.deleted_at is distinct from old.deleted_at
                               or new.deleted_by is distinct from old.deleted_by)) then
    if current_user not in ('postgres', 'supabase_admin', 'service_role')
       and not coalesce(public.is_admin(auth.uid()), false) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists support_conversations_guard_delete on public.support_conversations;
create trigger support_conversations_guard_delete
  before insert or update on public.support_conversations
  for each row execute function public.support_conversations_guard_delete();
