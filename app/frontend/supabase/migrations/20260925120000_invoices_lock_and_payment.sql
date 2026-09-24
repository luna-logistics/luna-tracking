-- Invoices — lock issued invoices + online payment / e-mail plumbing (Stripe TEST).
--
-- 1. LOCK. Until now the invoices_update policy let an owner/admin/manager/
--    accounting member rewrite an issued invoice (parties, currency, due
--    date, notes…) and set any status, although the UI claimed issued
--    invoices were immutable. Once an invoice leaves 'draft' its content is
--    frozen for EVERY caller (definer RPCs and the service role included);
--    only the payment-lifecycle columns may still move:
--      status (issued/overdue → paid | cancelled | overdue/issued; paid and
--      cancelled are terminal), paid_on, paid_via, stripe_*, payment_token,
--      sent_at, updated_at.
--    A draft can no longer be flipped to issued/paid by a plain UPDATE: the
--    number must come from issue_invoice() (gapless numbering).
--    Lines of a non-draft invoice cannot be inserted/updated/deleted.
--    Corrections after issue = cancel + new invoice (credit notes: later).
--
-- 2. PAYMENT. Decision (a) 2026-09-25: only the platform's own business
--    ("Luna") can take online payment / send invoices by e-mail. Which
--    business that is lives in platform_settings.stripe_invoice_business_id
--    (admin-editable, NULL = feature off) — never hard-coded. Stripe only
--    COLLECTS the FAC-… amount: no Stripe invoice document, no Stripe Tax.
--    The customer reaches /facture/<payment_token> (no login): an
--    unguessable token set when the invoice is sent.
--    paid_via = 'stripe' can only be written by the service role (webhook).
--
-- 3. E-MAIL. send_invoice() queues kind 'invoice' on the existing
--    office_notifications ledger → support-notify → Resend. It is an explicit
--    staff action, so no global on/off switch silences it. Re-sending resets
--    the ledger row to pending.

-- ─── columns + setting ────────────────────────────────────────────
alter table public.invoices
  add column if not exists payment_token              uuid unique,
  add column if not exists sent_at                    timestamptz,
  add column if not exists sent_language              text check (sent_language in ('fr', 'en')),
  add column if not exists paid_via                   text check (paid_via in ('stripe', 'manual')),
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id   text unique;

insert into public.platform_settings (key, value)
values ('stripe_invoice_business_id', 'null'::jsonb)
on conflict (key) do nothing;

