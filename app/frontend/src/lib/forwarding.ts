import { supabase } from '@/lib/supabase';
import { siteLanguage } from '@/lib/support-chat';

export const FORWARDING_STATUSES = ['new', 'contacted', 'quoted', 'closed'] as const;
export type ForwardingStatus = (typeof FORWARDING_STATUSES)[number];

export type ForwardingRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  origin_country: string;
  description: string;
  estimated_value: number | null;
  status: ForwardingStatus;
  created_at: string;
  /** Server-generated `REX-XXXXXXXX`, unique — what the customer is shown. */
  reference: string;
  /** Linked support thread (null when guest support access was disabled). */
  conversation_id: string | null;
};

export type NewForwardingRequest =
  Omit<ForwardingRequest, 'id' | 'created_at' | 'status' | 'reference' | 'conversation_id'>
  & { subject: string; captcha?: string | null; hp?: string };

export type ForwardingSubmission = {
  reference: string;
  conversation_id: string | null;
  guest_token: string | null;
};

/** One transaction server-side: the forwarding row (reference generated
 *  from its id), a support conversation + first message carrying the same
 *  reference, and — for guests — the token to follow up in the chat. */
export async function submitForwardingRequest(req: NewForwardingRequest): Promise<ForwardingSubmission> {
  const { data, error } = await supabase.rpc('guest_submit_forwarding_request', {
    p_name: req.name,
    p_email: req.email,
    p_phone: req.phone,
    p_origin_country: req.origin_country,
    p_description: req.description,
    p_estimated_value: req.estimated_value,
    p_subject: req.subject,
    p_captcha: req.captcha ?? null,
    p_hp: req.hp ?? '',
    p_language: siteLanguage(),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as (ForwardingSubmission & { error?: string | null }) | undefined;
  if (row?.error) throw new Error(row.error);
  if (!row?.reference) throw new Error('forwarding_submit_no_reference');
  return row;
}

export async function fetchAllForwardingRequests(): Promise<ForwardingRequest[]> {
  const { data, error } = await supabase
    .from('forwarding_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.warn('[forwarding] fetch failed:', error.message); return []; }
  return (data ?? []) as ForwardingRequest[];
}

export async function updateForwardingStatus(id: string, status: ForwardingStatus) {
  const { error } = await supabase.from('forwarding_requests').update({ status }).eq('id', id);
  if (error) throw error;
}
