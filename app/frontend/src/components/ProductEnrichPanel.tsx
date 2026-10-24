import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { bulkUpdateProducts, updateProductFields, type Product, type ProductCategory } from '@/lib/products';
import { parseWeightKg } from '@/lib/product-enrich';
import { suggestHsCode } from '@/lib/hs-classifier';
import { isGenericDescription } from '@/lib/import-profile';
import { translateText } from '@/lib/translate';
import { MissingDescriptionsPanel } from '@/components/MissingDescriptionsPanel';

const BATCH = 40;      // names per translation call
const PARALLEL = 6;    // concurrent row updates

async function inPool<T>(items: T[], worker: (item: T) => Promise<void>, onDone: () => void) {
  let i = 0;
  const run = async () => { while (i < items.length) { const item = items[i++]; await worker(item); onDone(); } };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, run));
}

/**
 * Admin helper: fills, for every product at once, what can be derived from
 * data already there — English names (DeepL), net weight read from the name,
 * HS customs codes (only confident suggestions), removal of the store's
 * generic description blurb, and missing descriptions read on the store page
 * (MissingDescriptionsPanel). Each action only touches empty / untranslated
 * fields, never something an admin typed.
 */
export function ProductEnrichPanel({ products, categories, onChanged }: { products: Product[]; categories: ProductCategory[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name_fr])), [categories]);
  const untranslated = useMemo(() => products.filter((p) => p.name_en.trim() === p.name_fr.trim()), [products]);
  const weights = useMemo(() => products
    .filter((p) => p.weight_kg == null)
    .map((p) => ({ p, kg: parseWeightKg(p.name_fr) }))
    .filter((x): x is { p: Product; kg: number } => x.kg != null), [products]);
  const hs = useMemo(() => products
    .filter((p) => !p.hs_code?.trim())
    .map((p) => ({ p, s: suggestHsCode(p.name_fr, catName.get(p.category_id)) }))
    .filter((x) => x.s && x.s.confidence !== 'low')
    .map((x) => ({ p: x.p, code: x.s!.code })), [products, catName]);
  const generic = useMemo(() => products.filter((p) => isGenericDescription(p.description_fr) || isGenericDescription(p.description_en)), [products]);

  const run = async (key: string, total: number, job: (tick: () => void) => Promise<void>) => {
    setBusy(key); setProgress(0);
    let done = 0;
    try {
      await job(() => { done++; setProgress(Math.round((done / Math.max(total, 1)) * 100)); });
      toast.success(t('admin.enrich_done', { count: total }));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error_generic'));
      if (done) onChanged();
    } finally { setBusy(null); }
  };

  const translateNames = () => run('translate', untranslated.length, async (tick) => {
    for (let i = 0; i < untranslated.length; i += BATCH) {
      const chunk = untranslated.slice(i, i + BATCH);
      const { translations } = await translateText(chunk.map((p) => p.name_fr), 'en', 'fr');
      await inPool(chunk.map((p, k) => ({ p, en: (translations[k] ?? '').trim() })).filter((x) => x.en),
        ({ p, en }) => updateProductFields(p.id, { name_en: en }), tick);
    }
  });

  // Same value for many products → one request per distinct value.
  const groupedUpdate = async <K extends 'weight_kg' | 'hs_code'>(key: K, rows: Array<{ id: string; value: Product[K] }>, tick: () => void) => {
    const by = new Map<string, string[]>();
    rows.forEach((r) => { const k = String(r.value); by.set(k, [...(by.get(k) ?? []), r.id]); });
    for (const [value, ids] of by) {
      await bulkUpdateProducts(ids, { [key]: key === 'weight_kg' ? Number(value) : value } as never);
      ids.forEach(() => tick());
    }
  };
  const fillWeights = () => run('weight', weights.length, (tick) =>
    groupedUpdate('weight_kg', weights.map((w) => ({ id: w.p.id, value: w.kg })), tick));
  const fillHs = () => run('hs', hs.length, (tick) =>
    groupedUpdate('hs_code', hs.map((h) => ({ id: h.p.id, value: h.code })), tick));
  const clearGeneric = () => run('generic', generic.length, (tick) => inPool(generic, (p) => updateProductFields(p.id, {
    ...(isGenericDescription(p.description_fr) ? { description_fr: null } : {}),
    ...(isGenericDescription(p.description_en) ? { description_en: null } : {}),
  }), tick));

  const rows: Array<{ key: string; count: number; label: string; hint: string; action: () => void }> = [
    { key: 'translate', count: untranslated.length, label: t('admin.enrich_translate', { count: untranslated.length }), hint: t('admin.enrich_translate_hint'), action: translateNames },
    { key: 'weight', count: weights.length, label: t('admin.enrich_weight', { count: weights.length }), hint: t('admin.enrich_weight_hint'), action: fillWeights },
    { key: 'hs', count: hs.length, label: t('admin.enrich_hs', { count: hs.length }), hint: t('admin.enrich_hs_hint'), action: fillHs },
    { key: 'generic', count: generic.length, label: t('admin.enrich_generic', { count: generic.length }), hint: t('admin.enrich_generic_hint'), action: clearGeneric },
  ];
  const pending = rows.reduce((n, r) => n + r.count, 0);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-700">{t('admin.enrich_summary', { count: pending })}</p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ListChecks className="mr-1.5 h-4 w-4" /> {t('admin.enrich_button')}
        </Button>
      </div>
      {open && (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="navy" disabled={!!busy || r.count === 0} onClick={r.action}>
                {busy === r.key ? `${progress} %` : r.label}
              </Button>
              <span className="min-w-0 flex-1 text-xs text-slate-500">{r.hint}</span>
            </li>
          ))}
          <MissingDescriptionsPanel products={products} onChanged={onChanged} />
        </ul>
      )}
    </div>
  );
}
