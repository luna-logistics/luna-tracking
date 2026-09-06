import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
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
  const bare = pathname.replace(/^\/en(\/|$)/, '/');
  const clean = bare === '' ? '/' : bare;
  return lang === 'fr' ? clean : clean === '/' ? '/en' : `/en${clean}`;
}

const LABELS: Record<SupportedLang, { flag: string; label: string; short: string }> = {
  fr: { flag: '🇫🇷', label: 'Français', short: 'FR' },
  en: { flag: '🇬🇧', label: 'English', short: 'EN' },
};

/**
 * Compact flag toggle. Trigger shows just the current flag; on click a
 * dropdown lists every language with its flag + name. Cuts the switcher
 * to a single ~40px pill and stays legible on desktop + mobile.
 */
export function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { langUrls } = useLangUrls();
  const currentLang = (i18n.language === 'en' ? 'en' : 'fr') as SupportedLang;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const goTo = (lang: SupportedLang) => {
    setOpen(false);
    if (lang === currentLang) return;
    setLanguagePreference(lang);
    const newPath = langUrls?.[lang] ?? buildLangPath(location.pathname, lang);
    navigate(newPath + location.search + location.hash, { replace: true });
  };

  const isDark = variant === 'dark';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
          isDark
            ? 'bg-white/10 text-white hover:bg-white/20'
            : 'bg-luna-navy/5 text-luna-navy hover:bg-luna-navy/10'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={LABELS[currentLang].label}
        title={LABELS[currentLang].label}
      >
        <span aria-hidden="true" className="text-base leading-none">{LABELS[currentLang].flag}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul
          role="listbox"
          className={cn(
            'absolute right-0 mt-2 min-w-[10rem] rounded-md border shadow-lg py-1 z-50',
            isDark
              ? 'bg-luna-navy-deep border-white/20 text-white'
              : 'bg-white border-slate-200 text-luna-navy'
          )}
        >
          {SUPPORTED_LANGS.map((lang) => {
            const active = lang === currentLang;
            return (
              <li key={lang}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => goTo(lang)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors',
                    isDark ? 'hover:bg-white/10' : 'hover:bg-luna-navy/5',
                    active && (isDark ? 'bg-white/5' : 'bg-luna-navy/5 font-semibold')
                  )}
                >
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="text-base leading-none">{LABELS[lang].flag}</span>
                    <span>{LABELS[lang].label}</span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
