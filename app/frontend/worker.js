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
    try {
      const first = await env.ASSETS.fetch(request);
      if (first.status !== 404) return first;

      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') return first;

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
