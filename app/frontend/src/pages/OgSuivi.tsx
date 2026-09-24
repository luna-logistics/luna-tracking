import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { TrackingMap, useTrackingMap } from '@/components/tracking/TrackingMap';

/**
 * The og:image of /suivi and of every shared tracking link, as a page:
 * exactly 1200×630, the no-search route map (TrackingMap view="preview" —
 * both air corridors, no shipment's data) framed by the brand panel.
 *
 * Nothing here reads a tracking number, a token or the database: the map is
 * the static preview, the copy is i18n. So a screenshot of this page can never
 * carry a real shipment. It is screenshotted by the site Worker (Cloudflare
 * Browser Rendering, "Régénérer l'image de preview" in /admin/contenus) and
 * by `pnpm og:suivi` locally; both wait for [data-og-ready].
 *
 * /og/suivi (FR) · /en/og/suivi (EN). noindex, no site chrome.
 */
export default function OgSuivi() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const map = useTrackingMap(true);
  const [fonts, setFonts] = useState(false);
  useEffect(() => { void document.fonts.ready.then(() => setFonts(true)); }, []);

  const labels = { bru: t('tracking_v2.bru'), be: t('tracking_v2.be'), cd: t('tracking_v2.cd'), matadi: 'Matadi' };
  return (
    <>
      <Helmet><meta name="robots" content="noindex" /></Helmet>
      <div data-og-ready={map && fonts ? 'true' : undefined}
        className="relative overflow-hidden bg-[#E4EDF6] font-[Poppins,sans-serif]"
        style={{ width: 1200, height: 630 }}>
        {map && <TrackingMap data={map} view="preview" variant="desktop" lang={lang} labels={labels} alt={t('tracking.map_alt')} />}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, #0A1650 0px, #0A1650 470px, rgba(10,22,80,0) 560px)' }} />
        <div className="absolute inset-y-0 left-0 flex w-[470px] flex-col px-12 pb-[52px] pt-14">
          {/* Same lockup as the site header (Navbar). */}
          <div className="flex items-center gap-3.5">
            <img src="/brand/luna-icon.webp" alt="" className="h-[62px] w-auto" />
            <div>
              <div className="bg-luna-wordmark bg-clip-text text-[31px] font-semibold leading-none tracking-[0.055em] text-transparent">LUNA</div>
              <div className="mt-[5px] text-[15.5px] font-medium tracking-[0.05em] text-luna-aqua">Tracking Logistics</div>
            </div>
          </div>
          <div className="mt-auto text-[18px] font-semibold uppercase tracking-[0.2em] text-luna-aqua">{t('nav.tracking')}</div>
          <h1 className="mt-3.5 text-[50px] font-semibold leading-[1.12] tracking-[-0.01em] text-white">{t('tracking.page_title')}</h1>
          <div className="mt-5 text-[22px] font-medium leading-[1.4] text-[#B9C9E0]">{t('tracking.og_tagline')}</div>
          <div className="mt-[34px] text-[19px] font-medium text-luna-aqua">lunatrackinglogistics.com</div>
        </div>
      </div>
    </>
  );
}
