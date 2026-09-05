import { supabase } from '@/lib/supabase';

export type CityStatus = 'active' | 'coming_soon';

export type DestinationCity = {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  status: CityStatus;
  display_order: number;
};

/**
 * Fetches destination cities from Supabase, ordered for consistent display.
 * Public read is allowed by RLS — the quote form on /tarifs uses this too.
 * A network failure returns an empty list rather than throwing, so the page
 * can render a graceful empty state instead of an error card.
 */
export async function fetchDestinationCities(): Promise<DestinationCity[]> {
  const { data, error } = await supabase
    .from('destination_cities')
    .select('id, slug, name, country_code, status, display_order')
    .order('display_order', { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[cities] fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as DestinationCity[];
}

export async function toggleCityStatus(id: string, next: CityStatus) {
  const { error } = await supabase.from('destination_cities').update({ status: next }).eq('id', id);
  if (error) throw error;
}
