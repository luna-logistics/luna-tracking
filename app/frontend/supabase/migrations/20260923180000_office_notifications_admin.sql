-- Admin send-log panel (/admin/support) for office_notifications.
--
-- admin_list_office_notifications: ledger rows + a human label per kind
--   (conversation subject + sender / forwarding requester / order
--   recipient) and, for support messages, the conversation id so the panel
--   can open the thread. Platform admins only.
-- admin_retry_office_notification: re-queue a failed / skipped row through
--   the same enqueue path (pending → pg_net → support-notify). A `sent` row
--   is never re-sent from here.
-- Both guards are NULL-safe: coalesce(is_admin(...), false).

create or replace function public.admin_list_office_notifications(
  p_status text default null, p_limit int default 100)
returns table (
  id uuid, kind text, record_id uuid, status text, detail text, resend_id text,
  created_at timestamptz, updated_at timestamptz,
  label text, contact text, conversation_id uuid)
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
         case n.kind
           when 'support_message'    then c.subject
           when 'forwarding_request' then f.origin_country
           when 'order'              then o.recipient_name
         end,
         case n.kind
           when 'support_message'    then coalesce(c.guest_name, p.full_name, c.guest_email)
           when 'forwarding_request' then coalesce(f.name, f.email)
           when 'order'              then coalesce(op.full_name, o.recipient_phone)
         end,
         m.conversation_id
    from public.office_notifications n
    left join public.support_messages m      on n.kind = 'support_message'    and m.id = n.record_id
    left join public.support_conversations c on c.id = m.conversation_id
    left join public.profiles p              on p.id = c.user_id
    left join public.forwarding_requests f   on n.kind = 'forwarding_request' and f.id = n.record_id
    left join public.orders o                on n.kind = 'order'              and o.id = n.record_id
    left join public.profiles op             on op.id = o.user_id
   where p_status is null or n.status = p_status
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.admin_list_office_notifications(text, int) from public, anon;
grant execute on function public.admin_list_office_notifications(text, int) to authenticated;

create or replace function public.admin_retry_office_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r public.office_notifications;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into r from public.office_notifications where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status not in ('failed', 'skipped') then
    raise exception 'not_retryable' using errcode = 'P0001';
  end if;
  -- Drop the row so enqueue re-creates it as `pending` and posts again.
  delete from public.office_notifications where id = p_id;
  perform public.enqueue_office_notification(r.kind, r.record_id);
end;
$$;
revoke all on function public.admin_retry_office_notification(uuid) from public, anon;
grant execute on function public.admin_retry_office_notification(uuid) to authenticated;
