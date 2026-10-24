import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { errorMessage } from '@/lib/errors';
import { updateProductFields, type Product } from '@/lib/products';
import { translateText } from '@/lib/translate';
import {
  fetchSourceDescriptions, findMissingDescriptions, missingLangs, planDescription,
  type DescriptionScope, type SourceDescription,
} from '@/lib/missing-descriptions';

const PER_CALL = 10;    // products per Edge Function call
const PER_RUN = 50;     // products per click (DeepL quota, store politeness)
const SHOWN = 100;      // rows listed

type Tally = Record<SourceDescription['status'], number>;
const EMPTY_TALLY: Tally = { found: 0, no_source: 0, not_found: 0, blocked: 0, error: 0 };

/**
 * Admin → Produits: find the products without a description (FR and/or EN)
 * and fetch it from the store page each one was imported from. Only empty
 * fields are written; the missing language is translated with DeepL.
 */
export function MissingDescriptionsPanel({ products, onChanged }: { products: Product[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<DescriptionScope>('any');
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const [translateOther, setTranslateOther] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [tally, setTally] = useState<Tally | null>(null);

  const counts = useMemo(() => {
    let fr = 0, en = 0, any = 0;
    for (const p of products) { const m = missingLangs(p); if (m.fr) fr++; if (m.en) en++; if (m.fr || m.en) any++; }
    return { fr, en, any };
  }, [products]);
  const found = useMemo(() => findMissingDescriptions(products, scope, query), [products, scope, query]);

  const run = async () => {
    const batch = found.slice(0, PER_RUN);
    if (!batch.length) return;
    setBusy(true); setTally(null); setProgress({ done: 0, total: batch.length });
    const sum: Tally = { ...EMPTY_TALLY };
    try {
      for (let i = 0; i < batch.length; i += PER_CALL) {
        const chunk = batch.slice(i, i + PER_CALL);
        const results = await fetchSourceDescriptions(chunk.map((p) => p.id));
        for (const r of results) {
          const p = chunk.find((x) => x.id === r.id);
          if (r.status !== 'found' || !p || !r.description) { sum[r.status]++; continue; }
          const plan = planDescription(p, r.description, r.lang, translateOther);
          const patch = { ...plan.patch };
          for (const { field, target } of plan.translate) {
            const { translation } = await translateText(r.description, target, plan.source);
            if (translation?.trim()) patch[field] = translation.trim();
          }
          if (Object.keys(patch).length) { await updateProductFields(p.id, patch); sum.found++; }
          else sum.not_found++;
        }
        setProgress({ done: Math.min(i + PER_CALL, batch.length), total: batch.length });
      }
    } catch (err) {
      const msg = errorMessage(err, t('common.error_generic'));
      toast.error(/failed to send|not found|404|functionshttp|fetch/i.test(msg) ? t('admin.desc_function_unreachable') : msg);
    } finally {
      setBusy(false);
      setTally(sum);
      if (sum.found) onChanged();
    }
  };

  return (
    <li className="space-y-3 border-t border-slate-100 pt-3">
      <div>
        <p className="text-sm font-semibold text-luna-navy">{t('admin.desc_title')}</p>
        <p className="text-xs text-slate-500">{t('admin.desc_summary', { count: counts.any, fr: counts.fr, en: counts.en })}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="text-xs">
          {t('admin.desc_scope_label')}
          <select className="mt-1 block h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" value={scope}
            onChange={(e) => setScope(e.target.value as DescriptionScope)}>
            {(['any', 'fr', 'en', 'both'] as DescriptionScope[]).map((k) => <option key={k} value={k}>{t(`admin.desc_scope_${k}`)}</option>)}
          </select>
        </label>
        <label className="text-xs">
          {t('admin.desc_search_label')}
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('admin.desc_search_placeholder')} className="mt-1 h-9 w-64" />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
          <Search className="mr-1.5 h-4 w-4" />
          {showList ? t('admin.desc_hide_list') : t('admin.desc_show_list', { count: found.length })}
        </Button>
      </div>

      {showList && (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {found.length === 0 && <tr><td className="px-3 py-3 text-slate-500">{t('admin.desc_list_empty')}</td></tr>}
              {found.slice(0, SHOWN).map((p) => {
                const m = missingLangs(p);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-1.5 text-slate-700">{p.name_fr}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      {m.fr && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">{t('admin.desc_missing_fr')}</span>}
                      {m.en && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">{t('admin.desc_missing_en')}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {found.length > SHOWN && <p className="px-3 py-2 text-xs text-slate-500">{t('admin.desc_list_more', { count: found.length - SHOWN })}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="navy" disabled={busy || found.length === 0} onClick={run}>
          {busy ? `${progress.done} / ${progress.total}` : t('admin.desc_fetch', { count: Math.min(found.length, PER_RUN) })}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={translateOther} onChange={(e) => setTranslateOther(e.target.checked)} />
          {t('admin.desc_translate_other')}
        </label>
      </div>
      <p className="text-xs text-slate-500">{t('admin.desc_fetch_hint', { max: PER_RUN })}</p>
      {tally && (
        <p role="status" className="text-xs text-slate-700">{t('admin.desc_result', tally)}</p>
      )}
    </li>
  );
}
