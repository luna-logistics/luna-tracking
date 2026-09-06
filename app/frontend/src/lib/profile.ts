import { supabase } from '@/lib/supabase';

/** Two account personalities on Luna today. `null` = user hasn't
 *  picked yet (freshly signed up, still on the onboarding screen). */
export type AccountType = 'individual' | 'business';

export const ACCOUNT_TYPES = ['individual', 'business'] as const;

export type Profile = {
  id: string;
  account_type: AccountType | null;
  onboarded_at: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) { console.warn('[profile] fetch failed:', error.message); return null; }
  return (data as Profile) ?? null;
}

/** Write the account_type + mark onboarding complete. Called from the
 *  onboarding page when the user picks a card. */
export async function setAccountType(userId: string, type: AccountType) {
  const { error } = await supabase.from('profiles')
    .update({ account_type: type, onboarded_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'account_type'>>) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}
