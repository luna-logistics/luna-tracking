import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Eye, EyeOff, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { fetchAllPages, setPagePublished, deletePage, type CustomPage } from '@/lib/custom-pages';
import { cn } from '@/lib/utils';

export default function AdminCustomPages() {
  const { t } = useTranslation();
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setPages(await fetchAllPages());
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const togglePublish = async (p: CustomPage) => {
    setPendingId(p.id);
    try { await setPagePublished(p.id, !p.published); await reload(); }
    catch (err) { toast.error(t('common.error_generic')); console.error(err); }
    finally { setPendingId(null); }
  };

  const remove = async (p: CustomPage) => {
    if (!confirm(t('admin_pages.delete_confirm'))) return;
    try { await deletePage(p.id); await reload(); }
    catch (err) { toast.error(t('common.error_generic')); console.error(err); }
  };

  return (
    <>
      <SEO title={t('admin_pages.title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy">{t('admin_pages.title')}</h1>
          <p className="mt-2 text-slate-600 max-w-3xl">{t('admin_pages.intro')}</p>
        </div>
        <Button asChild variant="navy">
          <Link to="/admin/pages/nouvelle">
            <Plus className="h-4 w-4" />
            {t('admin_pages.new')}
          </Link>
        </Button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_pages.col_title')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_pages.col_slug_fr')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_pages.col_slug_en')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_pages.col_status')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_pages.col_updated')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin_pages.col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>
            )}
            {!loading && pages.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('admin_pages.empty')}</td></tr>
            )}
            {pages.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-luna-navy">{p.title_fr}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">/{p.slug_fr}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">/en/{p.slug_en}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                    p.published ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                  )}>
                    {p.published ? t('admin_pages.status_published') : t('admin_pages.status_draft')}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                  {new Date(p.updated_at).toLocaleDateString('fr-BE')}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                  {p.published && (
                    <a href={`/${p.slug_fr}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-luna-blue hover:underline px-2 py-1">
                      <ExternalLink className="h-3 w-3" />
                      {t('admin_pages.view')}
                    </a>
                  )}
                  <Button size="sm" variant="outline" disabled={pendingId === p.id} onClick={() => togglePublish(p)}>
                    {p.published ? <><EyeOff className="h-3.5 w-3.5" />{t('admin_pages.unpublish')}</> : <><Eye className="h-3.5 w-3.5" />{t('admin_pages.publish')}</>}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/admin/pages/${p.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('admin_pages.edit')}
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
