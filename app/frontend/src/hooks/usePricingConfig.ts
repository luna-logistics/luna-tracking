import { useEffect, useState } from 'react';
import { loadPricingConfig, peekPricingConfig } from '@/lib/pricing/config';
import type { PricingConfig } from '@/lib/pricing/engine';
import type { PricingSource, ResolvedPricing } from '@/lib/pricing/fallback';

/**
 * The grid every public price is computed with (lib/pricing/config): the active
 * pricing_config row when it is reachable and valid, the fallback grid
 * otherwise. `config` is null only while loading (bounded by the fetch
 * timeout) — never because of an error.
 */
export function usePricingConfig(): { config: PricingConfig | null; source: PricingSource | null; loading: boolean } {
  const [state, setState] = useState<ResolvedPricing | null>(peekPricingConfig);
  useEffect(() => {
    let alive = true;
    void loadPricingConfig().then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, []);
  return { config: state?.config ?? null, source: state?.source ?? null, loading: state === null };
}
