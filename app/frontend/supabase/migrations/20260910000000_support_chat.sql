-- ─── Conversations ────────────────────────────────────────────────
create table if not exists public.support_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  subject          text,
  status           text not null default 'open' check (status in ('open','closed')),
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists support_conversations_user_idx
  on public.support_conversations (user_id, last_message_at desc nulls last);
create index if not exists support_conversations_status_idx
  on public.support_conversations (status, last_message_at desc nulls last);

alter table public.support_conversations enable row level security;

drop policy if exists support_conversations_select on public.support_conversations;
create policy support_conversations_select on public.support_conversations
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists support_conversations_insert on public.support_conversations;
create policy support_conversations_insert on public.support_conversations
  for insert with check (user_id = auth.uid());

drop policy if exists support_conversations_update on public.support_conversations;
create policy support_conversations_update on public.support_conversations
  for update using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check      (user_id = auth.uid() or public.is_admin(auth.uid()));

-- No DELETE policy — conversations are an audit trail; admin can close but not erase.

create or replace function public.support_conversations_touch() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists support_conversations_touch on public.support_conversations;
create trigger support_conversations_touch before update on public.support_conversations
  for each row execute function public.support_conversations_touch();

-- ─── Messages ─────────────────────────────────────────────────────
create table if not exists public.support_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.support_conversations(id) on delete cascade,
  sender_id        uuid references auth.users(id) on delete set null,
  sender_role      text not null check (sender_role in ('client','admin')),
  body             text not null check (length(body) between 1 and 5000),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists support_messages_conversation_idx
  on public.support_messages (conversation_id, created_at);
create index if not exists support_messages_unread_idx
  on public.support_messages (conversation_id, sender_role) where read_at is null;

alter table public.support_messages enable row level security;

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
  for select using (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and (c.user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages
  for insert with check (
    exists (
      select 1 from public.support_conversations c
      where c.id = conversation_id
        and (c.user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

-- No UPDATE/DELETE policy on messages — read_at moves through the
-- mark_conversation_read() RPC (SECURITY DEFINER); a sent message is
-- otherwise immutable.

-- ─── Sender stamp — anti-tamper ──────────────────────────────────
-- Client cannot pretend to be admin: sender_id + sender_role are
-- computed server-side from auth.uid() and public.is_admin.
create or replace function public.support_messages_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sender_id := auth.uid();
  new.sender_role := case when public.is_admin(auth.uid()) then 'admin' else 'client' end;
  return new;
end;
$$;
drop trigger if exists support_messages_stamp on public.support_messages;
create trigger support_messages_stamp before insert on public.support_messages
  for each row execute function public.support_messages_stamp();

-- ─── Bump last_message_at on new message ─────────────────────────
create or replace function public.support_messages_bump_conv() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.support_conversations
    set last_message_at = new.created_at,
        updated_at      = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists support_messages_bump_conv on public.support_messages;
create trigger support_messages_bump_conv after insert on public.support_messages
  for each row execute function public.support_messages_bump_conv();

-- ─── RPC: mark_conversation_read ────────────────────────────────
create or replace function public.mark_conversation_read(p_conversation uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  conv_owner uuid;
  affected int;
  caller_is_admin boolean := public.is_admin(auth.uid());
begin
  select user_id into conv_owner from public.support_conversations where id = p_conversation;
  if conv_owner is null then raise exception 'not_found'; end if;
  if conv_owner <> auth.uid() and not caller_is_admin then
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
$$;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ─── RPC: support_unread_count (global badge) ────────────────────
create or replace function public.support_unread_count()
returns int
language plpgsql security definer stable set search_path = public as $$
declare
  n int;
  is_a boolean := public.is_admin(auth.uid());
begin
  if is_a then
    select count(*)::int into n
    from public.support_messages
    where read_at is null and sender_role = 'client';
  else
    select count(*)::int into n
    from public.support_messages m
    join public.support_conversations c on c.id = m.conversation_id
    where m.read_at is null and m.sender_role = 'admin' and c.user_id = auth.uid();
  end if;
  return coalesce(n, 0);
end;
$$;
revoke all on function public.support_unread_count() from public;
grant execute on function public.support_unread_count() to authenticated;

-- ─── RPC: enriched conversation list for the UI ─────────────────
create or replace function public.support_conversations_with_unread()
returns table (
  id                uuid,
  user_id           uuid,
  subject           text,
  status            text,
  last_message_at   timestamptz,
  created_at        timestamptz,
  last_body         text,
  last_sender_role  text,
  unread_count      int,
  user_email        text,
  user_display_name text
)
language plpgsql security definer stable set search_path = public as $$
declare
  is_a boolean := public.is_admin(auth.uid());
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
    (select email from auth.users u where u.id = c.user_id)::text as user_email,
    (select full_name from public.profiles p where p.id = c.user_id)::text as user_display_name
  from public.support_conversations c
  where c.user_id = auth.uid() or is_a
  order by c.last_message_at desc nulls last, c.created_at desc;
end;
$$;
revoke all on function public.support_conversations_with_unread() from public;
grant execute on function public.support_conversations_with_unread() to authenticated;

-- ─── Enable Realtime on both tables ─────────────────────────────
alter publication supabase_realtime add table public.support_conversations;
alter publication supabase_realtime add table public.support_messages;
