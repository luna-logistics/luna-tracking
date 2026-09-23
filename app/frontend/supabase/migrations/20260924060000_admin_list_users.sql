-- Admins can look users up by e-mail (to promote them) without e-mails ever
-- leaving auth.users for everyone else.
--
-- E-mail lives only in auth.users (not exposed by PostgREST); profiles has no
-- e-mail column and must not get one (its RLS is owner-only today, but a copy
-- would be one policy mistake away from leaking every address). Instead:
--   • admin_has_permission(uid, perm) — (existing, unused until now) becomes the SQL twin of the front end's
--     useAdminCan(): an admin with no admin_users row (platform owner/admin
--     via business_members) has every section; a collaborator has what their
--     permissions JSON grants ({"all": true} or {"<section>": true}).
--   • admin_list_users(search, limit) — SECURITY DEFINER, allowed only to
--     admins holding the 'admins' section (the collaborators page's own
--     permission); anon/public cannot even execute it.
--
-- Also closes a privilege escalation found on the way: admin_users' write
-- policy accepted ANY admin, so a collaborator limited to e.g. the blog could
-- grant themselves {"all": true}. Writes now need the 'admins' section.

create or replace function public.admin_has_permission(uid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.is_admin(uid), false) and (
    not exists (select 1 from public.admin_users a where a.user_id = uid)
    or exists (
      select 1 from public.admin_users a
       where a.user_id = uid
         and (a.permissions -> 'all' = 'true'::jsonb or a.permissions -> perm = 'true'::jsonb)
    )
  );
$$;
revoke all on function public.admin_has_permission(uuid, text) from public, anon;
grant execute on function public.admin_has_permission(uuid, text) to authenticated;

drop policy if exists "admin_users admin write" on public.admin_users;
create policy "admin_users admin write" on public.admin_users
  for all
  using ((select public.admin_has_permission((select auth.uid()), 'admins')))
  with check ((select public.admin_has_permission((select auth.uid()), 'admins')));

create or replace function public.admin_list_users(p_search text default null, p_limit int default 200)
returns table (
  user_id uuid, email text, full_name text, account_type text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  is_admin boolean, admin_via text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.admin_has_permission(auth.uid(), 'admins') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text, p.full_name, p.account_type, u.created_at, u.last_sign_in_at,
         (u.email_confirmed_at is not null),
         coalesce(public.is_admin(u.id), false),
         case when exists (select 1 from public.admin_users a where a.user_id = u.id) then 'collaborator'
              when coalesce(public.is_admin(u.id), false) then 'platform' end
    from auth.users u
    left join public.profiles p on p.id = u.id
   where q is null
      or u.email ilike '%' || q || '%'
      or p.full_name ilike '%' || q || '%'
   order by u.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;
revoke all on function public.admin_list_users(text, int) from public, anon;
grant execute on function public.admin_list_users(text, int) to authenticated;
