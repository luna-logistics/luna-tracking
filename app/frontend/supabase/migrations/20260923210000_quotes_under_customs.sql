-- Devis: "sous douane" flag. The confirmed grid charges the €125 customs
-- admin fee (pricing_config.customsAdminFeeCents) ONLY to shipments under
-- customs, so the pro "Suggérer un tarif" needs to know it — and a reopened
-- quote must keep the same answer.
alter table public.quotes
  add column if not exists under_customs boolean not null default false;
