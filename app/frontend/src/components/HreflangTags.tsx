import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { matchUrl, urlFor, ROUTES, SUPPORTED_LANGS } from '@/lib/url/routes';

const BASE_URL = 'https://lunatrackinglogistics.com';

/**
 * Emits hreflang <link> tags for every language variant of the current page,
 * plus an x-default that points to French (Luna's primary market — Belgium).
 *
 * Registry-driven: asks matchUrl() what route we are on, then loops through
 * SUPPORTED_LANGS asking the same registry for each language's path. A route
 * that exists only in FR (admin, dynamic detail pages later) still gets an
 * x-default → FR, and no EN alternate is emitted.
 *
 * A non-registered path emits NOTHING — that's intended. Fallback SPA routes
 * would otherwise inherit whatever hreflang the home HTML shipped with.
 */
export function HreflangTags() {
  const location = useLocation();
  const match = matchUrl(location.pathname);
  if (!match) return null;

  const def = ROUTES[match.key];

  return (
    <Helmet>
      {SUPPORTED_LANGS.map((lang) => {
        if (lang === 'en' && !def.bilingual) return null;
        return <link key={lang} rel="alternate" hrefLang={lang} href={`${BASE_URL}${urlFor(match.key, lang)}`} />;
      })}
      <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}${urlFor(match.key, 'fr')}`} />
    </Helmet>
  );
}
