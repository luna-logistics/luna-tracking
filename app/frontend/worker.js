/**
 * Luna Tracking — asset server + SPA-fallback canonical guard.
 *
 * Serves every prerendered file straight from the [assets] binding
 * (dist/<url>/index.html with a fully-formed <head>). When Cloudflare
 * returns 404 — an unmatched path that would otherwise SPA-fallback to
 * `dist/index.html` — we serve that same shell BUT strip the FR
 * homepage's canonical, description and OG/Twitter tags on the fly.
 *
 * Without this, any URL not covered by the prerender (a stale dynamic
 * slug, a bad /en/* link, a crawler probing a made-up path) inherited
 * `<link rel="canonical" href="https://lunatrackinglogistics.com/">`
 * from the homepage HTML — exactly the leak that de-indexed a sister
 * site last summer.
 *
 * wrangler.toml sets `not_found_handling = "none"` so ASSETS.fetch
 * returns a genuine 404 for missing paths — this worker is the SPA
 * fallback instead.
 */

class StripElement {
  element(element) { element.remove(); }
}

class ReplaceTitle {
  constructor(text) { this.text = text; }
  element(element) { element.setInnerContent(this.text); }
}

async function serveNeutralShell(request, env) {
  // Pull the root shell (which the prerender writes as the FR homepage,
  // full metas included) then strip the tags that would otherwise leak
  // homepage-specific SEO onto every unknown URL.
  const shellRequest = new Request(new URL('/', request.url), { method: 'GET' });
  const shellResponse = await env.ASSETS.fetch(shellRequest);
  const stripped = new HTMLRewriter()
    .on('link[rel="canonical"]',   new StripElement())
    .on('link[rel="alternate"][hreflang]', new StripElement())
    .on('meta[name="description"]', new StripElement())
    .on('meta[property^="og:"]',   new StripElement())
    .on('meta[name^="twitter:"]',  new StripElement())
    .on('script[type="application/ld+json"]', new StripElement())
    .on('title', new ReplaceTitle('Luna Tracking Logistics'))
    .transform(shellResponse);

  // Force 200 so React Router can render whatever page (or its own
  // NotFound) the client-side app decides — the shell has no way of
  // knowing whether the URL is truly unknown or just dynamic content
  // that wasn't included in the last prerender pass.
  return new Response(stripped.body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-luna-fallback': 'neutral-shell',
    },
  });
}

export default {
  async fetch(request, env) {
    // First try the assets binding — this covers every prerendered
    // file AND every static resource (JS/CSS/images/favicons/sitemap).
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    // Only fall back for GET / HEAD requests on non-asset URLs — other
    // methods on a missing path should still 404.
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return assetResponse;

    return serveNeutralShell(request, env);
  },
};
