import type { Provider } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthProviderRow = {
  id: string;
  provider: string;
  enabled: boolean;
  updated_at: string;
};

/** Fetch every configured provider row (public read). Used by both the
 *  admin panel and the login/signup pages. */
export async function fetchAuthProviders(): Promise<AuthProviderRow[]> {
  const { data, error } = await supabase
    .from('auth_providers')
    .select('*')
    .order('provider');
  if (error) { console.warn('[auth-providers] fetch failed:', error.message); return []; }
  return (data ?? []) as AuthProviderRow[];
}

export async function setProviderEnabled(id: string, enabled: boolean) {
  const { error } = await supabase.from('auth_providers').update({ enabled }).eq('id', id);
  if (error) throw error;
}

/** Kick off the OAuth redirect flow via Supabase. The credentials live in
 *  Supabase's Auth Providers config — this function never sees them. On
 *  success Supabase redirects to `/auth/callback` where our AuthCallback
 *  page resolves the session and sends the user home. */
export async function signInWithProvider(provider: Provider): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}
