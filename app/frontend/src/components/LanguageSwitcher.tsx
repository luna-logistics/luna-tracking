import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { SUPPORTED_LANGS, type SupportedLang, setLanguagePreference } from '@/i18n';
import { matchUrl, urlFor } from '@/lib/url/routes';
import { cn } from '@/lib/utils';

/**
 * Swaps the language for the current page, using the URL registry so a
 * localised slug (e.g. /suivi ↔ /en/tracking) is TRANSLATED, not prefix-
 * swapped. For a path the registry doesn't know, falls back to a prefix
 * swap so the switcher is never a dead end.
 */
function buildLangPath(pathname: string, lang: SupportedLang): string {
  const m = matchUrl(pathname);
  if (m) return urlFor(m.key, lang);
  // Fallback: strip any leading /en, then re-add if EN target.
  const bare = pathname.replace(/^\/en(\/|$)/, '/');
  const clean = bare === '' ? '/' : bare;
  return lang === 'fr' ? clean : clean === '/' ? '/en' : `/en${clean}`;
}

const LABELS: Record<SupportedLang, { flag: string; label: string; short: string }> = {
  fr: { flag: '🇫🇷', label: 'Français', short: 'FR' },
  en: { flag: '🇬🇧', label: 'English', short: 'EN' },
};

export function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentLang = (i18n.language === 'en' ? 'en' : 'fr') as SupportedLang;

  const handle = (lang: SupportedLang) => {
    if (lang === currentLang) return;
    setLanguagePreference(lang);
    const newPath = buildLangPath(location.pathname, lang);
    navigate(newPath + location.search + location.hash, { replace: true });
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language">
      {SUPPORTED_LANGS.map((lang) => {
        const active = currentLang === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => handle(lang)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
              active
                ? variant === 'dark'
                  ? 'bg-luna-cyan text-luna-navy'
                  : 'bg-luna-navy text-white'
                : variant === 'dark'
                  ? 'text-white/80 hover:text-white hover:bg-white/10'
                  : 'text-luna-navy/70 hover:text-luna-navy hover:bg-luna-navy/10'
            )}
            aria-label={LABELS[lang].label}
            aria-pressed={active}
          >
            <span aria-hidden="true">{LABELS[lang].flag}</span>
            <span>{LABELS[lang].short}</span>
          </button>
        );
      })}
    </div>
  );
}
