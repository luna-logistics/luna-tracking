/**
 * Pagination helpers for listing/category discovery. Supports page=/p=/offset=
 * query styles and rel="next" links, with a hard page cap and repeat-detection
 * (stop when a page yields no new product URLs — guards against sites that
 * return the same content for any page number / infinite scroll loops).
 */

/** Find a rel="next" link href in HTML. */
export function relNext(html) {
  const tag = html.match(/<link[^>]*rel=["']next["'][^>]*>/i)?.[0]
    || html.match(/<a[^>]*rel=["']next["'][^>]*>/i)?.[0];
  return tag ? (tag.match(/href=["']([^"']+)["']/i)?.[1] || null) : null;
}

/** Build the URL for page N given a base URL and a param style. */
export function pageUrl(baseUrl, n, style = 'page', pageSize = 24) {
  try {
    const u = new URL(baseUrl);
    if (style === 'offset') u.searchParams.set('offset', String((n - 1) * pageSize));
    else u.searchParams.set(style, String(n));
    return u.toString();
  } catch { return null; }
}

/**
 * Generic paginator driver. `fetchPage(n)` must return an array of product
 * URLs found on page n (or []). Stops on: empty page, no-new-URLs, or maxPages.
 * @returns {Promise<{ urls:string[], pages:number, stoppedBy:string }>}
 */
export async function paginate(fetchPage, { maxPages = 50 } = {}) {
  const seen = new Set();
  let pages = 0;
  let emptyStreak = 0;
  for (let n = 1; n <= maxPages; n++) {
    const found = await fetchPage(n);
    pages = n;
    const fresh = found.filter((u) => !seen.has(u));
    fresh.forEach((u) => seen.add(u));
    if (found.length === 0) return { urls: [...seen], pages, stoppedBy: 'empty-page' };
    if (fresh.length === 0) {
      emptyStreak++;
      if (emptyStreak >= 2) return { urls: [...seen], pages, stoppedBy: 'no-new-urls' };
    } else emptyStreak = 0;
  }
  return { urls: [...seen], pages, stoppedBy: 'max-pages' };
}
