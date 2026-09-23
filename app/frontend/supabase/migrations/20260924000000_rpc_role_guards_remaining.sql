-- Close the last 7 NULL-unsafe role guards (same fix as 20260923150000
-- invoice RPCs and 20260923240000 accept_quote_to_shipment).
--
-- All 7 are SECURITY DEFINER (bypass RLS) and guarded with
--   business_role(biz, auth.uid()) NOT IN (...)
-- business_role() is NULL for a non-member, `NULL NOT IN (...)` is NULL and
-- the IF never raises → any non-member holding the target UUID passed. Two of
-- them had no auth.uid() check at all → reachable by ANONYMOUS callers, and all
-- 7 had EXECUTE granted to anon by Supabase's default grants.
--
-- Pattern (unchanged elsewhere): auth.uid() required, then
--   coalesce(public.business_role(...), '') not in (<allowed roles>)
-- and EXECUTE revoked from public/anon (granted to authenticated only).
-- Bodies are otherwise unchanged, except: pgcrypto lives in `extensions`, so
-- gen_random_bytes()/digest() are schema-qualified — with search_path=public
-- they were unresolvable and create_api_key / create_webhook_endpoint /
-- rotate_webhook_secret failed for EVERYONE (42883), members included.

create or replace function public.create_api_key(p_business uuid, p_name text, p_permissions jsonb default '[]'::jsonb)
 returns table(id uuid, full_key text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if coalesce(public.business_role(p_business, auth.uid()), '') not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name_required';
  end if;

  prefix := 'lk_live_' || encode(extensions.gen_random_bytes(6), 'hex');
  secret := encode(extensions.gen_random_bytes(24), 'hex');
  full_k := prefix || '.' || secret;
  hash   := encode(extensions.digest(secret, 'sha256'), 'hex');

  insert into public.api_keys (business_id, name, key_prefix, key_hash, permissions, created_by)
  values (p_business, trim(p_name), prefix, hash, coalesce(p_permissions, '[]'::jsonb), auth.uid())
  returning public.api_keys.id into new_id;

  return query select new_id as id, full_k as full_key;
end;
$function$;

create or replace function public.revoke_api_key(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if coalesce(public.business_role(biz, auth.uid()), '') not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end;
$function$;

create or replace function public.create_webhook_endpoint(p_business uuid, p_name text, p_url text, p_event_types jsonb default '["*"]'::jsonb)
 returns table(id uuid, secret text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_id uuid;
  new_secret text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(public.business_role(p_business, auth.uid()), '') not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'name_required'; end if;
  if p_url is null or p_url !~* '^https://' then raise exception 'url_must_be_https'; end if;

  new_secret := 'whsec_' || encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.webhook_endpoints
    (business_id, name, url, secret, event_types, created_by)
  values
    (p_business, trim(p_name), p_url, new_secret, coalesce(p_event_types, '["*"]'::jsonb), auth.uid())
  returning public.webhook_endpoints.id into new_id;

  return query select new_id, new_secret;
end;
$function$;

create or replace function public.rotate_webhook_secret(p_endpoint uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  biz uuid;
  new_secret text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select business_id into biz from public.webhook_endpoints where id = p_endpoint;
  if biz is null then raise exception 'not_found'; end if;
  if coalesce(public.business_role(biz, auth.uid()), '') not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  new_secret := 'whsec_' || encode(extensions.gen_random_bytes(32), 'hex');
  update public.webhook_endpoints set secret = new_secret where id = p_endpoint;
  return new_secret;
end;
$function$;

create or replace function public.rotate_shipment_tracking_token(p_shipment uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_token uuid := gen_random_uuid();
  biz uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select business_id into biz from public.shipments where id = p_shipment;
  if biz is null then
    raise exception 'shipment not found';
  end if;
  if coalesce(public.business_role(biz, auth.uid()), '') not in ('owner','admin','manager','operations') then
    raise exception 'insufficient role' using errcode = '42501';
  end if;
  update public.shipments set tracking_token = new_token where id = p_shipment;
  return new_token;
end;
$function$;

create or replace function public.send_test_webhook(p_endpoint uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ep record; new_id uuid; eid uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select id, business_id, url, is_active into ep
    from public.webhook_endpoints where id = p_endpoint;
  if ep.id is null then raise exception 'not_found'; end if;
  if coalesce(public.business_role(ep.business_id, auth.uid()), '') not in ('owner','admin') then
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
end
$function$;

create or replace function public.replay_webhook_delivery(p_delivery uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare d record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select id, business_id, delivered_at into d
    from public.webhook_deliveries where id = p_delivery;
  if d.id is null then raise exception 'not_found'; end if;
  if coalesce(public.business_role(d.business_id, auth.uid()), '') not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if d.delivered_at is not null then raise exception 'already_delivered'; end if;

  update public.webhook_deliveries
    set attempts = 0, next_retry_at = now(), request_id = null, last_error = null
  where id = p_delivery;
end
$function$;

revoke execute on function public.create_api_key(uuid, text, jsonb)                 from public, anon;
revoke execute on function public.revoke_api_key(uuid)                               from public, anon;
revoke execute on function public.create_webhook_endpoint(uuid, text, text, jsonb)   from public, anon;
revoke execute on function public.rotate_webhook_secret(uuid)                        from public, anon;
revoke execute on function public.rotate_shipment_tracking_token(uuid)               from public, anon;
revoke execute on function public.send_test_webhook(uuid)                            from public, anon;
revoke execute on function public.replay_webhook_delivery(uuid)                      from public, anon;
grant  execute on function public.create_api_key(uuid, text, jsonb)                 to authenticated;
grant  execute on function public.revoke_api_key(uuid)                               to authenticated;
grant  execute on function public.create_webhook_endpoint(uuid, text, text, jsonb)   to authenticated;
grant  execute on function public.rotate_webhook_secret(uuid)                        to authenticated;
grant  execute on function public.rotate_shipment_tracking_token(uuid)               to authenticated;
grant  execute on function public.send_test_webhook(uuid)                            to authenticated;
grant  execute on function public.replay_webhook_delivery(uuid)                      to authenticated;
