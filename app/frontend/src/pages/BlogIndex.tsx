import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { fetchPublishedPosts, postTitle, postExcerpt, postImageAlt, postSlug, type BlogPost } from '@/lib/blog';
import { urlFor } from '@/lib/url/routes';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';

export default function BlogIndex() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const metaTitle       = useContent('blog', 'meta_title',       t('blog.meta_title'));
  const metaDescription = useContent('blog', 'meta_description', t('blog.meta_description'));
  const pageTitle       = useContent('blog', 'page_title',       t('blog.page_title'));
  const pageIntro       = useContent('blog', 'page_intro',       t('blog.page_intro'));
  const emptyText       = useContent('blog', 'empty',            t('blog.empty'));
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublishedPosts().then((p) => { setPosts(p); setLoading(false); });
  }, []);

  const dateFormat = lang === 'en' ? 'en-GB' : 'fr-BE';

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <section className="bg-luna-gradient text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <Ed page="blog" field="page_title" as="h1" className="text-3xl sm:text-4xl font-bold block">
            {pageTitle}
          </Ed>
          <Ed page="blog" field="page_intro" as="div" multiline markdown className="mt-3 text-white/90 max-w-2xl block">
            {pageIntro}
          </Ed>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {loading ? (
            <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>
          ) : posts.length === 0 ? (
            <Ed page="blog" field="empty" as="div" multiline className="py-16 text-center text-slate-500 rounded-2xl border-2 border-dashed border-slate-300 bg-white block">
              {emptyText}
            </Ed>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => {
                const url = `${urlFor('blogIndex', lang)}/${postSlug(p, lang)}`;
                return (
                  <Link
                    key={p.id}
                    to={url}
                    className="group rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-luna-blue/40 transition-shadow"
                  >
                    {p.featured_image ? (
                      <div className="aspect-video overflow-hidden bg-luna-navy/5">
                        <img
                          src={p.featured_image}
                          alt={postImageAlt(p, lang)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-luna-gradient-soft" aria-hidden="true" />
                    )}
                    <div className="p-5">
                      {p.published_at && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(p.published_at).toLocaleDateString(dateFormat)}
                        </div>
                      )}
                      <h2 className="mt-2 text-lg font-semibold text-luna-navy line-clamp-2">
                        {postTitle(p, lang)}
                      </h2>
                      {postExcerpt(p, lang) && (
                        <p className="mt-2 text-sm text-slate-600 line-clamp-3">
                          {postExcerpt(p, lang)}
                        </p>
                      )}
                      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-luna-blue">
                        {t('blog.read_more')}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
