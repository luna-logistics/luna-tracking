import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAllSiteContent, fetchAllSiteImages, fetchAllSiteBlocks, contentKey,
  type SiteContentRow, type SiteImageRow, type SiteBlockRow,
} from '@/lib/site-content';

/**
 * Loads every override row ONCE per app boot and exposes O(1) lookups via
 * `useContent(page, field, defaultValue)` and `useImage(key, defaultUrl)`.
 * Pages call these with the same key they defined in editable-content.ts.
 *
 * Missing DB → hooks return their defaultValue argument, so an empty
 * database (or a network hiccup on first paint) never blanks the page.
 * The admin editor calls `refresh()` after each save so the change reaches
 * the DOM immediately without a full page reload.
 */

type Ctx = {
  content: Map<string, string>;
  images: Map<string, string>;
  /** hidden-block set — presence in this set means the block is currently
   *  hidden by admin choice. Absence = default visible. */
  hiddenBlocks: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SiteContentContext = createContext<Ctx>({
  content: new Map(),
  images: new Map(),
  hiddenBlocks: new Set(),
  loading: true,
  refresh: async () => {},
});

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [contentRows, setContentRows] = useState<SiteContentRow[]>([]);
  const [imageRows, setImageRows] = useState<SiteImageRow[]>([]);
  const [blockRows, setBlockRows] = useState<SiteBlockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [c, i, b] = await Promise.all([fetchAllSiteContent(), fetchAllSiteImages(), fetchAllSiteBlocks()]);
    setContentRows(c);
    setImageRows(i);
    setBlockRows(b);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<Ctx>(() => {
    const content = new Map(contentRows.map((r) => [contentKey(r.page_key, r.lang, r.field_key), r.value]));
    const images = new Map(imageRows.map((r) => [r.image_key, r.url]));
    const hiddenBlocks = new Set(blockRows.filter((r) => r.hidden).map((r) => r.block_key));
    return { content, images, hiddenBlocks, loading, refresh };
  }, [contentRows, imageRows, blockRows, loading, refresh]);

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

/** Read an override for (page, lang, field). Falls back to defaultValue.
 *  Language comes from i18next so the hook re-renders when the user
 *  flips FR↔EN — reading document.documentElement.lang wouldn't. */
export function useContent(page: string, field: string, defaultValue: string): string {
  const { content } = useContext(SiteContentContext);
  const { i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  return content.get(contentKey(page, lang, field)) ?? defaultValue;
}

/** Read a site image URL by key. Falls back to defaultUrl. */
export function useSiteImage(imageKey: string, defaultUrl: string): string {
  const { images } = useContext(SiteContentContext);
  return images.get(imageKey) ?? defaultUrl;
}

/** True when the admin has hidden a block by its key. */
export function useBlockHidden(blockKey: string): boolean {
  const { hiddenBlocks } = useContext(SiteContentContext);
  return hiddenBlocks.has(blockKey);
}

/** Full access — used by the admin editor to refresh after saves. */
export function useSiteContentContext() {
  return useContext(SiteContentContext);
}
