import { supabase } from '@/lib/supabase';

/**
 * Frontend wrapper around the `translate` Edge Function. Never sees the
 * DeepL API key — Supabase forwards the call server-side. Admin-only
 * (the function itself checks is_admin() against the caller's JWT).
 */

export type TranslateResult = {
  translation: string;
  translations: string[];
};

export async function translateText(
  text: string | string[],
  targetLang: 'fr' | 'en',
  sourceLang?: 'fr' | 'en',
): Promise<TranslateResult> {
  const { data, error } = await supabase.functions.invoke<TranslateResult>('translate', {
    body: { text, targetLang, sourceLang },
  });
  if (error) throw error;
  if (!data) throw new Error('translate: empty response');
  return data;
}
