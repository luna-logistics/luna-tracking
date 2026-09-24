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

// Login-only areas + auth screens. Mirrors the noindex list in
// public/_headers and the Disallow list in public/robots.txt.
const PRIVATE_PATH = /^\/(?:admin|compte|entreprise|auth|connexion|inscription|mot-de-passe-oublie|en\/(?:account|business|login|signup|forgot-password))(?:\/|$)/;
function isPrivatePath(pathname) {
  return PRIVATE_PATH.test(pathname);
}

export default {
  async fetch(request, env) {
    try {
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
