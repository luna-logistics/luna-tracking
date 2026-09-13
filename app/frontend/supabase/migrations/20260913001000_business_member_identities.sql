-- Team page showed only the first 8 chars of each member's user_id
-- (a raw UUID fragment) because profiles is owner-readable only and
-- auth.users is not reachable from the client. This SECURITY DEFINER
-- RPC exposes just enough — display name + email — and ONLY to a
-- caller who is themselves a member of the same business. Nothing
-- broader than the membership already implies is revealed.

create or replace function public.get_business_member_identities(p_business uuid)
returns table (user_id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_business_member(p_business, auth.uid()) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  return query
    select m.user_id,
           p.full_name::text,
           u.email::text
    from public.business_members m
    left join public.profiles p on p.id = m.user_id
    left join auth.users     u on u.id = m.user_id
    where m.business_id = p_business;
end;
$$;

revoke all on function public.get_business_member_identities(uuid) from public;
grant execute on function public.get_business_member_identities(uuid) to authenticated;
