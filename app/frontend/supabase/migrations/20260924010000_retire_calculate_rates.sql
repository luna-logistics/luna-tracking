-- /rates retired (api-v1 answers 410 Gone). calculate_rates() over
-- rate_rules is a superseded placeholder tariff (air 6.50 EUR/kg + 50 base,
-- +15 % +5 EUR markup) that disagrees with the published grid in
-- pricing_config. It was also directly executable by anon/authenticated
-- through PostgREST, i.e. the stale prices stayed reachable even without
-- /rates. No other function calls it (checked). Kept (not dropped) so the
-- decision is reversible; only service_role can still run it.
revoke execute on function public.calculate_rates(text, text, text, numeric, numeric) from public, anon, authenticated;
