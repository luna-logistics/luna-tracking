-- Two-level product categories: a top-level family (e.g. "Boissons") can hold
-- sub-categories (Eaux, Jus de fruits, Lait, Alcool). The shop filter renders
-- children grouped under their parent; a parent filter matches its children too.
--
-- Schema: self-referential parent_id (null = top level). Already applied to the
-- live DB via the MCP migration `add_parent_id_to_product_categories`; kept here
-- so a fresh environment reproduces the same taxonomy. Idempotent.

alter table public.product_categories
  add column if not exists parent_id uuid references public.product_categories(id) on delete set null;

create index if not exists idx_product_categories_parent on public.product_categories(parent_id);

-- Boissons sub-categories (created only if missing, by slug).
insert into public.product_categories (slug, name_fr, name_en, display_order, parent_id)
select v.slug, v.name_fr, v.name_en, v.display_order,
       (select id from public.product_categories where slug = 'drinks')
from (values
  ('water', 'Eaux',          'Waters',       61),
  ('juice', 'Jus de fruits', 'Fruit juices', 62),
  ('milk',  'Lait',          'Milk',         63)
) as v(slug, name_fr, name_en, display_order)
where not exists (select 1 from public.product_categories c where c.slug = v.slug)
  and exists (select 1 from public.product_categories where slug = 'drinks');

-- Move the pre-existing Alcool category under Boissons.
update public.product_categories
   set parent_id = (select id from public.product_categories where slug = 'drinks'),
       display_order = 64
 where slug = 'alcohol'
   and parent_id is null;
