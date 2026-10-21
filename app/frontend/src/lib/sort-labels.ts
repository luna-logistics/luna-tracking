/**
 * Alphabetical order for every list shown to admins and customers
 * (categories, sub-categories, brands, stores). Kept free of the Supabase
 * client so pure helpers and their tests can use it.
 */
type Lang = 'fr' | 'en';
type Named = { name_fr: string; name_en: string };

/** Case and accents are ignored ("Électronique" sits with the E's), numbers sort naturally. */
export function compareLabels(a: string, b: string, lang: Lang = 'fr'): number {
  return a.localeCompare(b, lang, { sensitivity: 'base', numeric: true });
}

/** Comparator on the name shown in `lang`. */
export const byCategoryName = (lang: Lang = 'fr') =>
  (a: Named, b: Named) => compareLabels(lang === 'en' ? a.name_en : a.name_fr, lang === 'en' ? b.name_en : b.name_fr, lang);
