/**
 * Luna Tracking — asset server + SPA-fallback canonical guard.
 *
 * Every request hits the [assets] binding first. If a prerendered file
 * exists, it's served straight. On 404, we serve the shell but strip
 * the FR homepage's canonical / description / og:* / twitter:* /
 * JSON-LD tags, so an unmatched URL doesn't inherit homepage SEO.
 *
 * All branches wrapped in try/catch — a bug in shell-stripping must
 * never take the site down.
 */

// Plain-object handlers only — HTMLRewriter reads the `element` /
// `text` / `comments` FIELDS off the handler; a class with a public
// `.text` property (say, holding replacement text) trips
// "Incorrect type for the 'text' field on 'ElementContentHandlers'"
// because CF's parser thinks that property IS the text callback.
const stripHandler = { element(el) { el.remove(); } };
const neutralTitleHandler = {
  element(el) { el.setInnerContent('Luna Tracking Logistics'); },
};

async function serveNeutralShell(request, env) {
  const shellUrl = new URL(request.url);
  shellUrl.pathname = '/';
  shellUrl.search = '';
  const shellResponse = await env.ASSETS.fetch(shellUrl.toString());

  const rewriter = new HTMLRewriter()
    .on('link[rel="canonical"]',              stripHandler)
    .on('link[rel="alternate"][hreflang]',    stripHandler)
    .on('meta[name="description"]',           stripHandler)
    .on('meta[property^="og:"]',              stripHandler)
    .on('meta[name^="twitter:"]',             stripHandler)
    .on('script[type="application/ld+json"]', stripHandler)
    .on('title',                              neutralTitleHandler);

  const stripped = rewriter.transform(shellResponse);
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'x-luna-fallback': 'neutral-shell',
  };
  // public/_headers rules only reach asset responses, NOT this hand-built
  // one — so the noindex it declares for private areas never went out
  // (verified 2026-09-24: /admin, /compte, /entreprise had no header).
  if (isPrivatePath(new URL(request.url).pathname)) headers['x-robots-tag'] = 'noindex';
  return new Response(stripped.body, { status: 200, headers });
}

// ─── Shared tracking links: crawler-visible preview tags ────────────────
// /suivi/lien/:token can't be prerendered per token, so it used to fall
// into the neutral shell above — WhatsApp & co. saw no og:* at all.
// scripts/prerender-metas.mjs emits one generic template per language at
// /_share/public-tracking-{lang}; a live token gets that template (og:url
// rewritten to the shared URL), anything else gets /suivi's own prerendered
// page. Only generic copy is ever emitted — the RPC result is used as a
// yes/no and discarded, since the preview is public to whoever sees the link.
const SHARE_LINK = /^\/(?:suivi\/lien|en\/tracking\/link)\/([^/]+)\/?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tokenIsLive(token, env) {
  if (!UUID.test(token) || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_public_shipment`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
      // Crawlers give up after a few seconds; better the /suivi tags than none.
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    return (await res.json()) !== null;
  } catch (err) {
    console.error('[worker] share-link token check failed:', err && err.message ? err.message : err);
    return false;
  }
}

async function serveShareLink(request, env, token) {
  const url = new URL(request.url);
  const lang = url.pathname.startsWith('/en/') ? 'en' : 'fr';
  const live = await tokenIsLive(token, env);

  const assetUrl = new URL(url.origin);
  assetUrl.pathname = live ? `/_share/public-tracking-${lang}` : (lang === 'en' ? '/en/tracking' : '/suivi');
  const asset = await env.ASSETS.fetch(assetUrl.toString());
  if (!asset.ok) return serveNeutralShell(request, env);

  const shareUrl = `${url.origin}${url.pathname.replace(/\/$/, '')}`;
  const body = live
    ? new HTMLRewriter()
        .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', shareUrl); } })
        .transform(asset).body
    : asset.body;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      'x-luna-fallback': live ? 'share-link' : 'share-link-invalid',
    },
  });
}

// ─── og:image of /suivi + shared links, regenerated from the admin ─────────
// POST /api/og/suivi/regenerate ("Régénérer l'image de preview", /admin/contenus)
// screenshots the /og/suivi render page (FR + EN, 1200×630) with Cloudflare
// Browser Rendering and stores the JPEGs in Supabase Storage (site-images/og/,
// uploaded with the clicking admin's own session — the bucket's admin-write
// policy decides). GET /brand/og-suivi-{fr,en}.jpg — the URL every og:image
// tag already points at — serves the generated image, or the committed
// default (/brand/og-suivi-{lang}.default.jpg) until one exists. The render
// page draws the static preview map only: no token, no search, no DB read —
// a regeneration can never put a real shipment into a public preview.
const OG_IMAGE = /^\/brand\/og-suivi-(fr|en)\.jpg$/;
const OG_REGENERATE = '/api/og/suivi/regenerate';
const ogStorePath = (lang) => `og/og-suivi-${lang}.jpg`;

async function serveOgImage(request, env, lang) {
  if (env.SUPABASE_URL) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/public/site-images/${ogStorePath(lang)}`,
        { cf: { cacheTtl: 60, cacheEverything: true } });
      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'cache-control': 'public, max-age=300',
            'x-luna-og': 'generated',
            ...(res.headers.get('last-modified') ? { 'last-modified': res.headers.get('last-modified') } : {}),
          },
        });
      }
    } catch (err) {
      console.error('[worker] og image fetch failed:', err && err.message ? err.message : err);
    }
  }
  const fallback = new URL(request.url);
  fallback.pathname = `/brand/og-suivi-${lang}.default.jpg`;
  fallback.search = '';
  const res = await env.ASSETS.fetch(fallback.toString());
  const headers = new Headers(res.headers);
  headers.set('x-luna-og', 'default');
  return new Response(res.body, { status: res.status, headers });
}

