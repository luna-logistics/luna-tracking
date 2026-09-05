import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr.json';
import en from './locales/en.json';

export const SUPPORTED_LANGS = ['fr', 'en'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// Two-value model, same shape as the pattern proven on Homie Book:
//  - VISIT_KEY (sessionStorage) — the language for THIS visit, set from a URL
//    prefix (/en) on arrival. Does NOT persist across sessions.
//  - PREF_KEY + EXPLICIT_KEY (localStorage) — the persisted preference, written
//    ONLY when the user picks a language from the switcher.
//
// Resolution: URL prefix → visit → explicit preference → FR.
//
// This is what stops the "language lock": arriving once on an /en search
// result does NOT persist English forever — it lasts the session only.
const PREF_KEY = 'i18n_language';
const EXPLICIT_KEY = 'i18n_lang_explicit';
const VISIT_KEY = 'i18n_visit_language';

const isLang = (v: unknown): v is SupportedLang =>
  typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v);

function ls(): Storage | null { try { return window.localStorage; } catch { return null; } }
function ss(): Storage | null { try { return window.sessionStorage; } catch { return null; } }

/** Persist an EXPLICIT language choice (switcher). Applies it immediately. */
export function setLanguagePreference(lang: SupportedLang): void {
  try {
    ls()?.setItem(PREF_KEY, lang);
    ls()?.setItem(EXPLICIT_KEY, '1');
    ss()?.setItem(VISIT_KEY, lang);
  } catch { /* storage unavailable — non-fatal */ }
  void i18n.changeLanguage(lang);
}

/** Set the visit language (from a URL prefix) WITHOUT persisting a preference. */
export function setVisitLanguage(lang: SupportedLang): void {
  try { ss()?.setItem(VISIT_KEY, lang); } catch { /* non-fatal */ }
}

/** The current effective language when the URL carries no prefix. */
export function effectiveStoredLanguage(): SupportedLang {
  const visit = ss()?.getItem(VISIT_KEY);
  if (isLang(visit)) return visit;
  const explicit = ls()?.getItem(EXPLICIT_KEY) === '1';
  const pref = ls()?.getItem(PREF_KEY);
  if (explicit && isLang(pref)) return pref;
  return 'fr';
}

function getInitialLanguage(): SupportedLang {
  try {
    const m = window.location.pathname.match(/^\/en(\/|$)/);
    if (m) { setVisitLanguage('en'); return 'en'; }
  } catch { /* no window (prerender) */ }
  return effectiveStoredLanguage();
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    lng: getInitialLanguage(),
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    interpolation: { escapeValue: false },
  });

export default i18n;
