-- Client-facing "you have a reply" e-mails.
--
-- A staff reply ('admin' message) now queues TWO independent notifications
-- through the same ledger + support-notify pipeline:
--   * support_message → the office recipient list (unchanged, 8a5f0ac);
--   * client_reply    → the conversation's client: a guest gets a one-click
--     link carrying their guest_token; a logged-in client gets a link into
--     their account's conversation view (login required, no token bypass).
-- One client_reply row per staff message (unique (kind, record_id)), so a
-- reply notifies the client exactly once. Client messages never queue a
-- client_reply (no self-notification); sending never inserts a message (no
-- loop). The client e-mail can be switched off on its own with
-- platform_settings.client_reply_notification_enabled (default on); the
-- office switch (support_notification_enabled) no longer silences it.

alter table public.office_notifications drop constraint if exists office_notifications_kind_check;
alter table public.office_notifications add constraint office_notifications_kind_check
  check (kind in ('support_message', 'forwarding_request', 'order', 'client_reply'));

insert into public.platform_settings (key, value)
values ('client_reply_notification_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public.enqueue_office_notification(p_kind text, p_record uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  fn_url  text;
  anon    text;
  enabled boolean;
begin
  select coalesce((value)::boolean, true) into enabled
    from public.platform_settings
   where key = case when p_kind = 'client_reply' then 'client_reply_notification_enabled'
                    else 'support_notification_enabled' end;
  if enabled is false then return; end if;

  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'support_notify_url' limit 1;
  select decrypted_secret into anon   from vault.decrypted_secrets where name = 'anon_key'           limit 1;

  if fn_url is null then
    insert into public.office_notifications (kind, record_id, status, detail)
    values (p_kind, p_record, 'failed', 'vault secret support_notify_url missing')
    on conflict (kind, record_id) do nothing;
    return;
  end if;

  insert into public.office_notifications (kind, record_id)
  values (p_kind, p_record)
  on conflict (kind, record_id) do nothing;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('kind', p_kind, 'id', p_record),
    headers := jsonb_build_object('Content-Type', 'application/json')
               || case when anon is not null
                       then jsonb_build_object('Authorization', 'Bearer ' || anon, 'apikey', anon)
                       else '{}'::jsonb end,
    timeout_milliseconds := 10000
  );
exception when others then
  begin
    insert into public.office_notifications (kind, record_id, status, detail)
    values (p_kind, p_record, 'failed', 'enqueue error: ' || sqlerrm)
    on conflict (kind, record_id) do update set status = 'failed', detail = excluded.detail, updated_at = now();
  exception when others then null;
  end;
end;
$$;
revoke all on function public.enqueue_office_notification(text, uuid) from public, anon, authenticated;

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
  if new.sender_role = 'admin' then
    perform public.enqueue_office_notification('client_reply', new.id);
  end if;
  return new;
end;
$$;

-- + guest_token (guest link) and client_account_type (which account page).
create or replace function public.get_support_message_for_notify(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare msg record; conv record; client_email text; author text; first_msg boolean; acct text;
begin
  select m.id, m.conversation_id, m.body, m.created_at, m.sender_role, m.sender_id
    into msg from public.support_messages m where m.id = p_id;
  if msg.id is null then return null; end if;
  select c.id, c.subject, c.user_id, c.guest_email, c.guest_name, c.guest_token, c.status
    into conv from public.support_conversations c where c.id = msg.conversation_id;
  if conv.user_id is not null then
    select u.email::text into client_email from auth.users u where u.id = conv.user_id;
    select p.account_type::text into acct from public.profiles p where p.id = conv.user_id;
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
    'message_id', msg.id, 'conversation_id', conv.id, 'subject', conv.subject, 'body', msg.body,
    'created_at', msg.created_at, 'status', conv.status, 'is_guest', conv.user_id is null,
    'guest_token', conv.guest_token, 'client_account_type', acct,
    'sender_role', msg.sender_role, 'author_email', author, 'is_first', first_msg,
    'client_email', client_email, 'sender_email', client_email,
    'sender_name', coalesce((select p.full_name from public.profiles p where p.id = conv.user_id), conv.guest_name),
    'notify_email', coalesce((select s.value #>> '{}' from public.platform_settings s where s.key = 'support_notification_email'), ''),
    'from_address', coalesce((select s.value #>> '{}' from public.platform_settings s where s.key = 'support_from_address'), 'Luna Support <support@lunatrackinglogistics.com>'),
    'notify_enabled', coalesce((select (s.value)::boolean from public.platform_settings s where s.key = 'support_notification_enabled'), true));
end;
$function$;
revoke execute on function public.get_support_message_for_notify(uuid) from public, anon, authenticated;
grant execute on function public.get_support_message_for_notify(uuid) to service_role;

-- Send log: client_reply rows read like support messages (same join).
drop function if exists public.admin_list_office_notifications(text, int);
create function public.admin_list_office_notifications(
  p_status text default null, p_limit int default 100)
returns table (
  id uuid, kind text, record_id uuid, status text, detail text, resend_id text,
  created_at timestamptz, updated_at timestamptz,
  label text, contact text, conversation_id uuid, body text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select n.id, n.kind, n.record_id, n.status, n.detail, n.resend_id, n.created_at, n.updated_at,
         case when n.kind in ('support_message', 'client_reply') then c.subject
              when n.kind = 'forwarding_request' then f.origin_country
              when n.kind = 'order' then o.recipient_name end,
         case when n.kind in ('support_message', 'client_reply') then coalesce(c.guest_name, p.full_name, c.guest_email)
              when n.kind = 'forwarding_request' then coalesce(f.name, f.email)
              when n.kind = 'order' then coalesce(op.full_name, o.recipient_phone) end,
         m.conversation_id,
         case when n.kind in ('support_message', 'client_reply') then m.body
              when n.kind = 'forwarding_request' then f.description
              when n.kind = 'order' then concat_ws(E'\n',
                (select string_agg(coalesce(it->>'quantity', '1') || ' × ' || coalesce(it->>'name', it->>'slug', '?'), E'\n')
                   from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it),
                'Total : ' || o.total::text,
                case when o.notes is not null then 'Notes : ' || o.notes end) end
    from public.office_notifications n
    left join public.support_messages m      on n.kind in ('support_message', 'client_reply') and m.id = n.record_id
    left join public.support_conversations c on c.id = m.conversation_id
    left join public.profiles p              on p.id = c.user_id
    left join public.forwarding_requests f   on n.kind = 'forwarding_request' and f.id = n.record_id
    left join public.orders o                on n.kind = 'order' and o.id = n.record_id
    left join public.profiles op             on op.id = o.user_id
   where p_status is null or n.status = p_status
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.admin_list_office_notifications(text, int) from public, anon;
grant execute on function public.admin_list_office_notifications(text, int) to authenticated;
