import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchMyBusinesses, type Business, type BusinessRole } from '@/lib/businesses';
import { can as roleCan, type BusinessAction } from '@/lib/business-permissions';

/**
 * The business the professional user is currently working inside +
 * their role in it. A user can belong to several businesses; the
 * "current" one is picked from localStorage (last chosen), falling back
 * to the first membership. When nothing is stored yet the frontend
 * routes the user through the "create your business" screen before any
 * business route renders.
 *
 * `can(action)` is a thin wrapper over the role → capability map in
 * business-permissions.ts — components use it to hide/disable buttons.
 * The DB layer's RLS is the source of truth; this is UX only.
 */

const CURRENT_BUSINESS_KEY = 'luna.currentBusinessId';

type Ctx = {
  businesses: Array<{ business: Business; role: BusinessRole }>;
  current: Business | null;
  role: BusinessRole | null;
  loading: boolean;
  select: (businessId: string) => void;
  refresh: () => Promise<void>;
  can: (action: BusinessAction) => boolean;
};

const BusinessContext = createContext<Ctx>({
  businesses: [],
  current: null,
  role: null,
  loading: true,
  select: () => {},
  refresh: async () => {},
  can: () => false,
});

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [businesses, setBusinesses] = useState<Ctx['businesses']>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(CURRENT_BUSINESS_KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || profile?.account_type !== 'business') {
      setBusinesses([]); setLoading(false); return;
    }
    setLoading(true);
    const rows = await fetchMyBusinesses();
    setBusinesses(rows);
    // Reconcile stored selection: keep it if the user still belongs to
    // that business, else fall back to the first row.
    setCurrentId((cur) => {
      if (rows.length === 0) return null;
      if (cur && rows.some((r) => r.business.id === cur)) return cur;
      return rows[0].business.id;
    });
    setLoading(false);
  }, [user?.id, profile?.account_type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authLoading || profileLoading) return;
    void refresh();
  }, [authLoading, profileLoading, refresh]);

  const select = useCallback((id: string) => {
    setCurrentId(id);
    try { localStorage.setItem(CURRENT_BUSINESS_KEY, id); } catch { /* private mode etc. */ }
  }, []);

  const value = useMemo<Ctx>(() => {
    const row = businesses.find((r) => r.business.id === currentId) ?? null;
    return {
      businesses,
      current: row?.business ?? null,
      role: row?.role ?? null,
      loading,
      select,
      refresh,
      can: (action) => roleCan(row?.role ?? null, action),
    };
  }, [businesses, currentId, loading, select, refresh]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() { return useContext(BusinessContext); }
