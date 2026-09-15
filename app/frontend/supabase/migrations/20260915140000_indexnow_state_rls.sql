-- Security fix: enable RLS on indexnow_state (was public + writable by anon).
--
-- The table was created without RLS, so the public anon key (bundled in the
-- frontend) could SELECT/INSERT/UPDATE/DELETE the watermark row — e.g. push
-- last_run_at far into the future to silently stop all IndexNow submissions,
-- or back to epoch to spam-resubmit every URL and get the key throttled.
--
-- The indexnow-submit edge function reads/writes this table with the SERVICE
-- ROLE, which bypasses RLS, so it keeps working. No anon/authenticated write
-- path is needed. Admins may read it for observability; everyone else is
-- denied (RLS on + no permissive write policy = no access).

alter table public.indexnow_state enable row level security;

drop policy if exists indexnow_state_admin_read on public.indexnow_state;
create policy indexnow_state_admin_read on public.indexnow_state
  for select using (public.is_admin(auth.uid()));