create or replace function public.stripe_invoice_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(value #>> '{}', '')::uuid from public.platform_settings where key = 'stripe_invoice_business_id';
$$;
revoke all on function public.stripe_invoice_business_id() from public, anon;
grant execute on function public.stripe_invoice_business_id() to authenticated, service_role;

-- ─── lock ─────────────────────────────────────────────────────────
create or replace function public.invoices_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  api_caller boolean := current_user in ('anon', 'authenticated');
  lifecycle  text[]  := array['status','paid_on','paid_via','stripe_checkout_session_id',
                              'stripe_payment_intent_id','payment_token','sent_at','sent_language','updated_at'];
begin
  if old.status = 'draft' then
    -- Leaving draft must go through issue_invoice() (it assigns the number).
    if new.status in ('issued', 'paid', 'overdue') and new.number is null then
      raise exception 'invoice_issue_via_rpc' using errcode = '42501';
    end if;
    if new.status in ('paid', 'overdue') then
      raise exception 'invoice_issue_first' using errcode = '42501';
    end if;
  else
    if (to_jsonb(new) - lifecycle) is distinct from (to_jsonb(old) - lifecycle) then
      raise exception 'invoice_locked' using errcode = '42501',
        hint = 'An issued invoice cannot be edited: cancel it and issue a new one.';
    end if;
    if old.status in ('paid', 'cancelled') and new.status is distinct from old.status then
      raise exception 'invoice_status_terminal' using errcode = '42501';
    end if;
    if new.status = 'draft' then
      raise exception 'invoice_cannot_return_to_draft' using errcode = '42501';
    end if;
  end if;

  if api_caller and (
       new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_payment_intent_id  is distinct from old.stripe_payment_intent_id
    or new.payment_token             is distinct from old.payment_token
    or new.sent_at                   is distinct from old.sent_at
    or new.sent_language             is distinct from old.sent_language
    or (new.paid_via = 'stripe' and old.paid_via is distinct from 'stripe')) then
    raise exception 'invoice_payment_fields_readonly' using errcode = '42501';
  end if;
  -- A manual "mark as paid" is recorded as such.
  if api_caller and new.status = 'paid' and old.status <> 'paid' then
    new.paid_via := 'manual';
    new.paid_on  := coalesce(new.paid_on, current_date);
  end if;
  return new;
end $$;

drop trigger if exists invoices_lock on public.invoices;
create trigger invoices_lock
  before update on public.invoices
  for each row execute function public.invoices_lock();

create or replace function public.invoices_block_delete_issued()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' and current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'invoice_locked' using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists invoices_block_delete_issued on public.invoices;
create trigger invoices_block_delete_issued
  before delete on public.invoices
  for each row execute function public.invoices_block_delete_issued();

create or replace function public.invoice_lines_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare st text;
begin
  select status into st from public.invoices
   where id = case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  -- st is null when the parent is being deleted in the same statement (cascade).
  if st is not null and st <> 'draft' then
    raise exception 'invoice_locked' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    select status into st from public.invoices where id = old.invoice_id;
    if st is not null and st <> 'draft' then
      raise exception 'invoice_locked' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists invoice_lines_lock on public.invoice_lines;
create trigger invoice_lines_lock
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_lock();

-- ─── notifications: new kind 'invoice' ────────────────────────────
alter table public.office_notifications drop constraint if exists office_notifications_kind_check;
alter table public.office_notifications add constraint office_notifications_kind_check
  check (kind in ('support_message', 'forwarding_request', 'order', 'client_reply', 'invoice'));

-- Same body as 20260924040000, plus: 'invoice' is an explicit staff action,
-- never silenced by a global switch.
create or replace function public.enqueue_office_notification(p_kind text, p_record uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  fn_url  text;
  anon    text;
  enabled boolean;
begin
  if p_kind <> 'invoice' then
    select coalesce((value)::boolean, true) into enabled
      from public.platform_settings
     where key = case when p_kind = 'client_reply' then 'client_reply_notification_enabled'
                      else 'support_notification_enabled' end;
    if enabled is false then return; end if;
  end if;

  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'support_notify_url' limit 1;
  select decrypted_secret into anon   from vault.decrypted_secrets where name = 'anon_key'           limit 1;

  if fn_url is null then
    insert into public.office_notifications (kind, record_id, status, detail)
    values (p_kind, p_record, 'failed', 'vault secret support_notify_url missing')
    on conflict (kind, record_id) do nothing;
    return;
  end if;

  insert into public.office_notifications (kind, record_id)
  values (p_kind, p_record)
  on conflict (kind, record_id) do nothing;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('kind', p_kind, 'id', p_record),
    headers := jsonb_build_object('Content-Type', 'application/json')
               || case when anon is not null
                       then jsonb_build_object('Authorization', 'Bearer ' || anon, 'apikey', anon)
                       else '{}'::jsonb end,
    timeout_milliseconds := 10000
  );
exception when others then
  begin
    insert into public.office_notifications (kind, record_id, status, detail)
    values (p_kind, p_record, 'failed', 'enqueue error: ' || sqlerrm)
    on conflict (kind, record_id) do update set status = 'failed', detail = excluded.detail, updated_at = now();
  exception when others then null;
  end;
end;
$$;
revoke all on function public.enqueue_office_notification(text, uuid) from public, anon, authenticated;

-- ─── send_invoice (staff) ─────────────────────────────────────────
-- Returns the payment token. Errors are specific so the UI can say what is
-- missing: insufficient_role, not_found, invoice_not_issued,
-- invoice_payment_not_enabled (not the platform business / setting unset),
-- invoice_no_customer_email, invoice_already_settled.
create or replace function public.send_invoice(p_invoice uuid, p_lang text default 'fr')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.invoices;
  role text;
  tok  uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'not_found'; end if;

  role := public.business_role(inv.business_id, auth.uid());
  if coalesce(role, '') not in ('owner', 'admin', 'manager', 'accounting') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;
  if inv.business_id is distinct from public.stripe_invoice_business_id() then
    raise exception 'invoice_payment_not_enabled' using errcode = 'P0001';
  end if;
  if inv.status in ('paid', 'cancelled') then raise exception 'invoice_already_settled' using errcode = 'P0001'; end if;
  if inv.status not in ('issued', 'overdue') then raise exception 'invoice_not_issued' using errcode = 'P0001'; end if;
  if coalesce(trim(inv.customer_party->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invoice_no_customer_email' using errcode = 'P0001';
  end if;

  tok := coalesce(inv.payment_token, gen_random_uuid());
  update public.invoices
     set payment_token = tok, sent_at = now(),
         sent_language = case when p_lang = 'en' then 'en' else 'fr' end
   where id = p_invoice;

  -- Re-send: put the ledger row back to pending so support-notify can claim it.
  update public.office_notifications
     set status = 'pending', detail = null, resend_id = null, updated_at = now()
   where kind = 'invoice' and record_id = p_invoice and status in ('sent', 'failed', 'skipped');
  perform public.enqueue_office_notification('invoice', p_invoice);
  return tok;
end $$;
revoke all on function public.send_invoice(uuid, text) from public, anon;
grant execute on function public.send_invoice(uuid, text) to authenticated;

-- ─── public read by token (the customer's invoice page) ───────────
create or replace function public.get_invoice_by_token(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare inv public.invoices; biz uuid := public.stripe_invoice_business_id();
begin
  if p_token is null then return null; end if;
  select * into inv from public.invoices where payment_token = p_token;
  if inv.id is null or inv.status = 'draft' then return null; end if;
  return jsonb_build_object(
    'number', inv.number, 'status', inv.status, 'currency', inv.currency,
    'issued_on', inv.issued_on, 'due_on', inv.due_on, 'paid_on', inv.paid_on, 'paid_via', inv.paid_via,
    'subtotal', inv.subtotal, 'vat_total', inv.vat_total, 'total', inv.total,
    'supplier_party', inv.supplier_party, 'customer_party', inv.customer_party,
    'payment_terms', inv.payment_terms, 'payment_reference', inv.payment_reference, 'notes', inv.notes,
    'payable', inv.business_id = biz and inv.status in ('issued', 'overdue') and inv.total > 0,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                 'description', l.description, 'quantity', l.quantity,
                 'unit_price', l.unit_price, 'vat_pct', l.vat_pct) order by l.line_index)
               from public.invoice_lines l where l.invoice_id = inv.id), '[]'::jsonb));
end $$;
revoke all on function public.get_invoice_by_token(uuid) from public;
grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;

-- ─── e-mail payload (service role only) ───────────────────────────
create or replace function public.get_invoice_notify_payload(p_invoice uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'number', i.number, 'status', i.status, 'currency', i.currency,
    'total', i.total, 'due_on', i.due_on, 'payment_token', i.payment_token,
    'customer_email', trim(i.customer_party->>'email'),
    'customer_name', coalesce(nullif(trim(i.customer_party->>'legal_name'), ''), nullif(trim(i.customer_party->>'name'), '')),
    'supplier_name', coalesce(nullif(trim(i.supplier_party->>'legal_name'), ''), nullif(trim(i.supplier_party->>'name'), ''), 'Luna Tracking Logistics'),
    'payable', i.business_id = public.stripe_invoice_business_id() and i.status in ('issued', 'overdue'),
    'language', coalesce(i.sent_language, 'fr'),
    'from_address', coalesce((select value #>> '{}' from public.platform_settings where key = 'support_from_address'), ''),
    'reply_to', coalesce((select value #>> '{}' from public.platform_settings where key = 'support_notification_email'), ''))
  from public.invoices i where i.id = p_invoice;
$$;
revoke all on function public.get_invoice_notify_payload(uuid) from public, anon, authenticated;
grant execute on function public.get_invoice_notify_payload(uuid) to service_role;
