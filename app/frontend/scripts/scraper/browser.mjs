/**
 * Browser fallback — LAST resort for pages whose product data only appears
 * after client-side rendering. It is an OPTIONAL extension: Playwright is not a
 * project dependency. The engine works fully over HTTP; when a page needs a
 * browser and Playwright is absent, the page is reported as
 * "browser-required" rather than failing the whole run.
 *
 * To enable: `pnpm add -D playwright` then `npx playwright install chromium`.
 * No captcha/protection bypass is performed here.
 */

let _pw = null;      // cached playwright module (or false if unavailable)

export async function browserAvailable() {
  if (_pw === false) return false;
  if (_pw) return true;
  try {
    _pw = await import('playwright');
    return true;
  } catch {
    _pw = false;
    return false;
  }
}

/**
 * Render a URL and return its DOM HTML (after network settles). Returns null if
 * Playwright is unavailable. Waits for a useful condition, not a fixed delay.
 * @param {string} url
 * @param {{ timeoutMs?:number, waitFor?:string, userAgent?:string }} [opts]
 * @returns {Promise<{ html:string|null, available:boolean, error:string|null }>}
 */
export async function renderPage(url, opts = {}) {
  if (!(await browserAvailable())) return { html: null, available: false, error: 'playwright not installed' };
  const { chromium } = _pw;
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: opts.userAgent });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs ?? 30000 });
    // Prefer an explicit signal (JSON-LD injected, or a selector) over a sleep.
    try {
      if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 8000 });
      else await page.waitForSelector('script[type="application/ld+json"], [itemtype*="Product"]', { timeout: 8000 });
    } catch { /* proceed with whatever rendered */ }
    const html = await page.content();
    await ctx.close();
    return { html, available: true, error: null };
  } catch (e) {
    return { html: null, available: true, error: e?.message || String(e) };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}
