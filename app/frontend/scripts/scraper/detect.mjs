/**
 * Centralised response classifier. The engine must RECOGNISE protections and
 * abnormal responses — never bypass them. Given a fetch result it returns one
 * canonical status so a challenge page is never mistaken for a product.
 *
 * DETECT → CLASSIFY → STOP CLEANLY → REPORT → RESUME.  Never bypass/force.
 */

export const STATUS = {
  OK: 'OK',
  BLOCKED: 'BLOCKED',
  CAPTCHA: 'CAPTCHA',
  RATE_LIMITED: 'RATE_LIMITED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  BOT_CHALLENGE: 'BOT_CHALLENGE',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  JAVASCRIPT_REQUIRED: 'JAVASCRIPT_REQUIRED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NOT_A_PRODUCT_PAGE: 'NOT_A_PRODUCT_PAGE',
};

/** Statuses that mean "stop hitting this source" (vs. per-URL issues). */
export const TERMINAL_FOR_SOURCE = new Set([
  STATUS.BOT_CHALLENGE, STATUS.CAPTCHA, STATUS.RATE_LIMITED, STATUS.ACCESS_DENIED, STATUS.AUTH_REQUIRED,
]);

const CHALLENGE_MARKERS = [
  'just a moment', 'checking your browser', 'cf-browser-verification',
  '/cdn-cgi/challenge-platform', 'cf_chl_opt', 'attention required', 'ray id',
  'ddos protection by', 'perimeterx', '_px', 'datadome', 'incapsula', 'imperva',
  'access to this page has been denied', 'enable javascript and cookies to continue',
];
const CAPTCHA_MARKERS = [
  'g-recaptcha', 'grecaptcha', 'recaptcha/api.js', 'h-captcha', 'hcaptcha.com/1/api.js',
  'cf-turnstile', 'challenges.cloudflare.com/turnstile', "i'm not a robot", 'verify you are human',
];
const AUTH_MARKERS = ['sign in to continue', 'please log in', 'connectez-vous pour', 'veuillez vous connecter'];

const has = (body, markers) => { const b = body.slice(0, 6000).toLowerCase(); return markers.some((m) => b.includes(m)); };

function retryAfterSeconds(headers) {
  const v = headers?.['retry-after'] ?? headers?.get?.('retry-after');
  if (!v) return null;
  const n = parseInt(v, 10);
  if (Number.isFinite(n)) return n;
  const date = Date.parse(v);
  return Number.isFinite(date) ? Math.max(0, Math.round((date - Date.now()) / 1000)) : null;
}

/** Does a URL path look like a challenge/blocked/login endpoint? */
function pathLooksBlocked(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return /(\/cdn-cgi\/|challenge|captcha|blocked|denied|\/login|\/signin|\/account\/login)/.test(p);
  } catch { return false; }
}

/**
 * @param {{status:number, url?:string, requestedUrl?:string, contentType?:string, body?:string,
 *          error?:string|null, headers?:Record<string,string>|Headers, needsBrowser?:boolean}} r
 * @returns {{ code:string, reason:string, terminal:boolean, retryAfter:number|null }}
 */
export function classifyResponse(r) {
  const body = r.body || '';
  const ra = retryAfterSeconds(r.headers);
  const mk = (code, reason, retryAfter = null) => ({ code, reason, terminal: TERMINAL_FOR_SOURCE.has(code), retryAfter });

  // Transport failures
  if (r.error) return mk(STATUS.NETWORK_ERROR, r.error === 'timeout' ? 'request timed out' : `network: ${r.error}`);
  if (!r.status) return mk(STATUS.NETWORK_ERROR, 'no HTTP status');

  // Explicit HTTP signals
  if (r.status === 429) return mk(STATUS.RATE_LIMITED, 'HTTP 429 Too Many Requests', ra);
  if (r.status === 401) return mk(STATUS.AUTH_REQUIRED, 'HTTP 401 Unauthorized', ra);

  // Cloudflare/anti-bot often use 403 or 503 with a challenge body
  const challenge = has(body, CHALLENGE_MARKERS);
  const captcha = has(body, CAPTCHA_MARKERS);
  if (captcha && (challenge || body.length < 20000)) return mk(STATUS.CAPTCHA, 'captcha widget present');
  if (challenge) return mk(STATUS.BOT_CHALLENGE, 'anti-bot challenge page detected');

  if (r.status === 403) return mk(STATUS.ACCESS_DENIED, 'HTTP 403 Forbidden');
  if (r.status === 503) return mk(STATUS.BOT_CHALLENGE, 'HTTP 503 (challenge/temporary block)', ra);
  if (r.status >= 400) return mk(STATUS.ACCESS_DENIED, `HTTP ${r.status}`);

  // Redirected onto a challenge/login path
  if (r.url && r.requestedUrl && r.url !== r.requestedUrl && pathLooksBlocked(r.url)) {
    return mk(STATUS.BOT_CHALLENGE, `redirected to ${new URL(r.url).pathname}`);
  }
  if (has(body, AUTH_MARKERS) && body.length < 12000) return mk(STATUS.AUTH_REQUIRED, 'login wall');

  // If the page carries structured product data, it is real content regardless
  // of size — never downgrade it to small-body/JS-required.
  const structured = r.hasProduct
    || /application\/ld\+json/i.test(body)
    || /itemtype=["'][^"']*Product/i.test(body)
    || /property=["']og:type["'][^>]*content=["']product/i.test(body);
  if (structured) return mk(STATUS.OK, 'ok', ra);

  // Abnormally small 200 body → not real content (challenge stub or empty SPA)
  if (r.status === 200 && body.replace(/\s+/g, '').length < 300) {
    return mk(r.needsBrowser ? STATUS.JAVASCRIPT_REQUIRED : STATUS.NOT_A_PRODUCT_PAGE, 'response body abnormally small');
  }
  if (r.needsBrowser) return mk(STATUS.JAVASCRIPT_REQUIRED, 'content requires JavaScript rendering');

  return mk(STATUS.OK, 'ok', ra);
}
