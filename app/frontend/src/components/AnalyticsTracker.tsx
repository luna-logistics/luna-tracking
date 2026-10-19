import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { initAnalytics, trackPageView, trackEvent, analyticsEnabled } from '@/lib/analytics';

// Staff back-office traffic would skew visitor stats.
// Admin + the og:image render pages (visited by the screenshot browser).
const EXCLUDED = /^\/(en\/)?(admin|og)(\/|$)/;
// main.tsx sets this placeholder on non-prerendered URLs until Helmet runs.
const PLACEHOLDER_TITLE = 'Chargement…';
const POLL_MS = 100;
const MAX_WAIT_MS = 1500;

/** Sends one GA4 page_view per client-side navigation (incl. the first).
 *  Lazy routes set their <title> only once their chunk has loaded, so wait
 *  until the title differs from the previous page's (or give up after
 *  MAX_WAIT_MS and send what is there) — otherwise the page_view would
 *  carry the previous page's title. */
export function AnalyticsTracker() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);
  const lastTitle = useRef<string | null>(null);

  useEffect(() => { initAnalytics(); }, []);

  // One delegated listener for "contact intent" clicks (phone, WhatsApp, e-mail
  // links anywhere on the site) -> GA `contact_click` + Meta `Contact`.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      const href = a?.getAttribute('href') ?? '';
      const method = href.startsWith('tel:') ? 'phone'
        : /^https?:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href) ? 'whatsapp'
        : href.startsWith('mailto:') ? 'email' : null;
      if (method) trackEvent('contact_click', { method });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (!analyticsEnabled) return;
    const path = location.pathname + location.search;
    if (path === lastPath.current || EXCLUDED.test(location.pathname)) return;

    let waited = 0;
    let id = 0;
    const attempt = () => {
      const title = document.title;
      const ready = title !== lastTitle.current && title !== PLACEHOLDER_TITLE;
      if (!ready && waited < MAX_WAIT_MS) {
        waited += POLL_MS;
        id = window.setTimeout(attempt, POLL_MS);
        return;
      }
      // Recorded only once sent: a cleanup (StrictMode double effect, fast
      // re-navigation) must not swallow the page_view.
      lastPath.current = path;
      lastTitle.current = title;
      trackPageView(path, title);
    };
    id = window.setTimeout(attempt, POLL_MS);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.search]);

  return null;
}
