-- An admin writing in a conversation they OWN is acting as a client.
--
-- The stamp marked every message from an admin account as sender_role
-- 'admin'. When the site owner (the only admin) tested /tarifs while logged
-- in (2026-09-23 15:44, conversation a67c13ba…), the quote request itself
-- was stamped 'admin' → treated as a staff reply → no office e-mail, and it
-- showed 0 unread in /admin/support. Now 'admin' = an admin replying in
-- SOMEONE ELSE's conversation (or a guest one). A non-admin still can never
-- obtain 'admin' — unchanged.

create or replace function public.support_messages_stamp()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare owner_id uuid;
begin
  new.sender_id := auth.uid();
  select c.user_id into owner_id from public.support_conversations c where c.id = new.conversation_id;
  new.sender_role := case
    when coalesce(public.is_admin(auth.uid()), false)
         and (owner_id is null or owner_id is distinct from auth.uid()) then 'admin'
    else 'client'
  end;
  return new;
end;
$function$;
