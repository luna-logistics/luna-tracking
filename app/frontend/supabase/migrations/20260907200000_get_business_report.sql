-- Aggregate report RPC — KPIs + breakdowns + journals in one JSONB.
-- Members can read (transparency); no role gate beyond membership.
create or replace function public.get_business_report(
  p_business uuid,
  p_since    timestamptz,
  p_until    timestamptz
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  since_d date := p_since::date;
  until_d date := p_until::date;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_business_member(p_business, auth.uid()) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'range', jsonb_build_object('since', p_since, 'until', p_until),
    'currency', (select currency from public.businesses where id = p_business),
    'totals', jsonb_build_object(
      'invoices_issued_count', (
        select count(*)::int from public.invoices
        where business_id = p_business
          and status in ('issued','paid','overdue')
          and issued_on between since_d and until_d),
      'invoices_paid_count', (
        select count(*)::int from public.invoices
        where business_id = p_business
          and status = 'paid'
          and paid_on between since_d and until_d),
      'invoices_revenue_ex_vat', (
        select coalesce(sum(subtotal), 0) from public.invoices
        where business_id = p_business
          and status in ('issued','paid','overdue')
          and issued_on between since_d and until_d),
      'invoices_vat_collected', (
        select coalesce(sum(vat_total), 0) from public.invoices
        where business_id = p_business
          and status in ('issued','paid','overdue')
          and issued_on between since_d and until_d),
      'invoices_revenue_inc_vat', (
        select coalesce(sum(total), 0) from public.invoices
        where business_id = p_business
          and status in ('issued','paid','overdue')
          and issued_on between since_d and until_d),
      'expenses_total', (
        select coalesce(sum(amount), 0) from public.expenses
        where business_id = p_business
          and incurred_on between since_d and until_d),
      'shipments_created', (
        select count(*)::int from public.shipments
        where business_id = p_business
          and created_at between p_since and p_until),
      'shipments_delivered', (
        select count(*)::int from public.shipments
        where business_id = p_business
          and actual_delivery between since_d and until_d),
      'quotes_created', (
        select count(*)::int from public.quotes
        where business_id = p_business
          and created_at between p_since and p_until),
      'quotes_accepted', (
        select count(*)::int from public.quotes
        where business_id = p_business
          and status in ('accepted','converted')
          and accepted_at between p_since and p_until)
    ),
    'revenue_by_mode', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.subtotal desc), '[]'::jsonb)
      from (
        select s.mode,
               count(distinct i.id)::int as invoices,
               coalesce(sum(i.subtotal), 0) as subtotal
        from public.invoices i
        join public.shipments s on s.id = i.shipment_id
        where i.business_id = p_business
          and i.status in ('issued','paid','overdue')
          and i.issued_on between since_d and until_d
        group by s.mode
      ) t
    ),
    'top_customers', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.subtotal desc), '[]'::jsonb)
      from (
        select c.id, c.display_name,
               count(i.id)::int as invoices,
               coalesce(sum(i.subtotal), 0) as subtotal
        from public.invoices i
        join public.business_customers c on c.id = i.customer_id
        where i.business_id = p_business
          and i.status in ('issued','paid','overdue')
          and i.issued_on between since_d and until_d
        group by c.id, c.display_name
        order by subtotal desc
        limit 10
      ) t
    ),
    'sales_journal', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'number', i.number,
        'issued_on', i.issued_on,
        'paid_on', i.paid_on,
        'customer_name', c.display_name,
        'customer_vat', i.customer_party->>'vat_number',
        'customer_country', i.customer_party->>'country',
        'subtotal', i.subtotal,
        'vat_total', i.vat_total,
        'total', i.total,
        'currency', i.currency,
        'status', i.status
      ) order by i.issued_on, i.number), '[]'::jsonb)
      from public.invoices i
      left join public.business_customers c on c.id = i.customer_id
      where i.business_id = p_business
        and i.status in ('issued','paid','overdue')
        and i.issued_on between since_d and until_d
    ),
    'expenses_journal', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'incurred_on', e.incurred_on,
        'kind', e.kind,
        'label', e.label,
        'vendor', e.vendor,
        'invoice_ref', e.invoice_ref,
        'shipment_ref', s.reference,
        'amount', e.amount,
        'vat_pct', e.vat_pct,
        'currency', e.currency
      ) order by e.incurred_on), '[]'::jsonb)
      from public.expenses e
      left join public.shipments s on s.id = e.shipment_id
      where e.business_id = p_business
        and e.incurred_on between since_d and until_d
    )
  );
end;
$$;

revoke all on function public.get_business_report(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_business_report(uuid, timestamptz, timestamptz) to authenticated;
