/**
 * HTTP fetch layer — independent of any parser (it knows nothing about product
 * fields). Handles: timeout, retry with backoff, redirects (native), gzip
 * (native fetch decompresses), content-type detection, configurable UA, and a
 * polite per-host rate limit. Never bypasses captchas/auth/protections: a 403/
 * 429/503 or a challenge page is reported, not circumvented.
 */
import { DEFAULT_USER_AGENT } from './types.mjs';
import { classifyResponse, STATUS } from './detect.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @typedef {Object} FetchResult
 * @property {boolean} ok
 * @property {number} status
 * @property {string} url        final URL after redirects
 * @property {string} contentType
 * @property {'html'|'json'|'xml'|'gzip'|'other'} kind
 * @property {string} body       text body ('' for binary/gzip handled elsewhere)
 * @property {Uint8Array|null} bytes  raw bytes (for gzip/binary)
 * @property {string|null} error
 * @property {boolean} blocked   true if the response looks like a bot challenge
 */

function classify(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return 'json';
  if (ct.includes('xml') || url.endsWith('.xml')) return 'xml';
  if (ct.includes('gzip') || url.endsWith('.gz')) return 'gzip';
  if (ct.includes('html')) return 'html';
  return 'other';
}

export class Fetcher {
  /** @param {{userAgent?:string, timeoutMs?:number, retries?:number, minDelayMs?:number}} [opts] */
  constructor(opts = {}) {
    this.userAgent = opts.userAgent || DEFAULT_USER_AGENT;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.retries = opts.retries ?? 2;
    this.minDelayMs = opts.minDelayMs ?? 500; // polite per-host spacing
    /** @type {Map<string, number>} host -> last request timestamp */
    this._lastAt = new Map();
    this.stats = { requests: 0, ok: 0, failed: 0, blocked: 0, bytes: 0 };
  }

  async _throttle(url) {
    let host = '';
    try { host = new URL(url).host; } catch { /* ignore */ }
    const last = this._lastAt.get(host) || 0;
    const wait = this.minDelayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    this._lastAt.set(host, Date.now());
  }

  /** @param {string} url @param {{accept?:string, asBytes?:boolean}} [o] @returns {Promise<FetchResult>} */
  async get(url, o = {}) {
    let attempt = 0;
    let lastErr = null;
    while (attempt <= this.retries) {
      await this._throttle(url);
      this.stats.requests++;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: ctrl.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': o.accept || 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-BE,fr;q=0.9,nl-BE;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
          },
        });
        clearTimeout(timer);
        const contentType = res.headers.get('content-type') || '';
        const kind = classify(contentType, res.url || url);
        let body = '', bytes = null;
        if (o.asBytes || kind === 'gzip') {
          const ab = await res.arrayBuffer();
          bytes = new Uint8Array(ab);
          this.stats.bytes += bytes.length;
        } else {
          body = await res.text();
          this.stats.bytes += body.length;
        }
        const headers = { 'retry-after': res.headers.get('retry-after') || '' };
        const block = classifyResponse({ status: res.status, url: res.url || url, requestedUrl: url, contentType, body, headers });
        const blocked = block.code !== STATUS.OK && block.code !== STATUS.NOT_A_PRODUCT_PAGE && block.code !== STATUS.JAVASCRIPT_REQUIRED;
        if (blocked) this.stats.blocked++;
        // Retry ONLY genuine transient server errors — never a detected
        // challenge/rate-limit/access-deny (retrying those is aggressive + futile).
        if (!res.ok && res.status >= 500 && res.status !== 501 && !block.terminal && attempt < this.retries) {
          attempt++; await sleep(400 * 2 ** attempt); continue;
        }
        if (res.ok) this.stats.ok++; else this.stats.failed++;
        return {
          ok: res.ok, status: res.status, url: res.url || url, requestedUrl: url,
          contentType, kind, body, bytes, headers, block,
          error: res.ok ? null : `HTTP ${res.status}`, blocked,
        };
      } catch (err) {
        clearTimeout(timer);
        lastErr = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err));
        if (attempt < this.retries) { attempt++; await sleep(400 * 2 ** attempt); continue; }
        this.stats.failed++;
        return { ok: false, status: 0, url, requestedUrl: url, contentType: '', kind: 'other', body: '', bytes: null, error: lastErr, blocked: false, block: classifyResponse({ status: 0, error: lastErr }) };
      }
    }
    this.stats.failed++;
    return { ok: false, status: 0, url, requestedUrl: url, contentType: '', kind: 'other', body: '', bytes: null, error: lastErr || 'unknown', blocked: false, block: classifyResponse({ status: 0, error: lastErr || 'unknown' }) };
  }

  /** Fetch + gunzip a (possibly gzipped) text resource. Uses native DecompressionStream. */
  async getText(url) {
    const r = await this.get(url, { asBytes: url.endsWith('.gz') });
    if (r.bytes && (r.kind === 'gzip' || url.endsWith('.gz'))) {
      try {
        const ds = new DecompressionStream('gzip');
        const stream = new Response(r.bytes).body.pipeThrough(ds);
        r.body = await new Response(stream).text();
        r.kind = r.body.trimStart().startsWith('<') ? 'xml' : 'other';
      } catch (e) {
        r.error = `gunzip failed: ${e?.message || e}`;
      }
    }
    return r;
  }
}
