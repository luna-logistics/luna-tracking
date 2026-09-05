import { supabase } from '@/lib/supabase';

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
};

export type NewForwardingRequest = Omit<ForwardingRequest, 'id' | 'created_at' | 'status'>;

export async function submitForwardingRequest(req: NewForwardingRequest): Promise<void> {
  const { error } = await supabase.from('forwarding_requests').insert(req);
  if (error) throw error;
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
