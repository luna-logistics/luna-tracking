-- Support notifications: email the admin whenever a new client / guest
-- message lands. Trigger enqueues a pg_net POST to the support-notify
-- edge function; the function reads the message with the service role
-- and hands the payload to Resend. Kept intentionally decoupled from
-- the message insert so a Resend outage never blocks a user's send.

create extension if not exists pg_net;

-- ─── Settings ──────────────────────────────────────────────────
insert into public.platform_settings (key, value)
values
  ('support_notification_email',   '"luna.tracking.logistic@gmail.com"'::jsonb),
  ('support_notification_enabled', 'true'::jsonb),
  ('support_from_address',         '"Luna Support <support@lunatrackinglogistics.com>"'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_support_notification_config()
returns table (recipient_email text, from_address text, enabled boolean)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select value #>> '{}' from public.platform_settings where key = 'support_notification_email'), ''),
    coalesce((select value #>> '{}' from public.platform_settings where key = 'support_from_address'),
             'Luna Support <support@lunatrackinglogistics.com>'),
    coalesce((select (value)::boolean from public.platform_settings where key = 'support_notification_enabled'), true);
$$;
revoke all on function public.get_support_notification_config() from public;
grant execute on function public.get_support_notification_config() to authenticated;

create or replace function public.set_support_notification_config(
  p_recipient_email text,
  p_from_address    text,
  p_enabled         boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  -- Accept a single address OR a comma-separated list (Resend limit: 50).
  if p_recipient_email is not null and length(trim(p_recipient_email)) > 0 then
    if p_recipient_email !~* '^\s*[^@,\s]+@[^@,\s]+\.[^@,\s]+(\s*,\s*[^@,\s]+@[^@,\s]+\.[^@,\s]+)*\s*$' then
      raise exception 'invalid_recipient_email';
    end if;
  end if;

  -- From address accepts either bare email or "Display Name <email@x>".
  if p_from_address is not null and length(trim(p_from_address)) > 0 then
    if p_from_address !~* '(^[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+$)|(^.+<[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+>$)' then
      raise exception 'invalid_from_address';
    end if;
  end if;

  insert into public.platform_settings (key, value)
  values ('support_notification_email', to_jsonb(coalesce(trim(p_recipient_email), '')))
  on conflict (key) do update set value = to_jsonb(coalesce(trim(p_recipient_email), '')), updated_at = now();

  insert into public.platform_settings (key, value)
  values ('support_from_address', to_jsonb(coalesce(trim(p_from_address), 'Luna Support <support@lunatrackinglogistics.com>')))
  on conflict (key) do update set value = to_jsonb(coalesce(trim(p_from_address), 'Luna Support <support@lunatrackinglogistics.com>')), updated_at = now();

  insert into public.platform_settings (key, value)
  values ('support_notification_enabled', to_jsonb(coalesce(p_enabled, true)))
  on conflict (key) do update set value = to_jsonb(coalesce(p_enabled, true)), updated_at = now();
end;
$$;
revoke all on function public.set_support_notification_config(text, text, boolean) from public;
grant execute on function public.set_support_notification_config(text, text, boolean) to authenticated;

-- ─── Trigger: pg_net fires only for client/guest messages ─────
create or replace function public.notify_support_on_client_message()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  fn_url text;
  svc_key text;
  enabled boolean;
begin
  if new.sender_role <> 'client' then return new; end if;

  select coalesce((value)::boolean, true) into enabled
    from public.platform_settings where key = 'support_notification_enabled';
  if enabled is not true then return new; end if;

  -- Resolved from Vault so we never hard-code project refs / keys.
  select decrypted_secret into fn_url  from vault.decrypted_secrets where name = 'support_notify_url'  limit 1;
  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key'    limit 1;
  if fn_url is null or svc_key is null then return new; end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('message_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception
  when others then
    -- Never let a notification failure block the client's send.
    return new;
end;
$$;

drop trigger if exists trg_notify_support_on_message on public.support_messages;
create trigger trg_notify_support_on_message
  after insert on public.support_messages
  for each row execute function public.notify_support_on_client_message();

-- ─── Helper the edge function calls with the service role ──────
-- Returns everything needed to compose the email in one round-trip.
create or replace function public.get_support_message_for_notify(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare msg record; conv record; email_from_user text;
begin
  select id, conversation_id, body, created_at
    into msg from public.support_messages where id = p_id;
  if msg.id is null then return null; end if;

  select id, subject, user_id, guest_email, guest_name, status
    into conv from public.support_conversations where id = msg.conversation_id;

  if conv.user_id is not null then
    select email::text into email_from_user from auth.users where id = conv.user_id;
  end if;

  return jsonb_build_object(
    'message_id',      msg.id,
    'conversation_id', conv.id,
    'subject',         conv.subject,
    'body',            msg.body,
    'created_at',      msg.created_at,
    'status',          conv.status,
    'is_guest',        conv.user_id is null,
    'sender_email',    coalesce(email_from_user, conv.guest_email),
    'sender_name',     coalesce(
      (select full_name from public.profiles where id = conv.user_id),
      conv.guest_name
    ),
    'notify_email',    coalesce((select value #>> '{}' from public.platform_settings where key = 'support_notification_email'), ''),
    'from_address',    coalesce((select value #>> '{}' from public.platform_settings where key = 'support_from_address'),
                                'Luna Support <support@lunatrackinglogistics.com>'),
    'notify_enabled',  coalesce((select (value)::boolean from public.platform_settings where key = 'support_notification_enabled'), true)
  );
end;
$$;
revoke all on function public.get_support_message_for_notify(uuid) from public;
-- Only the service role (edge function) needs this — no anon/authenticated grant.
