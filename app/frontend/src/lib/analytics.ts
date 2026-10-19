/**
 * Google Analytics 4 — deferred, consent-mode-first, SPA page views.
 *
 * - `dataLayer` + `gtag()` exist from the first call (cheap), so early
 *   events queue; the remote gtag.js is only fetched after `window.load`
 *   (then on idle), so it never competes with the critical path (fonts,
 *   CSS, entry chunks, hero image).
 * - Consent Mode default = denied for every storage type BEFORE `config`:
 *   GA sends cookieless pings only until the visitor accepts in the cookie
 *   banner (lib/consent.ts), which flips GA + Meta Pixel via applyConsent().
 * - `send_page_view: false`: the SPA sends page_view itself on every
 *   route change (AnalyticsTracker), including the first one.
 * - Idempotent: a window flag guards init, so StrictMode double effects,
 *   HMR or a re-mounted tracker can never inject the tag twice.
 * - Production builds only (dev/preview-on-localhost traffic is not sent).
 *
 * Meta Pixel: nothing is installed or downloaded until the visitor accepts
 * the cookie banner. Then the standard `fbq` stub + `init` are set up and
 * `fbevents.js` is fetched on idle; the SPA sends `PageView` itself on every
 * route change via trackPageView() — so the init snippet's own auto PageView
 * is deliberately not duplicated. (Do NOT queue fbq('consent','revoke')
 * before 'init': a later 'grant' then sits behind the blocked init and the
 * pixel never fires.)
 */

import { CONSENT_EVENT, getConsent, type ConsentChoice } from '@/lib/consent';

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || 'G-0722R1H7HV';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __lunaGaInit?: boolean;
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
    _fbq?: unknown;
  }
}

export const analyticsEnabled = import.meta.env.PROD && typeof window !== 'undefined'
  && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

const META_PIXEL_ID = '1421507450172123';

function whenIdle(fn: () => void): void {
  const schedule = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 3000 });
    else window.setTimeout(fn, 1);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}

/** Install the Meta Pixel — called only once the visitor has accepted. Idempotent. */
function enableMetaPixel(): void {
  if (window.fbq) return;
  const n = function fbq(...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue!.push(args);
  } as NonNullable<Window['fbq']>;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  window.fbq('init', META_PIXEL_ID);
  whenIdle(() => {
    const f = document.createElement('script');
    f.async = true;
    f.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(f);
  });
}

/** Apply the visitor's choice to GA4 (Consent Mode) and the Meta Pixel. */
function applyConsent(choice: ConsentChoice): void {
  const granted = choice === 'granted';
  window.gtag?.('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
  try {
    if (granted) enableMetaPixel();
    else window.fbq?.('consent', 'revoke'); // only matters if accepted earlier on this page
  } catch { /* ignore */ }
}

function loadScriptWhenIdle(): void {
  whenIdle(() => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(s);
  });
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

  const stored = getConsent();
  if (stored) applyConsent(stored);
  window.addEventListener(CONSENT_EVENT, (e) => {
    const choice = (e as CustomEvent<ConsentChoice>).detail;
    applyConsent(choice);
    // The page the visitor is on was viewed while consent was off; count it now.
    if (choice === 'granted') {
      try { window.fbq?.('track', 'PageView'); } catch { /* ignore */ }
    }
  });
  loadScriptWhenIdle();
}

export function trackPageView(path: string, title: string): void {
  if (!analyticsEnabled || !window.gtag) return;
  try { window.fbq?.('track', 'PageView'); } catch { /* pixel must never break navigation */ }
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
