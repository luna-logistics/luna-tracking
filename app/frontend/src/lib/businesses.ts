import { supabase } from '@/lib/supabase';

export const BUSINESS_ROLES = ['owner', 'admin', 'manager', 'accounting', 'operations', 'viewer'] as const;
export type BusinessRole = typeof BUSINESS_ROLES[number];

/** Roles an admin (or owner) may hand out to a NEW member. `owner` is
 *  excluded — a business has exactly one owner, transfer is a separate
 *  flow. */
export const INVITABLE_ROLES = ['admin', 'manager', 'accounting', 'operations', 'viewer'] as const;
export type InvitableRole = typeof INVITABLE_ROLES[number];

export const CURRENCIES = ['EUR','USD','GBP','CDF','CHF','CAD','XOF','XAF'] as const;
export type Currency = typeof CURRENCIES[number];

export type Business = {
  id: string;
  owner_user_id: string;
  name: string;
  legal_name: string | null;
  vat_number: string | null;
  company_number: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;   // ISO 3166-1 alpha-2
  currency: Currency;
  created_at: string;
  updated_at: string;
};

export type BusinessMember = {
  id: string;
  business_id: string;
  user_id: string;
  role: BusinessRole;
  invited_by: string | null;
  joined_at: string;
};

export type BusinessInvitation = {
  id: string;
  business_id: string;
  email: string;
  role: InvitableRole;
  invited_by: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  created_at: string;
};

/** Every business the current user is a member of, freshest first. */
export async function fetchMyBusinesses(): Promise<Array<{ business: Business; role: BusinessRole }>> {
  const { data, error } = await supabase
    .from('business_members')
    .select('role, business:businesses(*)')
    .order('joined_at', { ascending: false });
  if (error) { console.warn('[businesses] fetchMy failed:', error.message); return []; }
  return (data ?? [])
    .map((row) => ({
      role: row.role as BusinessRole,
      business: row.business as unknown as Business,
    }))
    .filter((r) => r.business);
}

/**
 * Creates the business through a SECURITY DEFINER RPC — the RPC reads
 * auth.uid() itself, refuses if NULL, and inserts server-side. This
 * sidesteps a class of RLS-vs-JWT edge cases that hit a raw INSERT:
 * stale access tokens, PostgREST claim propagation quirks, timing after
 * refresh, etc. The RPC does its own validation and the owner-member
 * trigger still fires afterwards.
 *
 * We also proactively refresh the JWT so the RPC sees a fresh session
 * whenever the tab has been idle for a while.
 */
export async function createBusiness(input: {
  name: string;
  country?: string;
  currency?: Currency;
  legal_name?: string;
  vat_number?: string;
  company_number?: string;
}) {
  await supabase.auth.refreshSession().catch(() => { /* fall through to RPC */ });

  const { data, error } = await supabase.rpc('create_business', {
    p_name:           input.name.trim(),
    p_country:        input.country ?? 'BE',
    p_currency:       input.currency ?? 'EUR',
    p_legal_name:     input.legal_name ?? null,
    p_vat_number:     input.vat_number ?? null,
    p_company_number: input.company_number ?? null,
  }).single();
  if (error) throw error;
  return data as Business;
}

export async function updateBusiness(id: string, patch: Partial<Omit<Business, 'id' | 'owner_user_id' | 'created_at' | 'updated_at'>>) {
  const { error } = await supabase.from('businesses').update(patch).eq('id', id);
  if (error) throw error;
}

// ─── Members ───────────────────────────────────────────────────────────

export async function fetchBusinessMembers(businessId: string): Promise<BusinessMember[]> {
  const { data, error } = await supabase
    .from('business_members').select('*')
    .eq('business_id', businessId)
    .order('joined_at', { ascending: true });
  if (error) { console.warn('[members] fetch failed:', error.message); return []; }
  return (data ?? []) as BusinessMember[];
}

export async function updateMemberRole(memberId: string, role: BusinessRole) {
  const { error } = await supabase.from('business_members').update({ role }).eq('id', memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string) {
  const { error } = await supabase.from('business_members').delete().eq('id', memberId);
  if (error) throw error;
}

// ─── Invitations ───────────────────────────────────────────────────────

export async function fetchInvitations(businessId: string): Promise<BusinessInvitation[]> {
  const { data, error } = await supabase
    .from('business_invitations').select('*')
    .eq('business_id', businessId)
    .is('claimed_at', null)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[invitations] fetch failed:', error.message); return []; }
  return (data ?? []) as BusinessInvitation[];
}

export async function inviteMember(businessId: string, email: string, role: InvitableRole) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('business_invitations').insert({
    business_id: businessId,
    email: email.trim().toLowerCase(),
    role,
    invited_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function cancelInvitation(id: string) {
  const { error } = await supabase.from('business_invitations').delete().eq('id', id);
  if (error) throw error;
}
