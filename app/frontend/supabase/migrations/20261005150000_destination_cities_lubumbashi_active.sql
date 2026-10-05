-- Align the destination_cities seed with the live DB: Lubumbashi is now a priced
-- corridor (Brussels → Lubumbashi, migration 20261005140000), so it is an ACTIVE
-- destination, not "coming soon". The original seed (20260904000000) listed it as
-- coming_soon; this promotes it. Idempotent and scoped to Lubumbashi only — Goma,
-- Matadi, Mbuji-Mayi and Kisangani keep their coming_soon status.
update public.destination_cities
   set status = 'active'
 where slug = 'lubumbashi'
   and status <> 'active';
