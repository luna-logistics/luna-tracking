import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Files, Search, ArrowRight, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import { signedUrl, formatBytes, DOCUMENT_KINDS, type DocumentKind } from '@/lib/shipment-documents';
import { errorMessage } from '@/lib/errors';

/**
 * Read-only aggregation of every shipment_document across every
 * shipment of the current business. Upload/edit happens on the
 * shipment detail's Documents tab.
 */

type Row = {
  id: string;
  shipment_id: string;
  filename: string;
  mime_type: string | null;
  byte_size: number | null;
  kind: DocumentKind;
  label: string | null;
  storage_path: string;
  uploaded_at: string;
  shipments: { reference: string; status: string } | null;
};

export default function BusinessDocuments() {
  const { t, i18n } = useTranslation();
  const { current } = useBusiness();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | DocumentKind>('all');
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('shipment_documents')
        .select(`
          id, shipment_id, filename, mime_type, byte_size, kind, label,
          storage_path, uploaded_at,
          shipments!inner ( reference, status )
        `)
        .eq('business_id', current.id)
        .order('uploaded_at', { ascending: false })
        .limit(500);
      if (error) { console.warn('[docs] fetch:', error.message); setRows([]); }
      else setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (!query) return true;
      return [
        r.filename, r.label, r.shipments?.reference,
      ].some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, kind]);

  const open = async (path: string) => {
    try {
      const url = await signedUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    }
  };

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_documents.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Files className="h-6 w-6" />
            {t('business_documents.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_documents.intro')}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_documents.search_placeholder')} className="pl-8" />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as 'all' | DocumentKind)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_documents.kind_all')}</SelectItem>
            {DOCUMENT_KINDS.map((k) => (
              <SelectItem key={k} value={k}>{t(`document_kind.${k}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_documents.col_file')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_documents.col_kind')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_documents.col_shipment')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_documents.col_size')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_documents.col_uploaded')}</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('business_documents.empty')}</td></tr>
            )}
            {filtered.map((r) => {
              const Icon = r.mime_type?.startsWith('image/') ? ImageIcon : FileText;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => open(r.storage_path)}
                      className="inline-flex items-center gap-2 text-luna-navy hover:text-luna-blue font-medium">
                      <Icon className="h-4 w-4 text-slate-500" />
                      <span className="truncate max-w-[280px]" title={r.filename}>{r.filename}</span>
                    </button>
                    {r.label && <p className="text-xs text-slate-500 mt-0.5 italic">{r.label}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-luna-blue/10 text-luna-blue px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {t(`document_kind.${r.kind}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/entreprise/expeditions/${r.shipment_id}`}
                      className="font-mono text-xs text-luna-navy hover:text-luna-blue inline-flex items-center gap-1">
                      {r.shipments?.reference ?? '—'}
                      <ArrowRight className="h-3 w-3 opacity-50" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                    {formatBytes(r.byte_size)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                    {new Date(r.uploaded_at).toLocaleDateString(lang)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => open(r.storage_path)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
