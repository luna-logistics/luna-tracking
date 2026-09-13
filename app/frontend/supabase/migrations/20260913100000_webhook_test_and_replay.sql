-- Webhook operability: a "send a test" and a "replay a failed delivery"
-- helper for the Notifications automatiques page. Both reuse the existing
-- pg_cron worker + retry + HMAC signing untouched — they only enqueue or
-- re-arm rows in webhook_deliveries. Owner/admin only (same gate as
-- create/rotate).

-- Enqueue a single 'ping' delivery to ONE endpoint. The worker sends it
-- within a minute with the same signature + retry as a real event. This
-- bypasses subscription matching on purpose (you are testing a specific
-- endpoint), and does not change the event catalogue.
create or replace function public.send_test_webhook(p_endpoint uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare ep record; new_id uuid; eid uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select id, business_id, url, is_active into ep
    from public.webhook_endpoints where id = p_endpoint;
  if ep.id is null then raise exception 'not_found'; end if;
  if public.business_role(ep.business_id, auth.uid()) not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if ep.is_active is not true then raise exception 'endpoint_paused'; end if;

  insert into public.webhook_deliveries (endpoint_id, business_id, event_type, event_id, payload)
  values (ep.id, ep.business_id, 'ping', eid,
    jsonb_build_object(
      'event',       'ping',
      'event_id',    eid,
      'occurred_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'data',        jsonb_build_object('test', true, 'message', 'Luna Tracking test notification')
    ))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.send_test_webhook(uuid) from public;
grant execute on function public.send_test_webhook(uuid) to authenticated;

-- Re-queue a delivery that failed (never delivered) so the worker tries
-- again: reset the attempt counter + retry clock. Payload, signature and
-- event identity are left intact. Refuses an already-delivered delivery.
create or replace function public.replay_webhook_delivery(p_delivery uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select id, business_id, delivered_at into d
    from public.webhook_deliveries where id = p_delivery;
  if d.id is null then raise exception 'not_found'; end if;
  if public.business_role(d.business_id, auth.uid()) not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if d.delivered_at is not null then raise exception 'already_delivered'; end if;

  update public.webhook_deliveries
    set attempts = 0, next_retry_at = now(), request_id = null, last_error = null
  where id = p_delivery;
end $$;
revoke all on function public.replay_webhook_delivery(uuid) from public;
grant execute on function public.replay_webhook_delivery(uuid) to authenticated;
