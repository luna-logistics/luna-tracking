import { supabase } from '@/lib/supabase';

/** Files attached to a shipment (invoice, packing list, BL, customs, photos…). */

export const DOCUMENT_KINDS = [
  'invoice', 'packing_list', 'bill_of_lading', 'customs', 'photo', 'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type ShipmentDocument = {
  id: string;
  shipment_id: string;
  business_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  byte_size: number | null;
  kind: DocumentKind;
  label: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

const BUCKET = 'shipment-documents';

/** Guess kind from filename/mime so the user doesn't have to pick every time. */
export function guessKind(filename: string, mime: string | null): DocumentKind {
  const n = filename.toLowerCase();
  if (mime?.startsWith('image/')) return 'photo';
  if (n.includes('invoice') || n.includes('facture')) return 'invoice';
  if (n.includes('packing') || n.includes('colisage')) return 'packing_list';
  if (n.includes('bl') || n.includes('bill') || n.includes('lading') || n.includes('cmr') || n.includes('awb')) return 'bill_of_lading';
  if (n.includes('douane') || n.includes('customs') || n.includes('t1') || n.includes('eur1')) return 'customs';
  return 'other';
}

export async function fetchDocuments(shipmentId: string): Promise<ShipmentDocument[]> {
  const { data, error } = await supabase
    .from('shipment_documents').select('*')
    .eq('shipment_id', shipmentId)
    .order('uploaded_at', { ascending: false });
  if (error) { console.warn('[docs] fetch failed:', error.message); return []; }
  return (data ?? []) as ShipmentDocument[];
}

/** Upload the file to storage, then register the row. Rolls back the object
 *  if the row insert fails so we don't leak orphans. */
export async function uploadDocument(args: {
  shipmentId: string;
  businessId: string;
  file: File;
  kind?: DocumentKind;
  label?: string | null;
}): Promise<ShipmentDocument> {
  const { shipmentId, businessId, file } = args;
  const kind = args.kind ?? guessKind(file.name, file.type);
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(0, 120);
  const path = `${businessId}/${shipmentId}/${crypto.randomUUID()}-${safeName}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (up.error) throw up.error;

  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('shipment_documents').insert({
    shipment_id: shipmentId,
    business_id: businessId,
    storage_path: path,
    filename: file.name,
    mime_type: file.type || null,
    byte_size: file.size,
    kind,
    label: args.label ?? null,
    uploaded_by: user?.id ?? null,
  }).select().single();

  if (error) {
    // Row insert failed: remove the object we just uploaded.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as ShipmentDocument;
}

/** Signed URL for private bucket, valid ~10 min. */
export async function signedUrl(storagePath: string, expiresIn = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function updateDocument(id: string, patch: Partial<Pick<ShipmentDocument, 'kind' | 'label'>>) {
  const { error } = await supabase.from('shipment_documents').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDocument(doc: ShipmentDocument) {
  // Delete row first (RLS gate); storage is best-effort — bucket policies would
  // block writes we shouldn't do anyway.
  const { error } = await supabase.from('shipment_documents').delete().eq('id', doc.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([doc.storage_path]).catch(() => {});
}

export function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
