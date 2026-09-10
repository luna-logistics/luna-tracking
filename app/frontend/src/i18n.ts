import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import fr from './locales/fr.json';
// EN is loaded on demand via dynamic import — see ensureLanguageLoaded()
// below. Keeping both bundles eagerly imported would ship ~85 KB of JSON
// (parse-as-JS on V8, slow on mobile) for a visitor who will only ever
// see one of them this session.

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

/**
 * Cache of language bundles that have been registered with i18next.
 * FR ships in the eager bundle (imported at module top); everything
 * else arrives via `ensureLanguageLoaded()` before we call
 * `i18n.changeLanguage()` — otherwise a `/en/*` visitor would flash
 * the FR fallback while EN parses.
 */
const loadedLanguages = new Set<SupportedLang>(['fr']);

/**
 * Load a language bundle on demand, register it with i18next, and
 * resolve. Idempotent: repeat calls for a loaded language return
 * synchronously (through the resolved Promise), so callers can await
 * this before every changeLanguage without penalty.
 *
 * Vite emits a separate chunk for each dynamic import target — the EN
 * JSON becomes its own asset that only /en visitors ever download.
 */
export async function ensureLanguageLoaded(lang: SupportedLang): Promise<void> {
  if (loadedLanguages.has(lang)) return;
  if (lang === 'en') {
    const mod = await import('./locales/en.json');
    if (loadedLanguages.has('en')) return;  // race: another caller won
    i18n.addResourceBundle('en', 'translation', mod.default, true, true);
    loadedLanguages.add('en');
  }
}

/** Persist an EXPLICIT language choice (switcher). Applies it immediately. */
export async function setLanguagePreference(lang: SupportedLang): Promise<void> {
  try {
    ls()?.setItem(PREF_KEY, lang);
    ls()?.setItem(EXPLICIT_KEY, '1');
    ss()?.setItem(VISIT_KEY, lang);
  } catch { /* storage unavailable — non-fatal */ }
  await ensureLanguageLoaded(lang);
  await i18n.changeLanguage(lang);
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
      // EN registered later by ensureLanguageLoaded() when needed.
    },
    lng: 'fr',
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    interpolation: { escapeValue: false },
  });

/**
 * Ensure the URL-derived initial language is fully loaded and active.
 * main.tsx awaits this before mount so `/en/*` visitors don't see a
 * one-frame flash of FR content before the EN bundle registers.
 * FR visitors (the majority) resolve on the next microtask — no delay.
 */
export async function bootI18n(): Promise<void> {
  const initial = getInitialLanguage();
  if (initial === 'fr') return;
  await ensureLanguageLoaded(initial);
  await i18n.changeLanguage(initial);
}

export default i18n;
