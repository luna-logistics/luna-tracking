import { supabase } from '@/lib/supabase';

/** Call the public RPC directly. The api-v1 Edge Function wraps the
 *  same RPC — either path returns the same curated payload. */

export type RateMode = 'air' | 'sea' | 'road' | 'rail' | 'multi';

export type RateQuote = {
  provider_code: string;
  provider_name: string;
  service_mode: RateMode;
  currency: string;
  customer_price: number;
  transit_days_min: number | null;
  transit_days_max: number | null;
};

export type RateInput = {
  origin: string;         // ISO 3166-1 alpha-2
  destination: string;    // ISO 3166-1 alpha-2
  mode?: RateMode | null;
  weight_kg?: number;
  volume_m3?: number;
};

export async function calculateRates(input: RateInput): Promise<RateQuote[]> {
  const { data, error } = await supabase.rpc('calculate_rates', {
    p_origin_country: input.origin.toUpperCase(),
    p_destination_country: input.destination.toUpperCase(),
    p_mode: input.mode ?? null,
    p_weight_kg: input.weight_kg ?? 0,
    p_volume_m3: input.volume_m3 ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as RateQuote[];
}
