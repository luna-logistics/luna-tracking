-- Luna operates air, sea and road only. Rail and multimodal are removed
-- from every mode CHECK. Verified before applying: 0 shipments, 0 quotes
-- and 0 rate_rules rows use 'rail' or 'multi', so no record is affected.
alter table public.shipments  drop constraint if exists shipments_mode_check;
alter table public.shipments  add constraint shipments_mode_check  check (mode in ('air','sea','road'));
alter table public.quotes     drop constraint if exists quotes_mode_check;
alter table public.quotes     add constraint quotes_mode_check     check (mode in ('air','sea','road'));
alter table public.rate_rules drop constraint if exists rate_rules_mode_check;
alter table public.rate_rules add constraint rate_rules_mode_check check (mode in ('air','sea','road'));
