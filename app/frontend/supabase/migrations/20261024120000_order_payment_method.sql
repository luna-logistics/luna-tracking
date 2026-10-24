-- Achat & Envoi checkout: the customer picks how they pay.
--
-- orders.payment_method
--   'card'           Stripe Checkout (existing flow, default for old rows)
--   'bank_transfer'  the customer wires the total to Luna's account; an admin
--                    moves the order to `paid` by hand once the money arrives.
--   Customers set it on insert only (they have no update policy on orders).
--
-- platform_settings 'bank_transfer_details'
--   The account shown to customers who pick a bank transfer, edited in
--   /admin/paiements. Readable by everyone (platform_settings_read) — these
--   are the details printed on every invoice, not secrets. Starts empty:
--   until an admin fills in the holder + IBAN, the checkout still accepts a
--   transfer and tells the customer Luna will send the details.

alter table public.orders
  add column if not exists payment_method text not null default 'card';

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('card', 'bank_transfer'));

insert into public.platform_settings (key, value)
values ('bank_transfer_details', jsonb_build_object(
  'account_holder', '',
  'iban',           '',
  'bic',            '',
  'bank_name',      '',
  'note_fr',        '',
  'note_en',        ''
))
on conflict (key) do nothing;
