import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Anti-bot shield for the public submission forms (devis, contact,
 * réexpédition, chat start): a honeypot field + Cloudflare Turnstile.
 *
 * PageSpeed: nothing loads with the page. The Turnstile script is fetched
 * only on the FIRST focus inside the protected form (a human filling it in),
 * rendered in "interaction-only" mode (invisible unless Cloudflare wants a
 * click), and only when VITE_TURNSTILE_SITE_KEY is set at build time — with
 * no key the shield is just the honeypot. Verification is server-side
 * (turnstile_passes() in the guest RPCs), dormant until the matching secret
 * is stored in Supabase Vault.
 */

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_unavailable')));
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile_unavailable')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export type FormShieldProof = { captcha: string | null; hp: string };

export function useFormShield() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const [hp, setHp] = useState('');
  const { i18n } = useTranslation();

  const settle = (t: string | null) => {
    tokenRef.current = t;
    waiters.current.splice(0).forEach((w) => w(t));
  };

  const activate = useCallback(async () => {
    if (!SITE_KEY || widgetId.current || !containerRef.current) return;
    try {
      const ts = await loadTurnstile();
      if (widgetId.current || !containerRef.current) return;
      widgetId.current = ts.render(containerRef.current, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        size: 'flexible',
        language: i18n.language === 'en' ? 'en' : 'fr',
        callback: (t: string) => settle(t),
        'expired-callback': () => { tokenRef.current = null; },
        'error-callback': () => settle(null),
      });
    } catch { settle(null); }
  }, [i18n.language]);

  // Load on the first focus inside the protected form — never on page load.
  useEffect(() => {
    if (!SITE_KEY) return;
    const el = containerRef.current;
    const host = el?.closest<HTMLElement>('[data-shield-host]') ?? el?.closest('form') ?? el?.parentElement;
    if (!host) return;
    const onFocus = () => { void activate(); host.removeEventListener('focusin', onFocus); };
    host.addEventListener('focusin', onFocus);
    return () => host.removeEventListener('focusin', onFocus);
  }, [activate]);

  useEffect(() => () => {
    if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
  }, []);

  /** Resolve the proof to send with the submission (waits up to 10 s for the
   *  Turnstile token; the server decides what an absent token means). */
  const getProof = useCallback(async (): Promise<FormShieldProof> => {
    if (!SITE_KEY) return { captcha: null, hp };
    if (tokenRef.current) return { captcha: tokenRef.current, hp };
    void activate();
    const token = await new Promise<string | null>((resolve) => {
      waiters.current.push(resolve);
      window.setTimeout(() => resolve(tokenRef.current), 10_000);
    });
    return { captcha: token, hp };
  }, [activate, hp]);

  /** Tokens are single-use: call after every submission attempt. */
  const reset = useCallback(() => {
    tokenRef.current = null;
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  return { containerRef, hp, setHp, getProof, reset };
}

export type FormShieldHandle = ReturnType<typeof useFormShield>;

/** Place inside the protected <form>. Renders the honeypot (off-screen,
 *  hidden from assistive tech, not focusable) + the Turnstile slot. */
export function FormShield({ shield }: { shield: FormShieldHandle }) {
  return (
    <>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off"
            value={shield.hp} onChange={(e) => shield.setHp(e.target.value)} />
        </label>
      </div>
      {SITE_KEY && <div ref={shield.containerRef} className="empty:hidden" />}
      {!SITE_KEY && <div ref={shield.containerRef} hidden />}
    </>
  );
}
