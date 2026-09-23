-- Office e-mail notifications — fix the silent support-notify failure and
-- extend it to every public submission.
--
-- Root cause (found 2026-09-23): notify_support_on_client_message() read two
-- Vault secrets, `support_notify_url` (present) and `service_role_key`
-- (NEVER created). On a missing secret it `return new`-ed without a trace,
-- so no support message / quote request ever reached the support-notify
-- Edge Function (0 net._http_response rows for it, 0 Resend sends).
--
-- New design (same trigger → pg_net → Edge Function architecture):
--   * office_notifications is a ledger: one row per (kind, record_id),
--     written by the trigger BEFORE the HTTP call. Every outcome (sent /
--     skipped / failed + detail) lands on that row — no more silent skips.
--   * The Edge Function no longer needs a shared secret: it only acts on a
--     ledger row it can atomically claim from `pending`, which only these
--     SECURITY DEFINER triggers can create. A forged POST can at most make
--     an already-queued e-mail go out once — never a new or repeated one.
--   * Recipient + sender stay admin-editable in platform_settings
--     (support_notification_email / support_from_address /
--     support_notification_enabled) — no address hard-coded here.
--   * Kinds: support_message (Contact, /tarifs + /calculateur quote
--     requests, chat bubble), forwarding_request (/reexpedition),
--     order (/achat-envoi checkout).

create table if not exists public.office_notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('support_message','forwarding_request','order')),
  record_id   uuid not null,
  status      text not null default 'pending'
              check (status in ('pending','sending','sent','skipped','failed')),
  detail      text,
  resend_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, record_id)
);

alter table public.office_notifications enable row level security;
-- Read-only for platform admins (diagnostics); writes are service-role /
-- SECURITY DEFINER only (no insert/update/delete policy).
drop policy if exists office_notifications_admin_read on public.office_notifications;
create policy office_notifications_admin_read on public.office_notifications
  for select using (coalesce(public.is_admin((select auth.uid())), false));
revoke all on public.office_notifications from anon;
grant select on public.office_notifications to authenticated;

-- Shared enqueue: ledger row + async POST. Never raises (a notification
-- problem must not roll back a customer's submission); problems are
-- recorded on the ledger row instead.
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
    from public.platform_settings where key = 'support_notification_enabled';
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

-- Support messages (existing trigger name kept; body replaced).
create or replace function public.notify_support_on_client_message()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if new.sender_role = 'client' then
    perform public.enqueue_office_notification('support_message', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_office_on_forwarding_request()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.enqueue_office_notification('forwarding_request', new.id);
  return new;
end;
$$;

create or replace function public.notify_office_on_order()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.enqueue_office_notification('order', new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_office_on_forwarding_request on public.forwarding_requests;
create trigger trg_notify_office_on_forwarding_request
  after insert on public.forwarding_requests
  for each row execute function public.notify_office_on_forwarding_request();

drop trigger if exists trg_notify_office_on_order on public.orders;
create trigger trg_notify_office_on_order
  after insert on public.orders
  for each row execute function public.notify_office_on_order();

-- Atomic claim used by the Edge Function (service role only).
create or replace function public.claim_office_notification(p_kind text, p_record uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  with c as (
    update public.office_notifications
       set status = 'sending', updated_at = now()
     where kind = p_kind and record_id = p_record and status = 'pending'
    returning 1
  )
  select exists (select 1 from c);
$$;
revoke all on function public.claim_office_notification(text, uuid) from public, anon, authenticated;

create or replace function public.finish_office_notification(
  p_kind text, p_record uuid, p_status text, p_detail text, p_resend_id text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.office_notifications
     set status = p_status, detail = p_detail, resend_id = p_resend_id, updated_at = now()
   where kind = p_kind and record_id = p_record;
$$;
revoke all on function public.finish_office_notification(text, uuid, text, text, text) from public, anon, authenticated;

-- Payload readers for the two new kinds (service role only).
create or replace function public.get_office_notify_payload(p_kind text, p_record uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare r jsonb; settings jsonb;
begin
  settings := jsonb_build_object(
    'notify_email',   coalesce((select value #>> '{}' from public.platform_settings where key = 'support_notification_email'), ''),
    'from_address',   coalesce((select value #>> '{}' from public.platform_settings where key = 'support_from_address'), ''),
    'notify_enabled', coalesce((select (value)::boolean from public.platform_settings where key = 'support_notification_enabled'), true));

  if p_kind = 'forwarding_request' then
    select to_jsonb(f) into r from public.forwarding_requests f where f.id = p_record;
  elsif p_kind = 'order' then
    select to_jsonb(o)
           || jsonb_build_object(
                'customer_email', (select email::text from auth.users u where u.id = o.user_id),
                'customer_name',  (select full_name from public.profiles p where p.id = o.user_id),
                'city_name',      (select c.name from public.destination_cities c where c.id = o.recipient_city_id))
      into r
      from public.orders o where o.id = p_record;
  else
    return null;
  end if;
  if r is null then return null; end if;
  return r || settings;
end;
$$;
revoke all on function public.get_office_notify_payload(text, uuid) from public, anon, authenticated;

-- Same-shape sweep: this SECURITY DEFINER reader returned a message body +
-- sender e-mail to ANY caller holding a message UUID (anon had EXECUTE by
-- default grant). Only the Edge Function (service role) needs it.
revoke execute on function public.get_support_message_for_notify(uuid) from public, anon, authenticated;

grant execute on function public.get_support_message_for_notify(uuid)                   to service_role;
grant execute on function public.get_office_notify_payload(text, uuid)                  to service_role;
grant execute on function public.claim_office_notification(text, uuid)                  to service_role;
grant execute on function public.finish_office_notification(text, uuid, text, text, text) to service_role;
grant all on public.office_notifications to service_role;
