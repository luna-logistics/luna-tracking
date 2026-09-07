import { supabase } from '@/lib/supabase';

/** API plans catalog + quota status per business. All the arithmetic
 *  happens in the get_business_quota() RPC — the frontend just
 *  displays. Quota is not enforced anywhere yet (dormant); the switch
 *  is public.platform_settings.api_quota_enforced. */

export type ApiPlan = {
  id: string;
  code: 'free' | 'pro' | 'business' | 'enterprise' | string;
  name: string;
  monthly_quota: number | null;
  monthly_price: number | null;
  currency: string;
  features: string[];
  display_order: number;
};

export type QuotaStatus = {
  plan: {
    code: string;
    name: string;
    monthly_quota: number | null;
    monthly_price: number | null;
    currency: string;
    features: string[];
  };
  period: { start: string; end: string; reset_in_days: number };
  used_this_month: number;
  unlimited: boolean;
  remaining: number | null;
  percent_used: number;
};

export async function fetchPlans(): Promise<ApiPlan[]> {
  const { data, error } = await supabase
    .from('api_plans')
    .select('id, code, name, monthly_quota, monthly_price, currency, features, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) { console.warn('[plans] fetch failed:', error.message); return []; }
  return (data ?? []) as ApiPlan[];
}

export async function fetchQuota(businessId: string): Promise<QuotaStatus | null> {
  const { data, error } = await supabase.rpc('get_business_quota', { p_business: businessId });
  if (error) { console.warn('[quota] fetch failed:', error.message); return null; }
  return data as QuotaStatus;
}
