import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { initAnalytics, trackPageView, analyticsEnabled } from '@/lib/analytics';

// Staff back-office traffic would skew visitor stats.
const EXCLUDED = /^\/(en\/)?admin(\/|$)/;

/** Sends one GA4 page_view per client-side navigation (incl. the first).
 *  Waits a beat so react-helmet has written the new page's <title>. */
export function AnalyticsTracker() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => { initAnalytics(); }, []);

  useEffect(() => {
    if (!analyticsEnabled) return;
    const path = location.pathname + location.search;
    if (path === lastPath.current || EXCLUDED.test(location.pathname)) return;
    // Record the path only once sent: a cleanup (StrictMode double effect,
    // fast re-navigation) must not swallow the page_view.
    const id = window.setTimeout(() => {
      lastPath.current = path;
      trackPageView(path, document.title);
    }, 400);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.search]);

  return null;
}
