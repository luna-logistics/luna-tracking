-- Regression test: issued invoices are frozen (migration 20260925120000).
--
--   * draft → issued only through issue_invoice() (number assigned)
--   * after issue: content (parties, currency, notes, due date, lines) frozen
--   * issued → paid (manual = paid_via 'manual') / cancelled allowed; paid and
--     cancelled are terminal; a member cannot write stripe/payment fields
--   * an issued invoice cannot be deleted
--
-- Run: Supabase SQL editor, or `psql "$DB_URL" -f supabase/tests/invoices_lock.sql`.
-- ALWAYS rolls back: ends with "INVOICE LOCK TEST PASSED (rolled back) …" or
-- "INVOICE LOCK TEST FAILED …". The invoice fixture never persists.

do $$
declare
  owner_uid uuid;
  biz       uuid;
  inv       uuid;
  r         public.invoices;
  ok        text[] := '{}';
  bad       text[] := '{}';
begin
  select m.user_id, m.business_id into owner_uid, biz
    from public.business_members m where m.role = 'owner' order by m.joined_at limit 1;
  if biz is null then raise exception 'INVOICE LOCK TEST FAILED: no business owner for fixtures'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.invoices (business_id, currency, customer_party, notes)
    values (biz, 'EUR', '{"name":"Client test","email":"client@example.com"}', 'n1') returning id into inv;
  insert into public.invoice_lines (invoice_id, line_index, description, quantity, unit_price, vat_pct)
    values (inv, 1, 'Fret', 1, 100, 21);

  -- draft → issued by plain UPDATE must fail
  begin
    update public.invoices set status = 'issued' where id = inv;
    bad := bad || 'plain issue accepted'::text;
  exception when others then
    if sqlerrm like 'invoice_issue_via_rpc%' then ok := ok || 'plain issue refused'::text; else bad := bad || ('issue: ' || sqlerrm); end if;
  end;

  perform public.issue_invoice(inv);

  begin
    update public.invoices set notes = 'changed' where id = inv;
    bad := bad || 'notes edited after issue'::text;
  exception when others then
    if sqlerrm like 'invoice_locked%' then ok := ok || 'header frozen'::text; else bad := bad || ('header: ' || sqlerrm); end if;
  end;
  begin
    update public.invoices set currency = 'USD' where id = inv;
    bad := bad || 'currency edited after issue'::text;
  exception when others then
    if sqlerrm like 'invoice_locked%' then ok := ok || 'currency frozen'::text; else bad := bad || ('currency: ' || sqlerrm); end if;
  end;
  begin
    -- as the service role too: lines are frozen for everyone
    execute 'set local role service_role';
    insert into public.invoice_lines (invoice_id, line_index, description, quantity, unit_price, vat_pct)
      values (inv, 2, 'Extra', 1, 50, 21);
    bad := bad || 'line added after issue'::text;
  exception when others then
    if sqlerrm like 'invoice_locked%' then ok := ok || 'lines frozen'::text; else bad := bad || ('lines: ' || sqlerrm); end if;
  end;
  execute 'set local role authenticated';

  begin
    update public.invoices set paid_via = 'stripe', status = 'paid' where id = inv;
    bad := bad || 'member wrote paid_via=stripe'::text;
  exception when others then
    if sqlerrm like 'invoice_payment_fields_readonly%' then ok := ok || 'stripe fields guarded'::text; else bad := bad || ('stripe: ' || sqlerrm); end if;
  end;

  begin
    delete from public.invoices where id = inv;
    -- RLS limits deletes to drafts (0 rows) — also acceptable
    if exists (select 1 from public.invoices where id = inv) then ok := ok || 'issued not deletable'::text;
    else bad := bad || 'issued invoice deleted'::text; end if;
  exception when others then
    if sqlerrm like 'invoice_locked%' then ok := ok || 'issued not deletable'::text; else bad := bad || ('delete: ' || sqlerrm); end if;
  end;

  update public.invoices set status = 'paid' where id = inv returning * into r;
  if r.status = 'paid' and r.paid_via = 'manual' and r.paid_on is not null then ok := ok || 'manual paid recorded'::text;
  else bad := bad || format('manual paid: status=%s via=%s on=%s', r.status, r.paid_via, r.paid_on); end if;

  begin
    update public.invoices set status = 'cancelled' where id = inv;
    bad := bad || 'paid → cancelled accepted'::text;
  exception when others then
    if sqlerrm like 'invoice_status_terminal%' then ok := ok || 'paid terminal'::text; else bad := bad || ('terminal: ' || sqlerrm); end if;
  end;

  if array_length(bad, 1) is null then
    raise exception 'INVOICE LOCK TEST PASSED (rolled back) — %', array_to_string(ok, ', ');
  end if;
  raise exception 'INVOICE LOCK TEST FAILED — % (ok: %)', array_to_string(bad, ' | '), array_to_string(ok, ', ');
end $$;
