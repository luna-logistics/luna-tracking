import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchDisabledFeatures, type DashboardType } from '@/lib/dashboard-features';
import { useAuth } from '@/contexts/AuthContext';

type Ctx = {
  disabledBusiness: Set<string>;
  disabledIndividual: Set<string>;
  loading: boolean;
  isFeatureEnabled: (dashboard: DashboardType, key: string) => boolean;
};

const DashboardFeaturesContext = createContext<Ctx>({
  disabledBusiness: new Set(),
  disabledIndividual: new Set(),
  loading: true,
  isFeatureEnabled: () => true,
});

export function DashboardFeaturesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [disabledBusiness, setDisabledBusiness] = useState<Set<string>>(new Set());
  const [disabledIndividual, setDisabledIndividual] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([
      fetchDisabledFeatures('business'),
      fetchDisabledFeatures('individual'),
    ]).then(([biz, ind]) => {
      if (cancelled) return;
      setDisabledBusiness(biz);
      setDisabledIndividual(ind);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  const isFeatureEnabled = (dashboard: DashboardType, key: string) => {
    const set = dashboard === 'business' ? disabledBusiness : disabledIndividual;
    return !set.has(key);
  };

  return (
    <DashboardFeaturesContext.Provider value={{ disabledBusiness, disabledIndividual, loading, isFeatureEnabled }}>
      {children}
    </DashboardFeaturesContext.Provider>
  );
}

export function useDashboardFeatures() {
  return useContext(DashboardFeaturesContext);
}
