-- Guest form RPCs: RETURN rejections instead of raising them.
--
-- Found right after 20260924020000 (verified over PostgREST): a raised error
-- rolls back the whole call — including the rate-limit counter increment.
-- So rejected calls (bad e-mail, failed captcha, over the limit…) never
-- counted: a bot sending junk could call forever, and once Turnstile is on,
-- every junk call would also trigger a request to Cloudflare. Postgres has
-- no autonomous transactions, so the fix is to not abort: the guest RPCs now
-- return an `error` column (null on success) and COMMIT, so every attempt is
-- counted. The client (lib/support-chat, lib/forwarding) turns `error` back
-- into a thrown Error, so the forms' error handling is unchanged.
-- Error codes: rate_limited | captcha_failed | guest_access_disabled |
--              invalid_email | invalid_name | invalid_body |
--              invalid_description | invalid_value

-- Boolean variant of verify_turnstile (no raise). Dormant (true) until the
-- Vault secret `turnstile_secret` exists; Cloudflare unreachable → true
-- (fail-open, rate limits still apply).
create or replace function public.turnstile_passes(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  secret text;
  resp extensions.http_response;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'turnstile_secret' limit 1;
  if secret is null or secret = '' then
    return true;
  end if;
  if p_token is null or length(p_token) < 10 or length(p_token) > 4096 then
    return false;
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
    return true;
  end;
  return coalesce((resp.content::jsonb ->> 'success')::boolean, false);
end;
$$;
revoke all on function public.turnstile_passes(text) from public, anon, authenticated;
drop function if exists public.verify_turnstile(text);

drop function if exists public.guest_create_support_conversation(text, text, text, text, text, text);
create function public.guest_create_support_conversation(
  p_email text, p_name text, p_subject text, p_body text,
  p_captcha text default null, p_hp text default null)
returns table (conversation_id uuid, guest_token uuid, error text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare mode text; new_conv uuid; new_token uuid := gen_random_uuid(); rl jsonb;
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then
    return query select gen_random_uuid(), gen_random_uuid(), null::text;  -- honeypot: silent no-op
    return;
  end if;
  rl := public.rate_limit_consume('form_submit', public.request_ip());
  if (rl ->> 'allowed')::boolean is false then
    return query select null::uuid, null::uuid, 'rate_limited'::text; return;
  end if;
  if not public.turnstile_passes(p_captcha) then
    return query select null::uuid, null::uuid, 'captcha_failed'::text; return;
  end if;

  select coalesce(value #>> '{}', 'everyone') into mode
    from public.platform_settings where key = 'support_access_mode';
  if mode <> 'everyone' then
    return query select null::uuid, null::uuid, 'guest_access_disabled'::text; return;
  end if;
  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then
    return query select null::uuid, null::uuid, 'invalid_email'::text; return;
  end if;
  if p_body is null or length(trim(p_body)) = 0 or length(trim(p_body)) > 5000 then
    return query select null::uuid, null::uuid, 'invalid_body'::text; return;
  end if;

  insert into public.support_conversations (user_id, guest_email, guest_name, guest_token, subject)
  values (null, lower(trim(p_email)), nullif(trim(p_name), ''), new_token,
          nullif(trim(coalesce(p_subject, '')), ''))
  returning id into new_conv;

  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (new_conv, null, 'client', trim(p_body));

  return query select new_conv, new_token, null::text;
end;
$function$;
revoke all on function public.guest_create_support_conversation(text, text, text, text, text, text) from public;
grant execute on function public.guest_create_support_conversation(text, text, text, text, text, text) to anon, authenticated;

drop function if exists public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text);
create function public.guest_submit_forwarding_request(
  p_name text, p_email text, p_phone text, p_origin_country text,
  p_description text, p_estimated_value numeric, p_subject text,
  p_captcha text default null, p_hp text default null)
returns table (reference text, conversation_id uuid, guest_token uuid, error text)
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
  rl      jsonb;
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then
    return query select v_ref, gen_random_uuid(), gen_random_uuid(), null::text;  -- honeypot: silent no-op
    return;
  end if;
  rl := public.rate_limit_consume('form_submit', public.request_ip());
  if (rl ->> 'allowed')::boolean is false then
    return query select null::text, null::uuid, null::uuid, 'rate_limited'::text; return;
  end if;
  if not public.turnstile_passes(p_captcha) then
    return query select null::text, null::uuid, null::uuid, 'captcha_failed'::text; return;
  end if;

  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then
    return query select null::text, null::uuid, null::uuid, 'invalid_email'::text; return;
  end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 200 then
    return query select null::text, null::uuid, null::uuid, 'invalid_name'::text; return;
  end if;
  if p_description is null or length(trim(p_description)) = 0 or length(trim(p_description)) > 4500 then
    return query select null::text, null::uuid, null::uuid, 'invalid_description'::text; return;
  end if;
  if p_estimated_value is not null and p_estimated_value < 0 then
    return query select null::text, null::uuid, null::uuid, 'invalid_value'::text; return;
  end if;

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

  return query select v_ref, v_conv, v_token, null::text;
end;
$$;
revoke all on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text) from public;
grant execute on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text) to anon, authenticated;
