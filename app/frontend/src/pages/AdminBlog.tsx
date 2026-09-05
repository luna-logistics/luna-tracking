import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Eye, EyeOff, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { fetchAllPosts, setPostPublished, deletePost, type BlogPost } from '@/lib/blog';
import { urlFor } from '@/lib/url/routes';
import { cn } from '@/lib/utils';

export default function AdminBlog() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setPosts(await fetchAllPosts());
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const togglePublish = async (p: BlogPost) => {
    setPendingId(p.id);
    try { await setPostPublished(p.id, !p.published); await reload(); }
    catch (err) { toast.error(t('common.error_generic')); console.error(err); }
    finally { setPendingId(null); }
  };

  const remove = async (p: BlogPost) => {
    if (!confirm(t('admin_blog.delete_confirm'))) return;
    try { await deletePost(p.id); await reload(); }
    catch (err) { toast.error(t('common.error_generic')); console.error(err); }
  };

  return (
    <>
      <SEO title={t('admin_blog.title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy">{t('admin_blog.title')}</h1>
          <p className="mt-2 text-slate-600">{t('admin_blog.intro')}</p>
        </div>
        <Button asChild variant="navy">
          <Link to="/admin/blog/nouveau">
            <Plus className="h-4 w-4" />
            {t('admin_blog.new')}
          </Link>
        </Button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_blog.col_title')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_blog.col_slug')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_blog.col_status')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_blog.col_updated')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin_blog.col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>
            )}
            {!loading && posts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('admin_blog.empty')}</td></tr>
            )}
            {posts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-luna-navy">{p.title_fr}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.slug}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                    p.published ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  )}>
                    {p.published ? t('admin_blog.status_published') : t('admin_blog.status_draft')}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                  {new Date(p.updated_at).toLocaleDateString('fr-BE')}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  {p.published && (
                    <a
                      href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-luna-blue hover:underline px-2 py-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t('admin_blog.view')}
                    </a>
                  )}
                  <Button size="sm" variant="outline" disabled={pendingId === p.id} onClick={() => togglePublish(p)}>
                    {p.published ? <><EyeOff className="h-3.5 w-3.5" />{t('admin_blog.unpublish')}</> : <><Eye className="h-3.5 w-3.5" />{t('admin_blog.publish')}</>}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/blog/${p.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('admin_blog.edit')}
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
