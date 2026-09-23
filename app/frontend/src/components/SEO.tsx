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

  const ogImage = image ?? `${SITE_URL}/brand/og-default${htmlLang === 'en' ? '-en' : ''}.jpg`;
  const resolvedOgTitle = ogTitle || title;
  const resolvedOgDescription = ogDescription || description;

  // Helmet 3 on React 18 writes the head on first render but does NOT update
  // it on client-side navigation (verified live 2026-09-23: after /tarifs →
  // /suivi the tab title, description, canonical and og:url all stayed on
  // /tarifs, and GA4 page_views carried the wrong title). Mirror the
  // per-page values onto the EXISTING tags directly — update only, never
  // create, so nothing can duplicate what Helmet or the prerender emitted.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = title;
    const set = (selector: string, attr: 'content' | 'href', value: string | undefined) => {
      if (value == null) return;
      document.head.querySelectorAll(selector).forEach((el) => el.setAttribute(attr, value));
    };
    set('link[rel="canonical"]', 'href', url);
    set('meta[name="description"]', 'content', description);
    set('meta[property="og:url"]', 'content', url);
    set('meta[property="og:title"]', 'content', resolvedOgTitle);
    set('meta[property="og:description"]', 'content', resolvedOgDescription);
    set('meta[property="og:image"]', 'content', ogImage);
    set('meta[name="twitter:title"]', 'content', resolvedOgTitle);
    set('meta[name="twitter:description"]', 'content', resolvedOgDescription);
    set('meta[name="twitter:image"]', 'content', ogImage);
  }, [title, url, description, resolvedOgTitle, resolvedOgDescription, ogImage]);

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
