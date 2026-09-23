-- Anti-abuse: per-IP rate limits, Cloudflare Turnstile verification, honeypot.
--
-- Where abuse can come in (all public, all reach Supabase DIRECTLY from the
-- browser — supabase.co is not behind the lunatrackinglogistics.com
-- Cloudflare zone, so Cloudflare WAF / rate-limiting rules cannot protect
-- these calls; the limits must live here and in the api-v1 Edge Function):
--   * guest_create_support_conversation  — Contact, /tarifs + /calculateur
--     quote requests (guests), chat bubble first message
--   * guest_submit_forwarding_request    — /reexpedition
--   * guest_send_support_message         — guest follow-up messages
--   * support_messages inserts           — logged-in quote/chat messages (RLS)
--   * api-v1 /tracking, /legacy-tracking — tracking search (Edge Function)
--
-- 1. Rate limits: fixed-window counters per (bucket, client IP). The IP is
--    Cloudflare's `cf-connecting-ip` as forwarded by PostgREST (set by
--    Cloudflare at Supabase's edge, not spoofable by the client); falls back
--    to the first x-forwarded-for hop. No IP (server-side/internal call) → no
--    limit. Limits are platform_settings.rate_limits (jsonb, editable without
--    a deploy); defaults below. Over the limit → SQLSTATE PT429, which
--    PostgREST returns as HTTP 429.
-- 2. Turnstile: verify_turnstile() calls Cloudflare siteverify through the
--    `http` extension (synchronous). DORMANT until the Vault secret
--    `turnstile_secret` exists: with no secret every call passes, so the forms
--    keep working until the owner creates the keys. Explicit failure →
--    PT403 'captcha_failed'. Cloudflare unreachable → allowed (fail-open,
--    rate limits still apply) — documented trade-off.
-- 3. Honeypot: the guest RPCs take p_hp (a hidden form field humans never
--    see). Filled → the call "succeeds" with throwaway ids and writes nothing.
-- 4. The direct anon INSERT policy on forwarding_requests is dropped: the
--    form uses guest_submit_forwarding_request (validated, rate-limited,
--    captcha-checked); a raw insert would bypass all of it.

create extension if not exists http with schema extensions;

drop function if exists public.tmp_probe_headers();

-- ─── Rate limiting ────────────────────────────────────────────────
create table if not exists public.rate_limit_counters (
  bucket       text        not null,
  subject      text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket, subject, window_start)
);
alter table public.rate_limit_counters enable row level security;  -- no policy: definer-only
revoke all on public.rate_limit_counters from anon, authenticated;

insert into public.platform_settings (key, value)
values ('rate_limits', '{
  "form_submit":     {"max": 5,   "window_seconds": 600},
  "support_message": {"max": 30,  "window_seconds": 600},
  "tracking":        {"max": 30,  "window_seconds": 300},
  "api":             {"max": 120, "window_seconds": 60}
}'::jsonb)
on conflict (key) do nothing;

create or replace function public.request_ip()
returns text
language sql
stable
set search_path to 'public'
as $$
  select nullif(trim(coalesce(
    current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip',
    split_part(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ',', 1)
  )), '');
$$;
revoke all on function public.request_ip() from public, anon, authenticated;

