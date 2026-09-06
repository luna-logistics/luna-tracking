import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { SUPPORTED_LANGS, type SupportedLang, setLanguagePreference } from '@/i18n';
import { matchUrl, urlFor } from '@/lib/url/routes';
import { useLangUrls } from '@/contexts/LangUrlContext';
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
  const { langUrls } = useLangUrls();
  const currentLang = (i18n.language === 'en' ? 'en' : 'fr') as SupportedLang;
  const otherLang: SupportedLang = currentLang === 'fr' ? 'en' : 'fr';

  const goTo = (lang: SupportedLang) => {
    if (lang === currentLang) return;
    setLanguagePreference(lang);
    // Dynamic content pages (blog post, product detail, …) can override
    // the target URL via LangUrlContext so a blog post at /blog/mon-article
    // jumps to /en/blog/my-article instead of falling back to the index.
    const newPath = langUrls?.[lang] ?? buildLangPath(location.pathname, lang);
    navigate(newPath + location.search + location.hash, { replace: true });
  };

  // One-button toggle: shows the CURRENT language and, on click, swaps to
  // the other one. Cuts the navbar width in half vs. two side-by-side pills
  // and keeps the switcher legible on desktop + mobile.
  return (
    <button
      type="button"
      onClick={() => goTo(otherLang)}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
        variant === 'dark'
          ? 'bg-white/10 text-white hover:bg-white/20'
          : 'bg-luna-navy/5 text-luna-navy hover:bg-luna-navy/10'
      )}
      aria-label={`${LABELS[currentLang].label} → ${LABELS[otherLang].label}`}
      title={LABELS[otherLang].label}
    >
      <span aria-hidden="true">{LABELS[currentLang].flag}</span>
      <span>{LABELS[currentLang].short}</span>
      <span aria-hidden="true" className="opacity-40">·</span>
      <span aria-hidden="true">{LABELS[otherLang].short}</span>
    </button>
  );
}
