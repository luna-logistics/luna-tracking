import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import {
  fetchPageBySlug, pageTitle, pageContent, pageMetaTitle, pageMetaDescription, pageImageAlt,
  type CustomPage as CustomPageT,
} from '@/lib/custom-pages';
import { urlFor } from '@/lib/url/routes';
import { sanitizeBlogHtml } from '@/lib/rich-content';
import { useLangUrls } from '@/contexts/LangUrlContext';

const SITE_URL = 'https://lunatrackinglogistics.com';

/**
 * Public renderer for an admin-created page.
 *
 * Route: `/:slug` (FR) and `/en/:slug` (EN). React Router v6 ranks static
 * routes over `:param` routes, so `/suivi`, `/tarifs`, `/blog`, ... still
 * win — this component only fires for slugs that no fixed route claims,
 * and it 404s honestly when the slug isn't in `custom_pages` (published).
 *
 * Never serves stale content: on a slug that resolves to a draft or a
 * missing row, we render a real noindex 404 rather than falling back to
 * the homepage (the very leak that de-indexed the site last summer —
 * see reference_sitemap_and_canonical_health.md in the memory).
 */
export default function CustomPage() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CustomPageT | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLangUrls } = useLangUrls();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchPageBySlug(lang, slug).then((p) => {
      // Draft rows would already be filtered out by RLS for non-admins; for
      // admins previewing a draft, respect the published flag for the SEO
      // shape (still render body, but noindex + no JSON-LD).
      setPage(p);
      setLoading(false);
    });
  }, [slug, lang]);

  useEffect(() => {
    if (!page) { setLangUrls(null); return; }
    setLangUrls({
      fr: `/${page.slug_fr}`,
      en: `/en/${page.slug_en}`,
    });
    return () => setLangUrls(null);
  }, [page, setLangUrls]);

  if (loading) {
    return <div className="py-24 text-center text-slate-500">{t('common.loading')}</div>;
  }
  if (!page) {
    return (
      <>
        <SEO title={t('custom_page.not_found_title')} noindex />
        <section className="py-16">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h1 className="text-2xl font-bold text-luna-navy">{t('custom_page.not_found_title')}</h1>
            <p className="mt-3 text-slate-600">{t('custom_page.not_found_body')}</p>
            <Button asChild variant="navy" className="mt-6">
              <Link to={urlFor('home', lang)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('custom_page.back_home')}
              </Link>
            </Button>
          </div>
        </section>
      </>
    );
  }

  const isPublished = page.published === true;
  const title = pageTitle(page, lang);
  const body  = pageContent(page, lang);
  const langSlug = lang === 'en' ? page.slug_en : page.slug_fr;
  const canonical = `${SITE_URL}${lang === 'en' ? `/en/${langSlug}` : `/${langSlug}`}`;

  const jsonLd = isPublished ? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: pageMetaDescription(page, lang) ?? undefined,
    url: canonical,
    inLanguage: lang,
    datePublished: page.published_at,
    dateModified: page.updated_at,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Luna Tracking Logistics',
      url: SITE_URL,
    },
    image: page.og_image ?? undefined,
  } : null;

  const altSlug = lang === 'en' ? page.slug_fr : page.slug_en;
  const altHref = lang === 'en' ? `${SITE_URL}/${altSlug}` : `${SITE_URL}/en/${altSlug}`;

  return (
    <>
      <SEO
        title={pageMetaTitle(page, lang)}
        description={pageMetaDescription(page, lang) ?? undefined}
        canonical={canonical}
        image={page.og_image ?? undefined}
        imageAlt={pageImageAlt(page, lang)}
        noindex={!isPublished}
      />
      <Helmet>
        {isPublished && <link rel="alternate" hrefLang={lang === 'en' ? 'fr' : 'en'} href={altHref} />}
        {isPublished && <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/${page.slug_fr}`} />}
        {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
      </Helmet>

      <article className="py-10 sm:py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-luna-navy leading-tight">{title}</h1>

          {page.og_image && (
            <img
              src={page.og_image}
              alt={pageImageAlt(page, lang)}
              className="mt-6 w-full rounded-2xl aspect-video object-cover"
            />
          )}

          <div
            className="prose prose-slate max-w-none mt-6 prose-headings:text-luna-navy prose-a:text-luna-blue"
            dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(body) }}
          />
        </div>
      </article>
    </>
  );
}
