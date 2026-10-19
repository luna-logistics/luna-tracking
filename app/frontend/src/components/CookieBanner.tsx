import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { urlFor } from '@/lib/url/routes';
import { OPEN_EVENT, getConsent, setConsent } from '@/lib/consent';

// Staff back-office and og:image render pages never show the banner.
const EXCLUDED = /^\/(en\/)?(admin|og)(\/|$)/;

/**
 * Cookie consent banner. Accept and Refuse carry the same visual weight
 * (a refusal must be as easy as an acceptance). Mounted client-side only
 * after the first effect, so it never affects prerendered HTML, LCP or CLS
 * (fixed overlay, no layout space).
 */
export function CookieBanner() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  if (!open || EXCLUDED.test(pathname)) return null;

  const choose = (c: 'granted' | 'denied') => { setConsent(c); setOpen(false); };
  const btn = 'flex-1 rounded-lg border border-luna-aqua px-4 py-2.5 text-[13px] font-semibold transition-colors sm:flex-none sm:px-6';

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      className="fixed inset-x-0 bottom-0 z-[72] border-t border-luna-aqua/30 bg-luna-ink px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,.35)] sm:px-8"
    >
      <div className="mx-auto flex max-w-[1220px] flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1 text-[13px] leading-[1.55] text-[#DCE7F7]">
          <p id="cookie-title" className="mb-0.5 text-[14px] font-semibold text-white">{t('consent.title')}</p>
          <p>
            {t('consent.body')}{' '}
            <Link to={urlFor('privacy', lang)} className="font-medium text-luna-aqua underline-offset-2 hover:underline">
              {t('consent.learn_more')}
            </Link>
          </p>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={() => choose('denied')} className={`${btn} bg-transparent text-white hover:bg-white/10`}>
            {t('consent.refuse')}
          </button>
          <button type="button" onClick={() => choose('granted')} className={`${btn} bg-luna-aqua text-luna-ink hover:bg-luna-aqua2`}>
            {t('consent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
