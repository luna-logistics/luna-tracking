/** Public customer-contact addresses. Single source for every page that shows them. */
export const CONTACT_EMAILS = [
  'veronique@lunatrackinglogistics.com',
  'lina@lunatrackinglogistics.com',
] as const;

/** "a ou b" / "a or b" — for running text and toasts. */
export function contactEmailsInline(lang: 'fr' | 'en'): string {
  return CONTACT_EMAILS.join(lang === 'en' ? ' or ' : ' ou ');
}
