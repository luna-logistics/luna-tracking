/**
 * Cookie consent — one choice covering the optional trackers (Google
 * Analytics 4 + Meta Pixel). Strictly necessary storage (session, language,
 * cart, support token) needs no consent and is not governed by this.
 *
 * Stored in localStorage as 'granted' | 'denied'; absent = not asked yet
 * (trackers stay off). Changes are broadcast with a window event so the
 * banner, the footer link and analytics.ts stay in sync without a context.
 */
export type ConsentChoice = 'granted' | 'denied';

const KEY = 'luna_cookie_consent_v1';
export const CONSENT_EVENT = 'luna:consent-changed';
export const OPEN_EVENT = 'luna:consent-open';

export function getConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice): void {
  try { window.localStorage.setItem(KEY, choice); } catch { /* private mode: choice lasts for this page only */ }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_EVENT, { detail: choice }));
}

/** Footer "Cookies" link: reopen the banner so the choice can be changed. */
export function openConsentBanner(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
