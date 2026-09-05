import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import Markdown from 'markdown-to-jsx';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import {
  fetchPostBySlug,
  postTitle, postExcerpt, postContent, postMetaTitle, postMetaDescription, postImageAlt,
  type BlogPost,
} from '@/lib/blog';
import { urlFor } from '@/lib/url/routes';

const SITE_URL = 'https://lunatrackinglogistics.com';

export default function BlogPostPage() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchPostBySlug(slug).then((p) => { setPost(p); setLoading(false); });
  }, [slug]);

  if (loading) {
    return <div className="py-24 text-center text-slate-500">{t('common.loading')}</div>;
  }
  if (!post) {
    return (
      <>
        <SEO title={t('blog.not_found_title')} noindex />
        <section className="py-16">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h1 className="text-2xl font-bold text-luna-navy">{t('blog.not_found_title')}</h1>
            <p className="mt-3 text-slate-600">{t('blog.not_found_body')}</p>
            <Button asChild variant="navy" className="mt-6">
              <Link to={urlFor('blogIndex', lang)}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('blog.back_to_list')}
              </Link>
            </Button>
          </div>
        </section>
      </>
    );
  }

  const title = postTitle(post, lang);
  const body  = postContent(post, lang);
  const canonical = `${SITE_URL}${lang === 'en' ? '/en' : ''}${urlFor('blogIndex', lang) === '/' ? '' : ''}/blog/${post.slug}`;

  // JSON-LD Article for rich results. datePublished / dateModified from
  // published_at + updated_at. Uses the CURRENT locale's title / description
  // so the /en variant reads English metadata.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: postMetaDescription(post, lang) ?? postExcerpt(post, lang) ?? undefined,
    image: post.featured_image ? [post.featured_image] : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: { '@type': 'Organization', name: 'Luna Tracking Logistics' },
    publisher: {
      '@type': 'Organization',
      name: 'Luna Tracking Logistics',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/logo-luna-navbar2.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: lang,
  };

  return (
    <>
      <SEO
        title={postMetaTitle(post, lang)}
        description={postMetaDescription(post, lang) ?? postExcerpt(post, lang) ?? undefined}
        type="article"
        image={post.featured_image ?? undefined}
        imageAlt={postImageAlt(post, lang)}
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <article className="py-10 sm:py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Link to={urlFor('blogIndex', lang)} className="inline-flex items-center gap-1 text-sm text-luna-blue hover:underline">
            <ArrowLeft className="h-4 w-4" /> {t('blog.back_to_list')}
          </Link>

          {post.published_at && (
            <div className="mt-6 flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Date(post.published_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-BE')}
            </div>
          )}
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-luna-navy leading-tight">{title}</h1>
          {postExcerpt(post, lang) && (
            <p className="mt-3 text-lg text-slate-600 leading-relaxed">{postExcerpt(post, lang)}</p>
          )}

          {post.featured_image && (
            <img
              src={post.featured_image}
              alt={postImageAlt(post, lang)}
              className="mt-8 w-full rounded-2xl aspect-video object-cover"
            />
          )}

          <div className="prose prose-slate max-w-none mt-8 prose-headings:text-luna-navy prose-a:text-luna-blue">
            <Markdown options={{ forceBlock: true }}>{body}</Markdown>
          </div>
        </div>
      </article>
    </>
  );
}
