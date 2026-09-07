-- Aggregated usage stats for one business over a time window. Role-gated:
-- any business member can read (usage transparency), but the caller
-- must belong to the business.
create or replace function public.get_api_usage(
  p_business uuid,
  p_since    timestamptz default (now() - interval '7 days'),
  p_until    timestamptz default now(),
  p_bucket   text        default 'day'
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  role text;
  bucket_unit text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  role := public.business_role(p_business, auth.uid());
  if role is null then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if p_bucket not in ('hour','day') then
    raise exception 'bucket_must_be_hour_or_day';
  end if;
  bucket_unit := p_bucket;

  return jsonb_build_object(
    'range', jsonb_build_object(
      'since', p_since,
      'until', p_until,
      'bucket', bucket_unit
    ),
    'totals', (
      select jsonb_build_object(
        'calls',             count(*)::int,
        'success',           sum(case when status < 400 then 1 else 0 end)::int,
        'client_error',      sum(case when status >= 400 and status < 500 then 1 else 0 end)::int,
        'server_error',      sum(case when status >= 500 then 1 else 0 end)::int,
        'avg_response_ms',   round(coalesce(avg(response_ms), 0))::int,
        'p95_response_ms',   coalesce(
          (percentile_cont(0.95) within group (order by coalesce(response_ms, 0)))::int, 0)
      )
      from public.api_usage_log
      where business_id = p_business
        and created_at between p_since and p_until
    ),
    'by_endpoint', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.calls desc), '[]'::jsonb)
      from (
        select path,
               count(*)::int as calls,
               round(coalesce(avg(response_ms), 0))::int as avg_ms,
               sum(case when status >= 400 then 1 else 0 end)::int as errors
        from public.api_usage_log
        where business_id = p_business
          and created_at between p_since and p_until
        group by path
        order by calls desc
        limit 20
      ) t
    ),
    'by_key', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.calls desc), '[]'::jsonb)
      from (
        select coalesce(k.name, 'unknown') as key_name,
               l.api_key_id,
               count(*)::int as calls,
               max(l.created_at) as last_call_at
        from public.api_usage_log l
        left join public.api_keys k on k.id = l.api_key_id
        where l.business_id = p_business
          and l.created_at between p_since and p_until
        group by k.name, l.api_key_id
        order by calls desc
      ) t
    ),
    'timeline', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]'::jsonb)
      from (
        select date_trunc(bucket_unit, created_at) as bucket,
               count(*)::int as calls,
               sum(case when status >= 400 then 1 else 0 end)::int as errors
        from public.api_usage_log
        where business_id = p_business
          and created_at between p_since and p_until
        group by 1
        order by 1
      ) t
    )
  );
end;
$$;

revoke all on function public.get_api_usage(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.get_api_usage(uuid, timestamptz, timestamptz, text) to authenticated;
