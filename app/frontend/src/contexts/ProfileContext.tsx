import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProfile, type Profile } from '@/lib/profile';

/**
 * Loads the current user's `profiles` row (auto-created on signup by a
 * DB trigger). Exposes it site-wide so any component can branch on
 * `account_type` without a per-page round-trip.
 *
 * Loading state:
 *   loading = true while we're waiting for both auth AND the initial
 *   profile fetch. Consumers use this to avoid a "flash" of the wrong
 *   dashboard between login and profile arrival.
 */
type Ctx = {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ProfileContext = createContext<Ctx>({
  profile: null,
  loading: true,
  refresh: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    const p = await fetchProfile(user.id);
    setProfile(p);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() { return useContext(ProfileContext); }
