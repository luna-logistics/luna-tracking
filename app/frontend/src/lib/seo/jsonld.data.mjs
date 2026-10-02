/**
 * Shared Schema.org JSON-LD builders — the single source of truth for the
 * structured data of the pages that have BOTH a build-time prerender and a
 * runtime React emitter (blog posts, products, custom pages), plus the Service
 * graph for the four service pages.
 *
 * Imported by `scripts/prerender-metas.mjs` (Node, build time) AND by the React
 * pages (browser, runtime), exactly like `routes.data.mjs`. One builder, two
 * runtimes → the JSON-LD a crawler reads in the prerendered HTML and the JSON-LD
 * the SPA keeps after hydration can never diverge.
 *
 * Pure data in, plain objects out. No Node, DOM, React or i18n APIs here — each
 * caller resolves its own localized labels and figures and passes them in.
 * `undefined` fields are dropped by JSON.stringify, so an omitted optional arg
 * simply disappears from the output.
 */

export const SITE_URL = 'https://lunatrackinglogistics.com';
export const SITE_NAME = 'Luna Tracking Logistics';
export const SITE_LOGO = `${SITE_URL}/brand/logo-luna-navbar2.png`;

/**
 * Article + BreadcrumbList (+ FAQPage when the post carries a FAQ), for a blog
 * post. `homeUrl` / `blogUrl` are registry paths (urlFor), labels are localized
 * by the caller.
 */
export function articleGraph({
  canonical, lang, title, description, image,
  datePublished, dateModified,
  homeUrl, homeLabel, blogUrl, blogLabel,
  faq,
}) {
  const graph = [
    {
      '@type': 'Article',
      headline: title,
      description: description || undefined,
      image: image ? [image] : undefined,
      datePublished,
      dateModified,
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        logo: { '@type': 'ImageObject', url: SITE_LOGO },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      inLanguage: lang,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: `${SITE_URL}${homeUrl}` },
        { '@type': 'ListItem', position: 2, name: blogLabel, item: `${SITE_URL}${blogUrl}` },
        { '@type': 'ListItem', position: 3, name: title, item: canonical },
      ],
    },
  ];
  if (Array.isArray(faq) && faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** WebPage for an admin-authored custom page. */
export function customPageGraph({ canonical, lang, title, description, image, datePublished, dateModified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: description || undefined,
    url: canonical,
    inLanguage: lang,
    datePublished: datePublished || undefined,
    dateModified: dateModified || undefined,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    image: image || undefined,
  };
}

/**
 * Product. `offers` is emitted only when a price is given (quote-only items
 * omit it); `image` / `brand` / `sku` / `gtin` / `category` / `weightKg` are all
 * optional. `price` is a number in euros; `inStock` toggles availability.
 */
export function productSchema({
  canonical, lang, name, description,
  sku, gtin, brand, category, weightKg, price, inStock, image,
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: description || undefined,
    sku: sku || undefined,
    gtin13: gtin || undefined,
    brand: brand ? { '@type': 'Brand', name: brand } : undefined,
    category: category || undefined,
    image: image || undefined,
    inLanguage: lang,
    weight: weightKg != null
      ? { '@type': 'QuantitativeValue', value: weightKg, unitCode: 'KGM' }
      : undefined,
    offers: price != null
      ? {
          '@type': 'Offer',
          price: Number(price).toFixed(2),
          priceCurrency: 'EUR',
          availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: canonical,
        }
      : undefined,
  };
}
