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

export async function createBusiness(input: {
  name: string;
  country?: string;
  currency?: Currency;
  legal_name?: string;
  vat_number?: string;
  company_number?: string;
}) {
  // Refresh the JWT before the insert. Default Supabase access-token
  // lifetime is 1 h and PostgREST's `auth.uid()` returns NULL for an
  // expired token — the RLS check `owner_user_id = auth.uid()` then
  // fails as "new row violates row-level security". Cheap round-trip;
  // avoids a class of "worked yesterday, broken today" bugs.
  const { data: { session }, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr || !session?.user) {
    // Fall back to the cached user (still throws if we truly have no
    // session at all).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return insertBusiness(user.id, input);
  }
  return insertBusiness(session.user.id, input);
}

async function insertBusiness(ownerUserId: string, input: {
  name: string;
  country?: string;
  currency?: Currency;
  legal_name?: string;
  vat_number?: string;
  company_number?: string;
}) {
  const { data, error } = await supabase.from('businesses').insert({
    owner_user_id: ownerUserId,
    name: input.name.trim(),
    country: input.country ?? 'BE',
    currency: input.currency ?? 'EUR',
    legal_name: input.legal_name ?? null,
    vat_number: input.vat_number ?? null,
    company_number: input.company_number ?? null,
  }).select().single();
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
