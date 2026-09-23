-- Invoice RPCs: close the NULL-unsafe role guard.
--
-- Both functions are SECURITY DEFINER (bypass RLS) and guarded with
--   business_role(...) NOT IN ('owner','admin','manager','accounting')
-- For a caller who is NOT a member of the business (a client account, or
-- anon), business_role() returns NULL; `NULL NOT IN (...)` is NULL and the
-- IF never raises — so a non-member holding a shipment/invoice UUID could
-- create a draft invoice (draft_invoice_from_shipment, even as anon) or
-- issue one (issue_invoice). The invoices table's own RLS INSERT policy
-- (`= ANY(...)`) is NULL-safe; only these RPC paths bypassed it.
--
-- Fix: coalesce(role, '') so a non-member is refused, explicit
-- not_authenticated on the draft path, and no anon EXECUTE on any
-- invoice-writing function. Staff roles are unchanged.

create or replace function public.draft_invoice_from_shipment(p_shipment uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s   public.shipments;
  inv uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into s from public.shipments where id = p_shipment;
  if s.id is null then raise exception 'not_found'; end if;
  if coalesce(public.business_role(s.business_id, auth.uid()), '') not in ('owner','admin','manager','accounting') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  insert into public.invoices (business_id, customer_id, shipment_id, currency, notes, created_by)
  values (s.business_id, s.customer_id, s.id, s.currency,
          'Généré depuis expédition ' || s.reference, auth.uid())
  returning id into inv;

  insert into public.invoice_lines (invoice_id, line_index, description, quantity, unit_price, vat_pct)
  select inv,
         row_number() over (order by c.created_at),
         c.label,
         1,
         c.amount,
         21
  from public.shipment_charges c
  where c.shipment_id = s.id and c.is_billable and c.currency = s.currency;

  return inv;
end;
$function$;

create or replace function public.issue_invoice(p_invoice uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  inv    public.invoices;
  yr     text := to_char(now(), 'YYYY');
  n      int;
  new_no text;
  role   text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'not_found'; end if;

  role := public.business_role(inv.business_id, auth.uid());
  if coalesce(role, '') not in ('owner','admin','manager','accounting') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if inv.status in ('issued','paid','overdue') then
    return inv.number;
  end if;
  if inv.status = 'cancelled' then
    raise exception 'cannot_issue_cancelled_invoice';
  end if;

  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice) then
    raise exception 'no_lines' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inv_' || inv.business_id::text || '_' || yr, 0));

  select coalesce(max(nullif(regexp_replace(number, '^FAC-' || yr || '-', ''), '')::int), 0)
  into n
  from public.invoices
  where business_id = inv.business_id
    and number is not null
    and number like 'FAC-' || yr || '-%';

  new_no := 'FAC-' || yr || '-' || lpad((n + 1)::text, 5, '0');

  update public.invoices
     set number = new_no,
         status = 'issued',
         issued_on = coalesce(issued_on, current_date)
   where id = p_invoice;

  return new_no;
end;
$function$;

revoke execute on function public.draft_invoice_from_shipment(uuid) from public, anon;
revoke execute on function public.issue_invoice(uuid) from public, anon;
-- Only ever called from the invoice_lines totals trigger (itself SECURITY
-- DEFINER, runs as owner) — no client needs to call it.
revoke execute on function public.invoices_recompute_totals(uuid) from public, anon, authenticated;
grant execute on function public.draft_invoice_from_shipment(uuid) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
