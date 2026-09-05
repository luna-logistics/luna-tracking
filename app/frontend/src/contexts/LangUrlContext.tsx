import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Lets a dynamic content page (blog post, product detail, ...) advertise its
 * cross-language URLs so the LanguageSwitcher can jump to the RIGHT slug in
 * the target language instead of falling back to the parent index.
 *
 * Pages call `setLangUrls({ fr, en })` in a useEffect when they know their
 * counterpart URL; the switcher reads whatever is set for the CURRENT
 * pathname. Auto-clears on navigation so a stale registration from a
 * previous page can't leak into another one.
 */

export type LangUrls = { fr: string; en: string } | null;

type Ctx = {
  langUrls: LangUrls;
  setLangUrls: (urls: LangUrls) => void;
};

const LangUrlContext = createContext<Ctx>({ langUrls: null, setLangUrls: () => {} });

export function LangUrlProvider({ children }: { children: ReactNode }) {
  const [langUrls, setInternal] = useState<LangUrls>(null);
  const location = useLocation();

  // On any route change, clear whatever the previous page had registered.
  useEffect(() => { setInternal(null); }, [location.pathname]);

  const setLangUrls = useCallback((urls: LangUrls) => setInternal(urls), []);
  const value = useMemo(() => ({ langUrls, setLangUrls }), [langUrls, setLangUrls]);
  return <LangUrlContext.Provider value={value}>{children}</LangUrlContext.Provider>;
}

export function useLangUrls() { return useContext(LangUrlContext); }