-- Consume one hit for (bucket, subject). Returns allowed + retry_after_seconds.
create or replace function public.rate_limit_consume(p_bucket text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cfg jsonb;
  max_hits int;
  win int;
  ws timestamptz;
  n int;
begin
  if p_subject is null or p_subject = '' then
    return jsonb_build_object('allowed', true);
  end if;
  select value -> p_bucket into cfg from public.platform_settings where key = 'rate_limits';
  max_hits := coalesce((cfg ->> 'max')::int, 60);
  win      := greatest(coalesce((cfg ->> 'window_seconds')::int, 60), 1);
  ws := to_timestamp(floor(extract(epoch from now()) / win) * win);
  insert into public.rate_limit_counters as c (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, ws, 1)
  on conflict (bucket, subject, window_start) do update set hits = c.hits + 1
  returning c.hits into n;
  return jsonb_build_object(
    'allowed', n <= max_hits,
    'limit', max_hits,
    'retry_after_seconds', greatest(ceil(extract(epoch from (ws + make_interval(secs => win) - now())))::int, 1));
end;
$$;
revoke all on function public.rate_limit_consume(text, text) from public, anon, authenticated;
grant execute on function public.rate_limit_consume(text, text) to service_role;

-- For PostgREST calls: limit by the caller's IP, raise HTTP 429 when over.
create or replace function public.enforce_request_rate_limit(p_bucket text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r jsonb;
begin
  r := public.rate_limit_consume(p_bucket, public.request_ip());
  if (r ->> 'allowed')::boolean is false then
    raise exception 'rate_limited'
      using errcode = 'PT429',
            detail = 'retry_after_seconds=' || (r ->> 'retry_after_seconds');
  end if;
end;
$$;
revoke all on function public.enforce_request_rate_limit(text) from public, anon, authenticated;

-- ─── Turnstile ────────────────────────────────────────────────────
create or replace function public.verify_turnstile(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  secret text;
  resp extensions.http_response;
  ok boolean;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'turnstile_secret' limit 1;
  if secret is null or secret = '' then
    return;  -- not configured yet: dormant
  end if;
  if p_token is null or length(p_token) < 10 or length(p_token) > 4096 then
    raise exception 'captcha_failed' using errcode = 'PT403';
  end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
    resp := extensions.http_post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      'secret=' || extensions.urlencode(secret)
        || '&response=' || extensions.urlencode(p_token)
        || coalesce('&remoteip=' || extensions.urlencode(public.request_ip()), ''),
      'application/x-www-form-urlencoded');
  exception when others then
    raise warning 'turnstile verification unreachable: %', sqlerrm;
    return;  -- fail-open on network errors; rate limits still apply
  end;
  ok := coalesce((resp.content::jsonb ->> 'success')::boolean, false);
  if not ok then
    raise exception 'captcha_failed' using errcode = 'PT403';
  end if;
end;
$$;
revoke all on function public.verify_turnstile(text) from public, anon, authenticated;

-- ─── Guest RPCs: honeypot → rate limit → captcha → (unchanged) body ─────
drop function if exists public.guest_create_support_conversation(text, text, text, text);
create function public.guest_create_support_conversation(
  p_email text, p_name text, p_subject text, p_body text,
  p_captcha text default null, p_hp text default null)
returns table (conversation_id uuid, guest_token uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare mode text; new_conv uuid; new_token uuid := gen_random_uuid();
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then
    return query select gen_random_uuid(), gen_random_uuid();  -- honeypot: silent no-op
    return;
  end if;
  perform public.enforce_request_rate_limit('form_submit');
  perform public.verify_turnstile(p_captcha);

  select coalesce(value #>> '{}', 'everyone') into mode
    from public.platform_settings where key = 'support_access_mode';
  if mode <> 'everyone' then raise exception 'guest_access_disabled' using errcode = '42501'; end if;
  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then raise exception 'invalid_email'; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(trim(p_body)) > 5000 then raise exception 'invalid_body'; end if;

  insert into public.support_conversations (user_id, guest_email, guest_name, guest_token, subject)
  values (null, lower(trim(p_email)), nullif(trim(p_name), ''), new_token,
          nullif(trim(coalesce(p_subject, '')), ''))
  returning id into new_conv;

  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (new_conv, null, 'client', trim(p_body));

  return query select new_conv, new_token;
end;
$function$;
revoke all on function public.guest_create_support_conversation(text, text, text, text, text, text) from public;
grant execute on function public.guest_create_support_conversation(text, text, text, text, text, text) to anon, authenticated;

drop function if exists public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text);
create function public.guest_submit_forwarding_request(
  p_name text, p_email text, p_phone text, p_origin_country text,
  p_description text, p_estimated_value numeric, p_subject text,
  p_captcha text default null, p_hp text default null)
returns table (reference text, conversation_id uuid, guest_token uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_ref   text := 'REX-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));
  v_uid   uuid := auth.uid();
  v_mode  text;
  v_conv  uuid;
  v_token uuid;
  v_body  text;
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then
    return query select v_ref, gen_random_uuid(), gen_random_uuid();  -- honeypot: silent no-op
    return;
  end if;
  perform public.enforce_request_rate_limit('form_submit');
  perform public.verify_turnstile(p_captcha);

  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then raise exception 'invalid_email'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 200 then raise exception 'invalid_name'; end if;
  if p_description is null or length(trim(p_description)) = 0 or length(trim(p_description)) > 4500 then
    raise exception 'invalid_description';
  end if;
  if p_estimated_value is not null and p_estimated_value < 0 then raise exception 'invalid_value'; end if;

  select coalesce(value #>> '{}', 'everyone') into v_mode
    from public.platform_settings where key = 'support_access_mode';

  v_body := concat_ws(E'\n',
    'Référence : ' || v_ref,
    'Nom : ' || trim(p_name),
    'E-mail : ' || lower(trim(p_email)),
    case when nullif(trim(coalesce(p_phone, '')), '') is not null then 'Téléphone : ' || trim(p_phone) end,
    'Origine : ' || coalesce(nullif(trim(p_origin_country), ''), '—'),
    case when p_estimated_value is not null then 'Valeur estimée : ' || p_estimated_value::text end,
    '',
    trim(p_description));

  if v_uid is not null or coalesce(v_mode, 'everyone') = 'everyone' then
    if v_uid is null then v_token := gen_random_uuid(); end if;
    insert into public.support_conversations (user_id, guest_email, guest_name, guest_token, subject)
    values (v_uid,
            case when v_uid is null then lower(trim(p_email)) end,
            case when v_uid is null then nullif(trim(p_name), '') end,
            v_token,
            left(coalesce(nullif(trim(coalesce(p_subject, '')), ''), 'Demande de réexpédition') || ' — ' || v_ref, 300))
    returning id into v_conv;

    insert into public.support_messages (conversation_id, sender_id, sender_role, body)
    values (v_conv, v_uid, 'client', v_body);
  end if;

  insert into public.forwarding_requests
    (id, reference, name, email, phone, origin_country, description, estimated_value, conversation_id)
  values
    (v_id, v_ref, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''),
     coalesce(nullif(trim(p_origin_country), ''), '—'), trim(p_description), p_estimated_value, v_conv);

  return query select v_ref, v_conv, v_token;
end;
$$;
revoke all on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text) from public;
grant execute on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text) to anon, authenticated;

-- Every CLIENT message (guest RPCs + logged-in RLS inserts) counts against
-- the per-IP message budget. Named to run after support_messages_stamp,
-- which sets sender_role. Staff replies are never limited.
create or replace function public.support_messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.sender_role = 'client' then
    perform public.enforce_request_rate_limit('support_message');
  end if;
  return new;
end;
$$;
drop trigger if exists support_messages_zz_rate_limit on public.support_messages;
create trigger support_messages_zz_rate_limit
  before insert on public.support_messages
  for each row execute function public.support_messages_rate_limit();

-- Close the unprotected direct insert path.
drop policy if exists "forwarding anon insert" on public.forwarding_requests;

-- Housekeeping: counters older than a day are useless.
select cron.schedule('luna-rate-limit-purge', '17 * * * *',
  $cron$delete from public.rate_limit_counters where window_start < now() - interval '1 day'$cron$);
