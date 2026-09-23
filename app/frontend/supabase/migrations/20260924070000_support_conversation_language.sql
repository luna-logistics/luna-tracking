-- The language a conversation was started in, so the client's
-- "you have a reply" e-mail can be written in that language.
--
-- support_conversations.language = the site locale the visitor was using when
-- the conversation was created ('fr' at the root, 'en' under /en). NULL for
-- conversations created before this column existed: their reply e-mail keeps
-- the bilingual fallback (French + short English note).
--
-- Every creation path passes it: the logged-in insert (lib/support-chat
-- createConversation — bubble, /compte|/entreprise support, /tarifs,
-- /calculateur, Contact) sets the column directly; the two guest RPCs gain an
-- optional p_language (DEFAULT NULL, so a cached older front end keeps
-- working while the new one deploys). Anything but 'fr'/'en' is stored NULL.

alter table public.support_conversations
  add column if not exists language text check (language in ('fr', 'en'));

drop function if exists public.guest_create_support_conversation(text, text, text, text, text, text);
create function public.guest_create_support_conversation(
  p_email text, p_name text, p_subject text, p_body text,
  p_captcha text default null, p_hp text default null, p_language text default null)
returns table(conversation_id uuid, guest_token uuid, error text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare mode text; new_conv uuid; new_token uuid := gen_random_uuid(); rl jsonb;
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then return query select gen_random_uuid(), gen_random_uuid(), null::text; return; end if;
  rl := public.rate_limit_consume('form_submit', public.request_ip());
  if (rl ->> 'allowed')::boolean is false then return query select null::uuid, null::uuid, 'rate_limited'::text; return; end if;
  if not public.turnstile_passes(p_captcha) then return query select null::uuid, null::uuid, 'captcha_failed'::text; return; end if;
  select coalesce(value #>> '{}', 'everyone') into mode from public.platform_settings where key = 'support_access_mode';
  if mode <> 'everyone' then return query select null::uuid, null::uuid, 'guest_access_disabled'::text; return; end if;
  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then return query select null::uuid, null::uuid, 'invalid_email'::text; return; end if;
  if p_body is null or length(trim(p_body)) = 0 or length(trim(p_body)) > 5000 then return query select null::uuid, null::uuid, 'invalid_body'::text; return; end if;
  insert into public.support_conversations (user_id, guest_email, guest_name, guest_token, subject, language)
  values (null, lower(trim(p_email)), nullif(trim(p_name), ''), new_token, nullif(trim(coalesce(p_subject, '')), ''),
          case when p_language in ('fr', 'en') then p_language end)
  returning id into new_conv;
  insert into public.support_messages (conversation_id, sender_id, sender_role, body) values (new_conv, null, 'client', trim(p_body));
  return query select new_conv, new_token, null::text;
end; $function$;
revoke all on function public.guest_create_support_conversation(text, text, text, text, text, text, text) from public;
grant execute on function public.guest_create_support_conversation(text, text, text, text, text, text, text) to anon, authenticated;

drop function if exists public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text);
create function public.guest_submit_forwarding_request(
  p_name text, p_email text, p_phone text, p_origin_country text, p_description text,
  p_estimated_value numeric, p_subject text, p_captcha text default null, p_hp text default null,
  p_language text default null)
returns table(reference text, conversation_id uuid, guest_token uuid, error text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid := gen_random_uuid(); v_ref text := 'REX-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));
  v_uid uuid := auth.uid(); v_mode text; v_conv uuid; v_token uuid; v_body text; rl jsonb;
begin
  if nullif(trim(coalesce(p_hp, '')), '') is not null then return query select v_ref, gen_random_uuid(), gen_random_uuid(), null::text; return; end if;
  rl := public.rate_limit_consume('form_submit', public.request_ip());
  if (rl ->> 'allowed')::boolean is false then return query select null::text, null::uuid, null::uuid, 'rate_limited'::text; return; end if;
  if not public.turnstile_passes(p_captcha) then return query select null::text, null::uuid, null::uuid, 'captcha_failed'::text; return; end if;
  if p_email is null or p_email !~* '^[^@]+@[^@]+\.[^@]+$' then return query select null::text, null::uuid, null::uuid, 'invalid_email'::text; return; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 200 then return query select null::text, null::uuid, null::uuid, 'invalid_name'::text; return; end if;
  if p_description is null or length(trim(p_description)) = 0 or length(trim(p_description)) > 4500 then return query select null::text, null::uuid, null::uuid, 'invalid_description'::text; return; end if;
  if p_estimated_value is not null and p_estimated_value < 0 then return query select null::text, null::uuid, null::uuid, 'invalid_value'::text; return; end if;
  select coalesce(value #>> '{}', 'everyone') into v_mode from public.platform_settings where key = 'support_access_mode';
  v_body := concat_ws(E'\n', 'Référence : ' || v_ref, 'Nom : ' || trim(p_name), 'E-mail : ' || lower(trim(p_email)),
    case when nullif(trim(coalesce(p_phone, '')), '') is not null then 'Téléphone : ' || trim(p_phone) end,
    'Origine : ' || coalesce(nullif(trim(p_origin_country), ''), '—'),
    case when p_estimated_value is not null then 'Valeur estimée : ' || p_estimated_value::text end, '', trim(p_description));
  if v_uid is not null or coalesce(v_mode, 'everyone') = 'everyone' then
    if v_uid is null then v_token := gen_random_uuid(); end if;
    insert into public.support_conversations (user_id, guest_email, guest_name, guest_token, subject, language)
    values (v_uid, case when v_uid is null then lower(trim(p_email)) end, case when v_uid is null then nullif(trim(p_name), '') end, v_token,
            left(coalesce(nullif(trim(coalesce(p_subject, '')), ''), 'Demande de réexpédition') || ' — ' || v_ref, 300),
            case when p_language in ('fr', 'en') then p_language end)
    returning id into v_conv;
    insert into public.support_messages (conversation_id, sender_id, sender_role, body) values (v_conv, v_uid, 'client', v_body);
  end if;
  insert into public.forwarding_requests (id, reference, name, email, phone, origin_country, description, estimated_value, conversation_id)
  values (v_id, v_ref, trim(p_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''),
     coalesce(nullif(trim(p_origin_country), ''), '—'), trim(p_description), p_estimated_value, v_conv);
  return query select v_ref, v_conv, v_token, null::text;
end; $function$;
revoke all on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text, text) from public;
grant execute on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text, text, text, text) to anon, authenticated;

-- Notify payload: + language.
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
  select c.id, c.subject, c.user_id, c.guest_email, c.guest_name, c.guest_token, c.status, c.language
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
    'guest_token', conv.guest_token, 'client_account_type', acct, 'language', conv.language,
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
