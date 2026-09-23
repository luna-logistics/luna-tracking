/**
 * Google Analytics 4 — deferred, consent-mode-first, SPA page views.
 *
 * - `dataLayer` + `gtag()` exist from the first call (cheap), so early
 *   events queue; the remote gtag.js is only fetched after `window.load`
 *   (then on idle), so it never competes with the critical path (fonts,
 *   CSS, entry chunks, hero image).
 * - Consent Mode default = denied for every storage type BEFORE `config`:
 *   GA sends cookieless pings only. STOPGAP — there is no consent banner
 *   yet; when one exists it calls grantAnalyticsConsent().
 * - `send_page_view: false`: the SPA sends page_view itself on every
 *   route change (AnalyticsTracker), including the first one.
 * - Idempotent: a window flag guards init, so StrictMode double effects,
 *   HMR or a re-mounted tracker can never inject the tag twice.
 * - Production builds only (dev/preview-on-localhost traffic is not sent).
 */

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || 'G-0722R1H7HV';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __lunaGaInit?: boolean;
  }
}

export const analyticsEnabled = import.meta.env.PROD && typeof window !== 'undefined'
  && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

function loadScriptWhenIdle(): void {
  const inject = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(s);
  };
  const schedule = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(inject, { timeout: 3000 });
    else window.setTimeout(inject, 1);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}

export function initAnalytics(): void {
  if (!analyticsEnabled || window.__lunaGaInit) return;
  window.__lunaGaInit = true;

  window.dataLayer = window.dataLayer || [];
  // gtag.js reads the `arguments` object, not an array — keep the classic shape.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };

  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('set', 'ads_data_redaction', true);
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  loadScriptWhenIdle();
}

/** For the future consent banner — not called anywhere yet. */
export function grantAnalyticsConsent(): void {
  window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
}

export function trackPageView(path: string, title: string): void {
  if (!analyticsEnabled || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    // Never the hash: it can carry a guest support token.
    page_location: window.location.origin + window.location.pathname + window.location.search,
    page_title: title,
  });
}

/** Business events (GA4 key events). Fire-and-forget: a sync dataLayer push,
 *  never awaited, never throws — call it only AFTER the action succeeded.
 *  Params must never carry PII (no names, e-mails, phones, free text). */
export function trackEvent(name: string, params: Record<string, string | number | boolean | unknown[] | null | undefined> = {}): void {
  try {
    if (!analyticsEnabled || !window.gtag) return;
    window.gtag('event', name, params);
  } catch { /* analytics must never break a user flow */ }
}
