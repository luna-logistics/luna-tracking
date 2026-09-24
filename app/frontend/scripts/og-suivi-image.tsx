/**
 * og:image for /suivi and its shared links (/suivi/lien/:token), drawn from
 * the page's own no-search route map — the SAME <TrackingMap view="preview">
 * the page renders, server-rendered to SVG, framed 1200×630 with the brand
 * panel, screenshotted by Playwright (local Chrome). Output is committed:
 *   public/brand/og-suivi-fr.jpg, public/brand/og-suivi-en.jpg
 * prerender-metas.mjs points both pages at them (unless an admin uploads a
 * `tracking_og` image). Re-run after changing the map or its copy:
 *   pnpm og:suivi
 * Not part of the build: CI has no browser, and the image only changes when
 * the design does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { TrackingMap, type MapData } from '../src/components/tracking/TrackingMap';

const ROOT = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/suivi-map.json'), 'utf8')) as MapData;
const fontUrl = (w: number) => pathToFileURL(path.join(ROOT, `node_modules/@fontsource/poppins/files/poppins-latin-${w}-normal.woff2`)).href;
const iconUrl = pathToFileURL(path.join(ROOT, 'public/brand/luna-icon.png')).href;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(lang: 'fr' | 'en') {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, `src/locales/${lang}.json`), 'utf8'));
  const svg = renderToStaticMarkup(
    <TrackingMap data={data} view="preview" variant="desktop" lang={lang}
      labels={{ bru: L.tracking_v2.bru, be: L.tracking_v2.be, cd: L.tracking_v2.cd, matadi: 'Matadi' }} />,
  );
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
  @font-face { font-family: Poppins; font-weight: 500; src: url(${fontUrl(500)}) format('woff2'); }
  @font-face { font-family: Poppins; font-weight: 600; src: url(${fontUrl(600)}) format('woff2'); }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: Poppins, sans-serif; }
  .card { position: relative; width: 1200px; height: 630px; background: #E4EDF6; overflow: hidden; }
  .card > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, #0A1650 0px, #0A1650 470px, rgba(10,22,80,0) 560px); }
  .panel { position: absolute; left: 0; top: 0; bottom: 0; width: 470px; box-sizing: border-box; padding: 56px 48px 52px;
           display: flex; flex-direction: column; }
  /* Same lockup as the site header (Navbar): icon + LUNA wordmark + aqua line. */
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { height: 62px; width: auto; }
  .word { font-weight: 600; font-size: 31px; letter-spacing: .055em; line-height: 1;
          background: linear-gradient(90deg, #2077C3 0%, #1AEBF5 100%); -webkit-background-clip: text; color: transparent; }
  .sub { margin-top: 5px; font-weight: 500; font-size: 15.5px; letter-spacing: .05em; color: #1FE0F0; }
  .eyebrow { margin-top: auto; color: #1FE0F0; font-weight: 600; font-size: 18px; letter-spacing: .2em; text-transform: uppercase; }
  h1 { margin: 14px 0 0; color: #fff; font-weight: 600; font-size: 50px; line-height: 1.12; letter-spacing: -.01em; }
  .tag { margin-top: 20px; color: #B9C9E0; font-weight: 500; font-size: 22px; line-height: 1.4; }
  .url { margin-top: 34px; color: #1FE0F0; font-weight: 500; font-size: 19px; }
</style></head><body><div class="card">${svg}<div class="fade"></div>
  <div class="panel">
    <div class="brand"><img src="${iconUrl}" alt=""><div><div class="word">LUNA</div><div class="sub">Tracking Logistics</div></div></div>
    <div class="eyebrow">${esc(L.nav.tracking)}</div>
    <h1>${esc(L.tracking.page_title)}</h1>
    <div class="tag">${esc(L.tracking.og_tagline)}</div>
    <div class="url">lunatrackinglogistics.com</div>
  </div></div></body></html>`;
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
  const tab = await ctx.newPage();
  for (const lang of ['fr', 'en'] as const) {
    const html = path.join(ROOT, `node_modules/.og-suivi-${lang}.html`);
    fs.writeFileSync(html, page(lang));
    await tab.goto(pathToFileURL(html).href);
    await tab.evaluate(() => document.fonts.ready);
    const out = path.join(ROOT, `public/brand/og-suivi-${lang}.jpg`);
    await tab.screenshot({ path: out, type: 'jpeg', quality: 86 });
    fs.rmSync(html);
    console.log(`[og:suivi] ${path.relative(ROOT, out)} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
}
