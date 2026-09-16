/**
 * Browser fallback (Playwright) — used ONLY for pages whose product data
 * appears after client-side rendering. HTTP stays the default; the engine
 * calls this only when a page is detected as JS-required, and caps how many
 * pages get rendered. Protections are DETECTED via the shared classifier and
 * reported — never bypassed (no captcha solving, no challenge evasion).
 *
 * Enable: `pnpm add -D playwright && npx playwright install chromium` (done).
 */
import { classifyResponse } from './detect.mjs';

let _pw = null; // cached playwright module, or false if unavailable

export async function browserAvailable() {
  if (_pw === false) return false;
  if (_pw) return true;
  try { _pw = await import('playwright'); return true; } catch { _pw = false; return false; }
}

/**
 * A reusable browser session: one Chromium instance + context shared across
 * many renders (fast), closed once at the end of a run.
 */
export class BrowserSession {
  constructor(opts = {}) { this.opts = opts; this._browser = null; this._ctx = null; }

  async _ensure() {
    if (this._ctx) return this._ctx;
    if (!(await browserAvailable())) throw new Error('playwright not installed');
    this._browser = await _pw.chromium.launch({ headless: true });
    this._ctx = await this._browser.newContext({ userAgent: this.opts.userAgent });
    return this._ctx;
  }

  /**
   * Render one URL. Waits for a useful signal (JSON-LD / Product), not a fixed
   * sleep. Returns rendered HTML + a block classification of what came back.
   * @returns {Promise<{ html:string|null, status:number, block:object|null, error:string|null }>}
   */
  async render(url, { timeoutMs = 30000, waitFor } = {}) {
    let ctx;
    try { ctx = await this._ensure(); } catch (e) { return { html: null, status: 0, block: null, error: e.message }; }
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      try {
        await page.waitForSelector(waitFor || 'script[type="application/ld+json"], [itemtype*="Product"]', { timeout: 8000 });
      } catch { /* proceed with whatever rendered */ }
      const html = await page.content();
      const status = resp ? resp.status() : 200;
      const block = classifyResponse({ status, url: page.url(), requestedUrl: url, body: html });
      return { html, status, block, error: null };
    } catch (e) {
      return { html: null, status: 0, block: classifyResponse({ status: 0, error: e?.name === 'TimeoutError' ? 'timeout' : (e?.message || 'render error') }), error: e?.message || String(e) };
    } finally {
      try { await page.close(); } catch { /* ignore */ }
    }
  }

  async close() {
    try { if (this._ctx) await this._ctx.close(); } catch { /* ignore */ }
    try { if (this._browser) await this._browser.close(); } catch { /* ignore */ }
    this._ctx = null; this._browser = null;
  }
}

/** One-off render (kept for convenience / tests). Prefer BrowserSession in a run. */
export async function renderPage(url, opts = {}) {
  if (!(await browserAvailable())) return { html: null, available: false, error: 'playwright not installed' };
  const s = new BrowserSession({ userAgent: opts.userAgent });
  try { const r = await s.render(url, opts); return { html: r.html, available: true, error: r.error, block: r.block }; }
  finally { await s.close(); }
}
