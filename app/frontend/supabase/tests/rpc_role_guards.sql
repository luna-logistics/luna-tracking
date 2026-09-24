-- Regression test: business-scoped SECURITY DEFINER RPCs must refuse
-- non-members and anonymous callers, and still work for real members.
--
-- Covers the 10 RPCs fixed on 2026-09-23/24 (NULL-unsafe
-- `business_role() NOT IN` guards), the admin-only user directory and
-- support soft-delete, shipment soft-delete (2026-09-24), + a sweep that fails if ANY public SECURITY DEFINER
-- function still contains that guard shape.
--
-- Run: Supabase SQL editor, or `psql "$DB_URL" -f supabase/tests/rpc_role_guards.sql`.
-- It ALWAYS rolls back: the block ends by raising either
--   "RPC GUARD TEST PASSED (rolled back) …"  or  "RPC GUARD TEST FAILED …".
-- Fixtures (shipment, quote, API key, webhook endpoint/delivery, invoice) are
-- created inside the transaction and never persist.

do $$
declare
  owner_uid uuid;
  biz       uuid;
  stranger  uuid := '00000000-0000-0000-0000-00000000dead';
  ok        text[] := '{}';
  bad       text[] := '{}';
  sid uuid; sid2 uuid; qid uuid; qid2 uuid; key_id uuid; ep_id uuid; del_id uuid; inv uuid; tok uuid; sec text;
  r record; n int;
