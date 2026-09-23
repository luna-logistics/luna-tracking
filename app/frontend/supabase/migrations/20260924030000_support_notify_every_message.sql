-- Office notifications on EVERY conversation message, from either side.
--
-- Before: notify_support_on_client_message() queued an office e-mail only for
-- sender_role = 'client' (the first message AND client follow-ups — client
-- replies were in fact already covered); staff replies sent nothing, so the
-- other people on the recipient list never saw what a colleague answered.
-- Now staff ('admin') messages are queued too. Same pipeline, same ledger:
-- one office_notifications row per message (unique (kind, record_id)), so a
-- message triggers exactly one e-mail round, never a duplicate on retry, and
-- sending an e-mail never inserts a message (no loop).
--
-- get_support_message_for_notify() now also returns who wrote the message
-- (sender_role, author_email = the staff member's login e-mail), whether it
-- is the conversation's first message, and the client's e-mail as its own
-- field — support-notify uses them for the subject/heading, to show the
-- client's address in the body, and to leave the replying staff member off
-- the recipients when their login e-mail is on the list.

create or replace function public.notify_support_on_client_message()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if new.sender_role in ('client', 'admin') then
    perform public.enqueue_office_notification('support_message', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.get_support_message_for_notify(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare msg record; conv record; client_email text; author text; first_msg boolean;
begin
  select m.id, m.conversation_id, m.body, m.created_at, m.sender_role, m.sender_id
    into msg from public.support_messages m where m.id = p_id;
  if msg.id is null then return null; end if;
  select c.id, c.subject, c.user_id, c.guest_email, c.guest_name, c.status
    into conv from public.support_conversations c where c.id = msg.conversation_id;
  if conv.user_id is not null then
    select u.email::text into client_email from auth.users u where u.id = conv.user_id;
  end if;
  client_email := coalesce(client_email, conv.guest_email);
  if msg.sender_role = 'admin' and msg.sender_id is not null then
    select u.email::text into author from auth.users u where u.id = msg.sender_id;
  end if;
  select not exists (
    select 1 from public.support_messages e
     where e.conversation_id = msg.conversation_id
       and (e.created_at < msg.created_at or (e.created_at = msg.created_at and e.id < msg.id))
  ) into first_msg;

  return jsonb_build_object(
    'message_id',      msg.id,
    'conversation_id', conv.id,
    'subject',         conv.subject,
    'body',            msg.body,
    'created_at',      msg.created_at,
    'status',          conv.status,
    'is_guest',        conv.user_id is null,
    'sender_role',     msg.sender_role,
    'author_email',    author,
    'is_first',        first_msg,
    'client_email',    client_email,
    'sender_email',    client_email,
    'sender_name',     coalesce(
      (select p.full_name from public.profiles p where p.id = conv.user_id),
      conv.guest_name
    ),
    'notify_email',    coalesce((select s.value #>> '{}' from public.platform_settings s where s.key = 'support_notification_email'), ''),
    'from_address',    coalesce((select s.value #>> '{}' from public.platform_settings s where s.key = 'support_from_address'),
                                'Luna Support <support@lunatrackinglogistics.com>'),
    'notify_enabled',  coalesce((select (s.value)::boolean from public.platform_settings s where s.key = 'support_notification_enabled'), true)
  );
end;
$function$;
revoke execute on function public.get_support_message_for_notify(uuid) from public, anon, authenticated;
grant execute on function public.get_support_message_for_notify(uuid) to service_role;
