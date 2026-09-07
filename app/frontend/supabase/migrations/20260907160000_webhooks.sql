-- Requires pg_net + pg_cron extensions (enabled in this environment).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ─── Webhook endpoints ────────────────────────────────────────────
create table if not exists public.webhook_endpoints (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses(id) on delete cascade,
  name                  text not null,
  url                   text not null check (url ~* '^https?://'),
  secret                text not null,
  event_types           jsonb not null default '["*"]'::jsonb,
  is_active             boolean not null default true,
  last_success_at       timestamptz,
  last_error_at         timestamptz,
  last_error_message    text,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists webhook_endpoints_business_idx
  on public.webhook_endpoints (business_id, is_active);

alter table public.webhook_endpoints enable row level security;

drop policy if exists webhook_endpoints_select on public.webhook_endpoints;
create policy webhook_endpoints_select on public.webhook_endpoints
  for select using (public.is_business_member(business_id, auth.uid()));
drop policy if exists webhook_endpoints_insert on public.webhook_endpoints;
create policy webhook_endpoints_insert on public.webhook_endpoints
  for insert with check (public.business_role(business_id, auth.uid()) in ('owner','admin'));
drop policy if exists webhook_endpoints_update on public.webhook_endpoints;
create policy webhook_endpoints_update on public.webhook_endpoints
  for update using (public.business_role(business_id, auth.uid()) in ('owner','admin'))
  with check   (public.business_role(business_id, auth.uid()) in ('owner','admin'));
drop policy if exists webhook_endpoints_delete on public.webhook_endpoints;
create policy webhook_endpoints_delete on public.webhook_endpoints
  for delete using (public.business_role(business_id, auth.uid()) in ('owner','admin'));

create or replace function public.webhook_endpoints_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists webhook_endpoints_touch on public.webhook_endpoints;
create trigger webhook_endpoints_touch before update on public.webhook_endpoints
  for each row execute function public.webhook_endpoints_touch();

-- ─── Delivery queue ───────────────────────────────────────────────
create table if not exists public.webhook_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  endpoint_id          uuid not null references public.webhook_endpoints(id) on delete cascade,
  business_id          uuid not null references public.businesses(id) on delete cascade,
  event_type           text not null,
  event_id             uuid,
  payload              jsonb not null,
  request_id           bigint,
  attempts             int not null default 0,
  next_retry_at        timestamptz,
  last_attempt_at      timestamptz,
  last_status_code     int,
  last_response_body   text,
  last_error           text,
  delivered_at         timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists webhook_deliveries_pending_idx
  on public.webhook_deliveries (delivered_at, next_retry_at)
  where delivered_at is null and attempts < 6;
create index if not exists webhook_deliveries_business_idx
  on public.webhook_deliveries (business_id, created_at desc);
create index if not exists webhook_deliveries_request_idx
  on public.webhook_deliveries (request_id) where request_id is not null;

alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select using (public.is_business_member(business_id, auth.uid()));
-- No INSERT/UPDATE/DELETE policies: everything goes through SECURITY DEFINER
-- functions (emit_webhook_event, webhooks_worker).

-- ─── Enqueue helper ──────────────────────────────────────────────
create or replace function public.emit_webhook_event(
  p_business_id uuid,
  p_event_type  text,
  p_event_id    uuid,
  p_data        jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_deliveries
    (endpoint_id, business_id, event_type, event_id, payload)
  select
    e.id, p_business_id, p_event_type, p_event_id,
    jsonb_build_object(
      'event',       p_event_type,
      'event_id',    p_event_id,
      'occurred_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'data',        p_data
    )
  from public.webhook_endpoints e
  where e.business_id = p_business_id
    and e.is_active
    and (
      e.event_types @> '["*"]'::jsonb
      or e.event_types @> to_jsonb(p_event_type::text)
    );
end;
$$;

-- ─── Create / rotate ─────────────────────────────────────────────
create or replace function public.create_webhook_endpoint(
  p_business    uuid,
  p_name        text,
  p_url         text,
  p_event_types jsonb default '["*"]'::jsonb
) returns table (id uuid, secret text)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  new_secret text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if public.business_role(p_business, auth.uid()) not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'name_required'; end if;
  if p_url is null or p_url !~* '^https://' then raise exception 'url_must_be_https'; end if;

  new_secret := 'whsec_' || encode(gen_random_bytes(32), 'hex');
  insert into public.webhook_endpoints (business_id, name, url, secret, event_types, created_by)
  values (p_business, trim(p_name), p_url, new_secret, coalesce(p_event_types, '["*"]'::jsonb), auth.uid())
  returning public.webhook_endpoints.id into new_id;
  return query select new_id, new_secret;
end;
$$;
revoke all on function public.create_webhook_endpoint(uuid, text, text, jsonb) from public;
grant execute on function public.create_webhook_endpoint(uuid, text, text, jsonb) to authenticated;

create or replace function public.rotate_webhook_secret(p_endpoint uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  new_secret text := 'whsec_' || encode(gen_random_bytes(32), 'hex');
begin
  select business_id into biz from public.webhook_endpoints where id = p_endpoint;
  if biz is null then raise exception 'not_found'; end if;
  if public.business_role(biz, auth.uid()) not in ('owner','admin') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  update public.webhook_endpoints set secret = new_secret where id = p_endpoint;
  return new_secret;
end;
$$;
revoke all on function public.rotate_webhook_secret(uuid) from public;
grant execute on function public.rotate_webhook_secret(uuid) to authenticated;

-- ─── Worker: fire pending + finalize in-flight ───────────────────
create or replace function public.webhooks_worker()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  rec record;
  ts text; sig text; body text; req_id bigint;
begin
  for rec in
    select d.id, d.endpoint_id, d.event_type, d.payload, d.attempts,
           e.url, e.secret
    from public.webhook_deliveries d
    join public.webhook_endpoints e on e.id = d.endpoint_id
    where d.delivered_at is null
      and d.request_id is null
      and (d.next_retry_at is null or d.next_retry_at <= now())
      and d.attempts < 6
      and e.is_active
    order by d.created_at
    limit 25
    for update of d skip locked
  loop
    ts   := extract(epoch from now())::bigint::text;
    body := rec.payload::text;
    sig  := encode(hmac(ts || '.' || body, rec.secret, 'sha256'), 'hex');

    select net.http_post(
      url := rec.url,
      body := rec.payload,
      headers := jsonb_build_object(
        'Content-Type',        'application/json',
        'X-Webhook-Timestamp', ts,
        'X-Webhook-Signature', 't=' || ts || ',v1=' || sig,
        'X-Webhook-Event',     rec.event_type,
        'X-Webhook-Attempt',   (rec.attempts + 1)::text,
        'User-Agent',          'Luna-Tracking-Webhooks/1.0'
      ),
      timeout_milliseconds := 10000
    ) into req_id;

    update public.webhook_deliveries
    set request_id = req_id, attempts = attempts + 1, last_attempt_at = now()
    where id = rec.id;
  end loop;

  update public.webhook_deliveries d
  set delivered_at       = case when r.status_code between 200 and 299 then now() else null end,
      next_retry_at      = case
        when r.status_code between 200 and 299 then null
        when d.attempts >= 6 then null
        else now() + (interval '1 minute') * power(2, d.attempts)
      end,
      last_status_code   = r.status_code,
      last_response_body = left(coalesce(r.content, r.error_msg, ''), 500),
      last_error         = case when r.status_code between 200 and 299 then null
                                else coalesce(r.error_msg, 'HTTP ' || r.status_code::text) end,
      request_id         = null
  from net._http_response r
  where d.request_id = r.id
    and d.delivered_at is null;

  update public.webhook_endpoints e
  set last_success_at = greatest(coalesce(last_success_at, 'epoch'::timestamptz), sub.max_delivered)
  from (
    select endpoint_id, max(delivered_at) as max_delivered
    from public.webhook_deliveries
    where delivered_at is not null
    group by endpoint_id
  ) sub
  where e.id = sub.endpoint_id
    and (e.last_success_at is null or sub.max_delivered > e.last_success_at);
end;
$$;

-- ─── Cron: run every minute ──────────────────────────────────────
select cron.schedule(
  'luna-webhooks-worker',
  '* * * * *',
  $$select public.webhooks_worker();$$
);

-- ─── Event triggers ──────────────────────────────────────────────
create or replace function public.shipments_emit_webhooks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_webhook_event(new.business_id, 'shipment.created', new.id,
      jsonb_build_object(
        'id', new.id, 'reference', new.reference, 'status', new.status,
        'direction', new.direction, 'mode', new.mode, 'currency', new.currency,
        'origin_country', new.origin_country, 'destination_country', new.destination_country,
        'customer_id', new.customer_id));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.emit_webhook_event(new.business_id, 'shipment.status_changed', new.id,
      jsonb_build_object('id', new.id, 'reference', new.reference,
                         'from_status', old.status, 'to_status', new.status));
    if new.status = 'delivered' then
      perform public.emit_webhook_event(new.business_id, 'shipment.delivered', new.id,
        jsonb_build_object('id', new.id, 'reference', new.reference,
                           'actual_delivery', new.actual_delivery));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists shipments_emit_webhooks on public.shipments;
create trigger shipments_emit_webhooks
  after insert or update of status on public.shipments
  for each row execute function public.shipments_emit_webhooks();

create or replace function public.quotes_emit_webhooks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_webhook_event(new.business_id, 'quote.created', new.id,
      jsonb_build_object('id', new.id, 'reference', new.reference, 'status', new.status,
                         'customer_id', new.customer_id, 'customer_price', new.customer_price,
                         'currency', new.currency));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform public.emit_webhook_event(new.business_id, 'quote.accepted', new.id,
        jsonb_build_object('id', new.id, 'reference', new.reference, 'accepted_at', new.accepted_at));
    elsif new.status = 'converted' then
      perform public.emit_webhook_event(new.business_id, 'quote.converted', new.id,
        jsonb_build_object('id', new.id, 'reference', new.reference, 'shipment_id', new.shipment_id));
    elsif new.status = 'declined' then
      perform public.emit_webhook_event(new.business_id, 'quote.declined', new.id,
        jsonb_build_object('id', new.id, 'reference', new.reference));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_emit_webhooks on public.quotes;
create trigger quotes_emit_webhooks
  after insert or update of status on public.quotes
  for each row execute function public.quotes_emit_webhooks();