begin
  select m.user_id, m.business_id into owner_uid, biz
    from public.business_members m where m.role = 'owner' order by m.joined_at limit 1;
  if owner_uid is null then raise exception 'RPC GUARD TEST FAILED: no owner membership to test with'; end if;

  -- Fixtures owned by the member's business (as the migration owner, RLS off).
  insert into public.shipments (business_id, direction, mode, status, currency, tracking_enabled)
    values (biz, 'export', 'air', 'draft', 'EUR', true) returning id into sid;
  insert into public.shipments (business_id, direction, mode, status, currency)
    values (biz, 'export', 'air', 'draft', 'EUR') returning id into sid2;
  insert into public.quotes (business_id, direction, mode, currency) values (biz, 'export', 'air', 'EUR') returning id into qid;
  insert into public.quotes (business_id, direction, mode, currency) values (biz, 'export', 'air', 'EUR') returning id into qid2;

  ---------------------------------------------------------------- member works
  perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select * into r from public.create_api_key(biz, 'guard-test', '["tracking.read"]'::jsonb); key_id := r.id;
    ok := array_append(ok, ('create_api_key: member OK')::text);
    select * into r from public.create_webhook_endpoint(biz, 'guard-test', 'https://example.invalid/hook', '["*"]'::jsonb); ep_id := r.id;
    ok := array_append(ok, ('create_webhook_endpoint: member OK')::text);
    sec := public.rotate_webhook_secret(ep_id);        ok := array_append(ok, ('rotate_webhook_secret: member OK')::text);
    del_id := public.send_test_webhook(ep_id);        ok := array_append(ok, ('send_test_webhook: member OK')::text);
    perform public.replay_webhook_delivery(del_id);   ok := array_append(ok, ('replay_webhook_delivery: member OK')::text);
    tok := public.rotate_shipment_tracking_token(sid); ok := array_append(ok, ('rotate_shipment_tracking_token: member OK')::text);
    perform public.accept_quote_to_shipment(qid);     ok := array_append(ok, ('accept_quote_to_shipment: member OK')::text);
    inv := public.draft_invoice_from_shipment(sid);   ok := array_append(ok, ('draft_invoice_from_shipment: member OK')::text);
    perform public.revoke_api_key(key_id);            ok := array_append(ok, ('revoke_api_key: member OK')::text);
  exception when others then
    bad := array_append(bad, (('member path broke: ' || sqlstate || ' ' || sqlerrm))::text);
  end;
  reset role;

  ---------------------------------------------------------- non-member refused
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_api_key(biz, 'x', '[]'::jsonb); bad := array_append(bad, ('create_api_key: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('create_api_key: non-member blocked')::text); end;
  begin perform public.revoke_api_key(key_id); bad := array_append(bad, ('revoke_api_key: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('revoke_api_key: non-member blocked')::text); end;
  begin perform public.create_webhook_endpoint(biz, 'x', 'https://example.invalid/x', '["*"]'::jsonb); bad := array_append(bad, ('create_webhook_endpoint: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('create_webhook_endpoint: non-member blocked')::text); end;
  begin perform public.rotate_webhook_secret(ep_id); bad := array_append(bad, ('rotate_webhook_secret: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('rotate_webhook_secret: non-member blocked')::text); end;
  begin perform public.rotate_shipment_tracking_token(sid); bad := array_append(bad, ('rotate_shipment_tracking_token: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('rotate_shipment_tracking_token: non-member blocked')::text); end;
  begin perform public.send_test_webhook(ep_id); bad := array_append(bad, ('send_test_webhook: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('send_test_webhook: non-member blocked')::text); end;
  begin perform public.replay_webhook_delivery(del_id); bad := array_append(bad, ('replay_webhook_delivery: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('replay_webhook_delivery: non-member blocked')::text); end;
  begin perform public.accept_quote_to_shipment(qid2); bad := array_append(bad, ('accept_quote_to_shipment: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('accept_quote_to_shipment: non-member blocked')::text); end;
  begin perform public.draft_invoice_from_shipment(sid); bad := array_append(bad, ('draft_invoice_from_shipment: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('draft_invoice_from_shipment: non-member blocked')::text); end;
  begin perform public.issue_invoice(inv); bad := array_append(bad, ('issue_invoice: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('issue_invoice: non-member blocked')::text); end;
  reset role;

  ------------------------------------------------------------ anonymous refused
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.rotate_shipment_tracking_token(sid); bad := array_append(bad, ('rotate_shipment_tracking_token: ANON ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('rotate_shipment_tracking_token: anon blocked')::text); end;
  begin perform public.rotate_webhook_secret(ep_id); bad := array_append(bad, ('rotate_webhook_secret: ANON ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('rotate_webhook_secret: anon blocked')::text); end;
  begin perform public.draft_invoice_from_shipment(sid); bad := array_append(bad, ('draft_invoice_from_shipment: ANON ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('draft_invoice_from_shipment: anon blocked')::text); end;
  reset role;

  ------------------------------------- admin-only directories / support admin
  -- admin_list_users exposes auth.users e-mails; admin_delete_support_conversation
  -- soft-deletes a thread. Both: staff with the right section only.
  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_list_users(); bad := array_append(bad, ('admin_list_users: NON-ADMIN ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('admin_list_users: non-admin blocked')::text); end;
  begin perform public.admin_delete_support_conversation('00000000-0000-0000-0000-000000000000'); bad := array_append(bad, ('admin_delete_support_conversation: NON-ADMIN ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('admin_delete_support_conversation: non-admin blocked')::text); end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.admin_list_users(); bad := array_append(bad, ('admin_list_users: ANON ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('admin_list_users: anon blocked')::text); end;
  reset role;

  ------------------------------------------ shipment soft delete / restore
  -- Member (owner): delete columns can't be written directly, hard DELETE is
  -- gone, delete_shipment hides the row everywhere (list, public link, RPCs),
  -- list_deleted_shipments shows it, restore_shipment brings it back.
  perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    begin
      update public.shipments set deleted_at = now() where id = sid;
      bad := array_append(bad, ('shipments.deleted_at: DIRECT UPDATE ALLOWED')::text);
    exception when insufficient_privilege then ok := array_append(ok, ('shipments.deleted_at: direct update blocked')::text); end;
    delete from public.shipments where id = sid;
    get diagnostics n = row_count;
    if n > 0 then bad := array_append(bad, ('shipments: HARD DELETE ALLOWED')::text);
    else ok := array_append(ok, ('shipments: hard delete refused')::text); end if;
    if public.get_public_shipment(tok) is null then bad := array_append(bad, ('fixture: public link should resolve before delete')::text); end if;
    perform public.delete_shipment(sid);              ok := array_append(ok, ('delete_shipment: member OK')::text);
    select count(*) into n from public.shipments where id = sid;
    if n <> 0 then bad := array_append(bad, ('deleted shipment still visible through RLS')::text);
    else ok := array_append(ok, ('deleted shipment hidden by RLS')::text); end if;
    if public.get_public_shipment(tok) is not null then bad := array_append(bad, ('deleted shipment: PUBLIC LINK STILL RESOLVES')::text);
    else ok := array_append(ok, ('deleted shipment: public link dead')::text); end if;
    begin perform public.rotate_shipment_tracking_token(sid); bad := array_append(bad, ('rotate token on DELETED shipment allowed')::text);
    exception when others then ok := array_append(ok, ('rotate token on deleted shipment refused')::text); end;
    select count(*) into n from public.list_deleted_shipments(biz) where id = sid;
    if n <> 1 then bad := array_append(bad, ('list_deleted_shipments: missing the deleted row')::text);
    else ok := array_append(ok, ('list_deleted_shipments: member OK')::text); end if;
  exception when others then
    bad := array_append(bad, (('shipment soft-delete member path broke: ' || sqlstate || ' ' || sqlerrm))::text);
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.delete_shipment(sid2); bad := array_append(bad, ('delete_shipment: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('delete_shipment: non-member blocked')::text); end;
  begin perform public.restore_shipment(sid); bad := array_append(bad, ('restore_shipment: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('restore_shipment: non-member blocked')::text); end;
  begin perform public.list_deleted_shipments(biz); bad := array_append(bad, ('list_deleted_shipments: NON-MEMBER ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('list_deleted_shipments: non-member blocked')::text); end;
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.delete_shipment(sid2); bad := array_append(bad, ('delete_shipment: ANON ALLOWED')::text);
  exception when insufficient_privilege then ok := array_append(ok, ('delete_shipment: anon blocked')::text); end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.restore_shipment(sid);
    select count(*) into n from public.shipments where id = sid;
    if n <> 1 then bad := array_append(bad, ('restore_shipment: row not visible again')::text);
    else ok := array_append(ok, ('restore_shipment: member OK')::text); end if;
  exception when others then
    bad := array_append(bad, (('restore_shipment member path broke: ' || sqlstate || ' ' || sqlerrm))::text);
  end;
  reset role;

  ------------------------------------------------ sweep: no NULL-unsafe guards
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosecdef
     and (p.prosrc ~* 'business_role\([^)]*\)\s*\)?\s*not\s+in' or p.prosrc ~* 'if\s+v?_?role\s+not\s+in');
  if n > 0 then bad := array_append(bad, ((n || ' SECURITY DEFINER function(s) still use a NULL-unsafe role guard'))::text);
  else ok := array_append(ok, ('sweep: 0 NULL-unsafe guards')::text); end if;

  if array_length(bad, 1) > 0 then
    raise exception 'RPC GUARD TEST FAILED (rolled back): % failure(s): % | passed: %',
      array_length(bad, 1), array_to_string(bad, '; '), array_length(ok, 1);
  end if;
  raise exception 'RPC GUARD TEST PASSED (rolled back): % checks — %', array_length(ok, 1), array_to_string(ok, '; ');
end $$;
