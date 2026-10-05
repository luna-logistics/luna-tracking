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
 * A brand only when the product NAME shows one in all-caps (e.g. "PARKSIDE"),
 * else null — keeps Product.brand off unbranded groceries. Shared so the
 * prerender and the runtime detect it identically.
 */
export function brandFromName(name) {
  const m = typeof name === 'string' ? name.match(/\b[A-Z]{3,}\b/) : null;
  return m ? m[0] : null;
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

/**
 * Service page graph: WebPage + Service + BreadcrumbList (Accueil → page),
 * plus a FAQPage when the caller passes a non-empty `faq` array (same pattern
 * as articleGraph). `faq` items are { q, a } with answers already localized and
 * figure-interpolated by the caller — pass only fully-resolved text.
 * Self-contained — provider/WebSite are inlined, no dangling @id references, so
 * the block validates on a page that carries no Organization node of its own.
 * `serviceName` is the page's H1; `homeUrl` is a registry path (urlFor).
 */
/**
 * About page graph: AboutPage + Organization (carrying its two founders as
 * Person nodes) + BreadcrumbList (Home → About). The Organization reuses the
 * site-wide `@id` (`${SITE_URL}/#org`, declared in full on the homepage), so
 * Google folds the `founder` relationship into the same brand entity instead of
 * creating a second one. Founders come in as plain data — `{ name, role,
 * description }` — already localized by the caller; an empty `role`/`description`
 * is dropped by JSON.stringify. Same two-runtime contract as the other builders:
 * the prerender and the React page emit THIS block, so the crawler's HTML and the
 * hydrated DOM never diverge.
 */
export function aboutGraph({ lang, canonical, title, description, homeUrl, homeLabel, aboutLabel, founders = [] }) {
  const orgId = `${SITE_URL}/#org`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: title,
        description: description || undefined,
        inLanguage: lang,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        about: { '@id': orgId },
        mainEntity: { '@id': orgId },
      },
      {
        '@type': 'Organization',
        '@id': orgId,
        name: SITE_NAME,
        legalName: 'Luna Tracking Logistics SRL',
        url: SITE_URL,
        logo: SITE_LOGO,
        founder: founders.map((f) => ({
          '@type': 'Person',
          name: f.name,
          jobTitle: f.role || undefined,
          description: f.description || undefined,
          worksFor: { '@id': orgId },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: homeLabel, item: `${SITE_URL}${homeUrl}` },
          { '@type': 'ListItem', position: 2, name: aboutLabel, item: canonical },
        ],
      },
    ],
  };
}

export function serviceGraph({ lang, canonical, title, description, homeUrl, homeLabel, serviceName, faq }) {
  const graph = [
    {
      '@type': 'WebPage',
      '@id': `${canonical}#page`,
      url: canonical,
      name: title,
      description: description || undefined,
      inLanguage: lang,
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    },
    {
      '@type': 'Service',
      name: serviceName,
      serviceType: serviceName,
      description: description || undefined,
      provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      areaServed: [
        { '@type': 'Country', name: 'Belgium' },
        { '@type': 'Country', name: 'Democratic Republic of the Congo' },
      ],
      inLanguage: lang,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: `${SITE_URL}${homeUrl}` },
        { '@type': 'ListItem', position: 2, name: serviceName, item: canonical },
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
