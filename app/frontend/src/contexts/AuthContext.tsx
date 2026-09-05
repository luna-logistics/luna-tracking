import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True once the admin lookup has confirmed the user is in `admin_users`.
   *  False during hydration AND for non-admins — AdminGate distinguishes
   *  loading from denied by also reading `loading`. */
  isAdmin: boolean;
  /** Distinct from `loading`: the auth lookup can be done but the admin lookup
   *  still in flight (a separate round-trip). Kept separate so ProtectedRoute
   *  (auth only) doesn't wait on the admin lookup, and AdminGate does. */
  adminLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  adminLoading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Whenever the session flips, refresh the admin lookup. The helper
  // is_admin(uid) reads through a SECURITY DEFINER function, so a non-admin
  // user's RPC call returns false rather than a permission error.
  useEffect(() => {
    let cancelled = false;
    const uid = session?.user?.id;
    if (!uid) { setIsAdmin(false); setAdminLoading(false); return; }
    setAdminLoading(true);
    supabase.rpc('is_admin', { uid }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.warn('[auth] is_admin failed:', error.message); setIsAdmin(false); }
      else setIsAdmin(data === true);
      setAdminLoading(false);
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, loading, isAdmin, adminLoading, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
