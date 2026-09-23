-- Réexpédition: real, persisted reference + linked support conversation.
--
-- Before: Forwarding.tsx inserted into forwarding_requests, then showed a
-- client-side random `REX-####` that was stored nowhere — a customer quoting
-- it could never be found.
--
-- Now (hybrid — forwarding_requests keeps its structured fields + admin
-- status workflow; the conversation gives the guest-token follow-up chat
-- and /admin/support visibility):
--   * forwarding_requests.reference: 'REX-' + first 8 hex of the row id,
--     generated server-side, UNIQUE — deterministic row ↔ reference mapping.
--     A BEFORE INSERT trigger fills it for every insert path.
--   * forwarding_requests.conversation_id → support_conversations.
--   * guest_submit_forwarding_request(): one transaction — conversation
--     (subject carries the reference) + first message + forwarding row.
--     Logged-in callers get a conversation on their account; guests get
--     one with a guest_token (same as guest_create_support_conversation).
--     If guest support access is disabled, the request + reference are
--     still saved (no conversation), so the form never breaks.
--   * Office e-mail: a forwarding row linked to a conversation is already
--     announced by the support-message e-mail (same content + reference),
--     so its own notification is skipped — one e-mail per submission.

alter table public.forwarding_requests
  add column if not exists reference text,
  add column if not exists conversation_id uuid
    references public.support_conversations(id) on delete set null;

create or replace function public.forwarding_requests_set_reference()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.id is null then new.id := gen_random_uuid(); end if;
  if new.reference is null then
    new.reference := 'REX-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;
  return new;
end;
$$;

drop trigger if exists forwarding_requests_set_reference on public.forwarding_requests;
create trigger forwarding_requests_set_reference
  before insert on public.forwarding_requests
  for each row execute function public.forwarding_requests_set_reference();

update public.forwarding_requests
   set reference = 'REX-' || upper(substr(replace(id::text, '-', ''), 1, 8))
 where reference is null;

alter table public.forwarding_requests alter column reference set not null;
create unique index if not exists forwarding_requests_reference_key on public.forwarding_requests (reference);
create index if not exists forwarding_requests_conversation_idx on public.forwarding_requests (conversation_id);

create or replace function public.guest_submit_forwarding_request(
  p_name text, p_email text, p_phone text, p_origin_country text,
  p_description text, p_estimated_value numeric, p_subject text)
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
revoke all on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text) from public;
grant execute on function public.guest_submit_forwarding_request(text, text, text, text, text, numeric, text) to anon, authenticated;

-- One office e-mail per submission (see header).
create or replace function public.notify_office_on_forwarding_request()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.conversation_id is null then
    perform public.enqueue_office_notification('forwarding_request', new.id);
  end if;
  return new;
end;
$$;
