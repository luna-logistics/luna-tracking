-- Stripe (TEST mode) — schema for Achat & Envoi payments + webhook idempotency.
--
-- orders gets the Stripe identifiers the webhook writes back. Only the
-- service role (edge functions) writes them: the admin update policy
-- still lets platform admins move the status manually (out-of-band
-- payment), but the stripe_* / paid_at columns are guarded below.
--
-- stripe_events is the webhook's idempotency ledger: one row per Stripe
-- event id, claimed before processing, so a redelivered or concurrent event
-- is applied at most once. Admin-readable for diagnostics, no client writes.
--
-- platform_settings:
--   stripe_automatic_tax_enabled  false — Stripe Tax stays OFF on Achat &
--     Envoi until the accountant confirms the VAT treatment (diaspora payer
--     in BE, goods delivered in DRC). Flip only after that confirmation.

alter table public.orders
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id  text unique,
  add column if not exists paid_at                   timestamptz;

create or replace function public.orders_guard_stripe_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and (new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
       or new.stripe_payment_intent_id  is distinct from old.stripe_payment_intent_id
       or new.paid_at                   is distinct from old.paid_at) then
    raise exception 'order_stripe_fields_readonly' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists orders_guard_stripe_columns on public.orders;
create trigger orders_guard_stripe_columns
  before update on public.orders
  for each row execute function public.orders_guard_stripe_columns();

create table if not exists public.stripe_events (
  id            text primary key,                 -- evt_…
  type          text not null,
  livemode      boolean not null,
  status        text not null default 'processing'
                check (status in ('processing', 'processed', 'ignored', 'failed')),
  detail        text,
  received_at   timestamptz not null default now(),
  claimed_at    timestamptz not null default now(),
  processed_at  timestamptz,
  attempts      int not null default 1
);
create index if not exists stripe_events_status_idx on public.stripe_events (status, received_at desc);

alter table public.stripe_events enable row level security;
drop policy if exists stripe_events_admin_read on public.stripe_events;
create policy stripe_events_admin_read on public.stripe_events
  for select using (coalesce(public.is_admin((select auth.uid())), false));
revoke all on public.stripe_events from anon;
revoke insert, update, delete on public.stripe_events from authenticated;
grant select on public.stripe_events to authenticated;

-- Claim an event for processing. Returns true when the caller must process
-- it: a new event, or a previous attempt that failed / got stuck (>10 min in
-- 'processing'). Returns false for an event already processed or ignored,
-- or one another worker is processing right now.
create or replace function public.claim_stripe_event(p_id text, p_type text, p_livemode boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean;
begin
  insert into public.stripe_events (id, type, livemode) values (p_id, p_type, p_livemode)
  on conflict (id) do nothing;
  if found then return true; end if;

  update public.stripe_events
     set status = 'processing', attempts = attempts + 1, detail = null, claimed_at = now()
   where id = p_id
     and (status = 'failed' or (status = 'processing' and claimed_at < now() - interval '10 minutes'))
  returning true into claimed;
  return coalesce(claimed, false);
end $$;

create or replace function public.finish_stripe_event(p_id text, p_status text, p_detail text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.stripe_events
     set status = p_status, detail = p_detail, processed_at = now()
   where id = p_id;
$$;

revoke all on function public.claim_stripe_event(text, text, boolean) from public, anon, authenticated;
revoke all on function public.finish_stripe_event(text, text, text)   from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text, boolean) to service_role;
grant execute on function public.finish_stripe_event(text, text, text)   to service_role;

insert into public.platform_settings (key, value)
values ('stripe_automatic_tax_enabled', 'false'::jsonb)
on conflict (key) do nothing;
