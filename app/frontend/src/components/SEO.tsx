import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

const SITE_URL = 'https://lunatrackinglogistics.com';

type SEOProps = {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  imageAlt?: string;
  ogTitle?: string;
  ogDescription?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
};

/**
 * Per-page SEO block. Emits title, meta description, self-canonical, OG +
 * Twitter Card. Also keeps <html lang> in sync with the active language for
 * screen readers and crawlers — Helmet sets it on load but doesn't reliably
 * update on SPA language flips, so we also write it via a direct effect.
 *
 * Default canonical = clean path (no query/hash), NEVER the full dirty URL, so
 * a page that forgets an explicit canonical can never spawn duplicates.
 *
 * `noindex` is applied via a direct DOM effect rather than a Helmet child —
 * Helmet 3 silently drops conditional <meta> children in some configurations,
 * and robots noindex MUST be in the initial DOM for crawlers to see it.
 */
export function SEO({
  title,
  description,
  canonical,
  image,
  imageAlt,
  ogTitle,
  ogDescription,
  type = 'website',
  noindex = false,
}: SEOProps) {
  const { i18n } = useTranslation();
  const htmlLang = i18n.language === 'en' ? 'en' : 'fr';

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = htmlLang;
  }, [htmlLang]);

  const url =
    canonical ??
    (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : SITE_URL);

  const ogImage = image ?? `${SITE_URL}/brand/og-default.jpg`;
  const resolvedOgTitle = ogTitle || title;
  const resolvedOgDescription = ogDescription || description;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.head.querySelectorAll('meta[name="robots"][data-seo-managed]').forEach((el) => el.remove());
    if (!noindex) return;
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'robots');
    meta.setAttribute('content', 'noindex,nofollow');
    meta.setAttribute('data-seo-managed', 'true');
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, [noindex]);

  return (
    <Helmet>
      <html lang={htmlLang} />
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <link rel="canonical" href={url} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={resolvedOgTitle} />
      {resolvedOgDescription ? <meta property="og:description" content={resolvedOgDescription} /> : null}
      <meta property="og:image" content={ogImage} />
      {imageAlt ? <meta property="og:image:alt" content={imageAlt} /> : null}
      <meta property="og:locale" content={htmlLang === 'en' ? 'en_US' : 'fr_BE'} />
      <meta property="og:site_name" content="Luna Tracking Logistics" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedOgTitle} />
      {resolvedOgDescription ? <meta name="twitter:description" content={resolvedOgDescription} /> : null}
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