async function regenerateOg(request, env) {
  const json = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json(503, { error: 'not_configured', message: 'SUPABASE_URL / SUPABASE_ANON_KEY Worker secrets are missing.' });
  }

  // Caller = a platform admin with the "content" section (same rule as
  // /admin/contenus: admin_has_permission, the SQL twin of useAdminCan).
  const header = request.headers.get('authorization') || '';
  const jwt = header.replace(/^Bearer\s+/i, '').trim();
  if (!jwt || jwt === header) return json(401, { error: 'unauthorized', message: 'Sign in as an admin.' });
  const sb = (path, init = {}) => fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${jwt}`, ...(init.headers || {}) },
  });
  const userRes = await sb('/auth/v1/user');
  if (!userRes.ok) return json(401, { error: 'unauthorized', message: 'Session expired — sign in again.' });
  const user = await userRes.json();
  const permRes = await sb('/rest/v1/rpc/admin_has_permission', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uid: user.id, perm: 'content' }),
  });
  if (!permRes.ok || (await permRes.json()) !== true) {
    return json(403, { error: 'forbidden', message: 'Admin "Contenus" permission required.' });
  }

  if (!env.BROWSER) {
    return json(503, {
      error: 'browser_rendering_unavailable',
      message: 'The Worker has no Browser Rendering binding (wrangler.toml [browser]).',
    });
  }

  const origin = new URL(request.url).origin;
  const images = {};
  let browser;
  try {
    const { default: puppeteer } = await import('@cloudflare/puppeteer');
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    for (const lang of ['fr', 'en']) {
      await page.goto(`${origin}${lang === 'en' ? '/en' : ''}/og/suivi`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('[data-og-ready="true"]', { timeout: 20000 });
      const shot = await page.screenshot({ type: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630 } });
      const up = await sb(`/storage/v1/object/site-images/${ogStorePath(lang)}`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=60' },
        body: shot,
      });
      if (!up.ok) throw new Error(`storage upload (${lang}) failed: ${up.status} ${(await up.text()).slice(0, 200)}`);
      images[lang] = { url: `${origin}/brand/og-suivi-${lang}.jpg`, bytes: shot.byteLength };
    }
  } catch (err) {
    console.error('[worker] og regenerate failed:', err && err.stack ? err.stack : err);
    return json(502, { error: 'render_failed', message: String(err && err.message ? err.message : err) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return json(200, { ok: true, generated_at: new Date().toISOString(), images });
}

// Login-only areas + auth screens (+ the og:image render pages). Mirrors the
// noindex list in public/_headers and the Disallow list in public/robots.txt.
const PRIVATE_PATH = /^\/(?:admin|compte|entreprise|auth|connexion|inscription|mot-de-passe-oublie|og|en\/(?:account|business|login|signup|forgot-password|og))(?:\/|$)/;
function isPrivatePath(pathname) {
  return PRIVATE_PATH.test(pathname);
}

export default {
  async fetch(request, env) {
    try {
      const { pathname } = new URL(request.url);
      if (pathname === OG_REGENERATE) return await regenerateOg(request, env);
      const og = OG_IMAGE.exec(pathname);
      if (og && (request.method === 'GET' || request.method === 'HEAD')) return await serveOgImage(request, env, og[1]);

      const first = await env.ASSETS.fetch(request);
      if (first.status !== 404) return first;

      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return first;

      const share = SHARE_LINK.exec(new URL(request.url).pathname);
      if (share) return await serveShareLink(request, env, share[1]);

      return await serveNeutralShell(request, env);
    } catch (err) {
      console.error('[worker] fetch failed:', err && err.stack ? err.stack : err);
      try {
        const shellUrl = new URL(request.url);
        shellUrl.pathname = '/';
        shellUrl.search = '';
        return await env.ASSETS.fetch(shellUrl.toString());
      } catch (err2) {
        console.error('[worker] final fallback failed:', err2 && err2.stack ? err2.stack : err2);
        return new Response('Service temporarily unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    }
  },
};
