-- Atomic "publish a new tariff" for the admin screen: deactivate the current row
-- and insert the new one as active, in a single transaction, so the previous grid
-- is kept as history (never overwritten) and there is never a window with zero (or
-- two) active rows. Admin-gated with the same is_admin() check as every other write.
create or replace function public.save_pricing_config(p_config jsonb, p_effective_from date default null)
returns public.pricing_config
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.pricing_config;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  update public.pricing_config set is_active = false where is_active;
  insert into public.pricing_config (is_active, effective_from, config)
  values (true, p_effective_from, p_config)
  returning * into new_row;
  return new_row;
end;
$$;

revoke all on function public.save_pricing_config(jsonb, date) from public, anon;
grant execute on function public.save_pricing_config(jsonb, date) to authenticated;
