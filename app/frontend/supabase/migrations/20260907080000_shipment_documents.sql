-- ─── Bucket (private) ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shipment-documents', 'shipment-documents', false, 26214400, -- 25 MB
  array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv','text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── Table ────────────────────────────────────────────────────────
create table if not exists public.shipment_documents (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid not null references public.shipments(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  storage_path  text not null unique,
  filename      text not null,
  mime_type     text,
  byte_size     bigint,
  kind          text not null default 'other'
                check (kind in ('invoice','packing_list','bill_of_lading','customs','photo','other')),
  label         text,
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);

create index if not exists shipment_documents_shipment_id_idx on public.shipment_documents (shipment_id);
create index if not exists shipment_documents_business_id_idx on public.shipment_documents (business_id);

alter table public.shipment_documents enable row level security;

drop policy if exists shipment_documents_select on public.shipment_documents;
create policy shipment_documents_select on public.shipment_documents
  for select using (public.is_business_member(business_id, auth.uid()));

drop policy if exists shipment_documents_insert on public.shipment_documents;
create policy shipment_documents_insert on public.shipment_documents
  for insert with check (public.is_business_member(business_id, auth.uid()));

drop policy if exists shipment_documents_update on public.shipment_documents;
create policy shipment_documents_update on public.shipment_documents
  for update using (public.is_business_member(business_id, auth.uid()))
  with check     (public.is_business_member(business_id, auth.uid()));

drop policy if exists shipment_documents_delete on public.shipment_documents;
create policy shipment_documents_delete on public.shipment_documents
  for delete using (public.is_business_member(business_id, auth.uid()));

-- ─── Storage policies on shipment-documents bucket ──────────────
-- Path layout: <business_id>/<shipment_id>/<uuid>-<filename>
drop policy if exists "shipment_documents storage read" on storage.objects;
create policy "shipment_documents storage read" on storage.objects
  for select using (
    bucket_id = 'shipment-documents'
    and public.is_business_member(
      nullif(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );

drop policy if exists "shipment_documents storage write" on storage.objects;
create policy "shipment_documents storage write" on storage.objects
  for insert with check (
    bucket_id = 'shipment-documents'
    and public.is_business_member(
      nullif(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );

drop policy if exists "shipment_documents storage update" on storage.objects;
create policy "shipment_documents storage update" on storage.objects
  for update using (
    bucket_id = 'shipment-documents'
    and public.is_business_member(
      nullif(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );

drop policy if exists "shipment_documents storage delete" on storage.objects;
create policy "shipment_documents storage delete" on storage.objects
  for delete using (
    bucket_id = 'shipment-documents'
    and public.is_business_member(
      nullif(split_part(name, '/', 1), '')::uuid,
      auth.uid()
    )
  );
