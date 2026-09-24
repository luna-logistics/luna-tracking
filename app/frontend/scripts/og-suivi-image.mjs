/**
 * Local fallback for the /suivi og:image. The normal path is server-side:
 * /admin/contenus → Suivi → "Régénérer l'image de preview" (the site Worker +
 * Cloudflare Browser Rendering, stored in Supabase Storage, served at
 * /brand/og-suivi-{lang}.jpg).
 *
 * This script screenshots the SAME render page (/og/suivi, /en/og/suivi —
 * src/pages/OgSuivi.tsx) with local Chrome and writes the committed defaults
 * the Worker serves until a generated image exists:
 *   public/brand/og-suivi-fr.default.jpg, public/brand/og-suivi-en.default.jpg
 *
 *   pnpm og:suivi                          # from the live site
 *   pnpm og:suivi http://localhost:4173    # from `vite preview` (unreleased changes)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'https://lunatrackinglogistics.com').replace(/\/$/, '');

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
  const tab = await ctx.newPage();
  for (const lang of ['fr', 'en']) {
    await tab.goto(`${base}${lang === 'en' ? '/en' : ''}/og/suivi`, { waitUntil: 'networkidle' });
    await tab.waitForSelector('[data-og-ready="true"]', { timeout: 20000 });
    const out = path.join(ROOT, `public/brand/og-suivi-${lang}.default.jpg`);
    await tab.screenshot({ path: out, type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log(`[og:suivi] ${path.relative(ROOT, out)} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
}
