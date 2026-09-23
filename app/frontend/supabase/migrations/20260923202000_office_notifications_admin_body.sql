-- Send log: return the actual content of each notified submission so the
-- admin can READ it from /admin/support (support message body, forwarding
-- request description, order lines + notes) — not only its metadata.
-- Return type changes → drop + recreate; same NULL-safe admin guard.

drop function if exists public.admin_list_office_notifications(text, int);

create function public.admin_list_office_notifications(
  p_status text default null, p_limit int default 100)
returns table (
  id uuid, kind text, record_id uuid, status text, detail text, resend_id text,
  created_at timestamptz, updated_at timestamptz,
  label text, contact text, conversation_id uuid, body text)
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
         m.conversation_id,
         case n.kind
           when 'support_message'    then m.body
           when 'forwarding_request' then f.description
           when 'order'              then concat_ws(E'\n',
             (select string_agg(coalesce(it->>'quantity', '1') || ' × ' || coalesce(it->>'name', it->>'slug', '?'), E'\n')
                from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) it),
             'Total : ' || o.total::text,
             case when o.notes is not null then 'Notes : ' || o.notes end)
         end
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
