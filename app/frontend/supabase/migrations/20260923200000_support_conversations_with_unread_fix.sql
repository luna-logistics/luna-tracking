-- /admin/support conversation list was always empty.
--
-- support_conversations_with_unread() RETURNS TABLE(..., created_at, ...);
-- in PL/pgSQL those output columns are variables, so the unqualified
-- `order by created_at` in the last-message subqueries raised 42702
-- "column reference created_at is ambiguous" on EVERY call. The client
-- (fetchConversations) swallowed the error and returned [], so the admin
-- saw no conversations, and "open conversation" from the send log could
-- not render one (the detail pane looks the row up in that list) — the
-- messages existed and were readable, they were just never shown.
-- Fix: qualify every column reference (m.created_at). Body unchanged
-- otherwise. Found 2026-09-23.

create or replace function public.support_conversations_with_unread()
 returns table(id uuid, user_id uuid, subject text, status text, last_message_at timestamp with time zone,
               created_at timestamp with time zone, last_body text, last_sender_role text, unread_count integer,
               user_email text, user_display_name text, is_guest boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare is_a boolean := public.is_admin(auth.uid());
begin
  return query
  select
    c.id, c.user_id, c.subject, c.status, c.last_message_at, c.created_at,
    (select m.body from public.support_messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body,
    (select m.sender_role from public.support_messages m
      where m.conversation_id = c.id order by m.created_at desc limit 1) as last_sender_role,
    (select count(*)::int from public.support_messages m
      where m.conversation_id = c.id and m.read_at is null
        and m.sender_role = case when is_a then 'client' else 'admin' end) as unread_count,
    coalesce(
      (select u.email from auth.users u where u.id = c.user_id)::text,
      c.guest_email
    ) as user_email,
    coalesce(
      (select p.full_name from public.profiles p where p.id = c.user_id)::text,
      c.guest_name
    ) as user_display_name,
    (c.user_id is null) as is_guest
  from public.support_conversations c
  where c.user_id = auth.uid() or is_a
  order by c.last_message_at desc nulls last, c.created_at desc;
end;
$function$;
