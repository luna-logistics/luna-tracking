import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { bulkUpdateProducts, fetchBrands, upsertBrand, type Brand, type Product } from '@/lib/products';
import { brandSlug, detectExistingBrands, suggestNewBrands } from '@/lib/brand-detect';

/**
 * Admin helper: the scrapers rarely return a brand, so this fills it in bulk.
 *  A. brands we already have, found inside the names of unbranded products;
 *  B. new brands suggested from words that start many unbranded names (the
 *     admin confirms / renames each one before anything is created).
 * Only products WITHOUT a brand are ever touched; only brand_id is written.
 */
export function BrandAutoDetect({ products, brands, onChanged }: { products: Product[]; brands: Brand[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipA, setSkipA] = useState<Set<string>>(new Set());
  const [pickB, setPickB] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});

  const unbranded = useMemo(() => products.filter((p) => !p.brand_id), [products]);
  const existing = useMemo(() => detectExistingBrands(products, brands), [products, brands]);
  const suggestions = useMemo(() => suggestNewBrands(products, brands), [products, brands]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  const applyExisting = async () => {
    const chosen = existing.filter((m) => !skipA.has(m.brand.id));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      for (const m of chosen) await bulkUpdateProducts(m.productIds, { brand_id: m.brand.id });
      toast.success(t('admin.brand_auto_done', { count: chosen.reduce((n, m) => n + m.productIds.length, 0) }));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error_generic'));
    } finally { setBusy(false); }
  };

  const applySuggestions = async () => {
    const chosen = suggestions.filter((s) => pickB.has(s.token));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      let assigned = 0;
      // Fresh list so a brand created a moment ago (or by someone else) is reused, never duplicated.
      let current = await fetchBrands();
      for (const s of chosen) {
        const name = (names[s.token] ?? s.label).trim();
        if (!name) continue;
        const slug = brandSlug(name);
        let brand = current.find((b) => b.slug === slug);
        if (!brand) {
          brand = await upsertBrand({ slug, name_fr: name, name_en: name, display_order: 100 });
          current = [...current, brand];
        }
        await bulkUpdateProducts(s.productIds, { brand_id: brand.id });
        assigned += s.productIds.length;
      }
      toast.success(t('admin.brand_auto_done', { count: assigned }));
      setPickB(new Set());
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error_generic'));
    } finally { setBusy(false); }
  };

  const countA = existing.filter((m) => !skipA.has(m.brand.id)).reduce((n, m) => n + m.productIds.length, 0);
  const countB = suggestions.filter((s) => pickB.has(s.token)).reduce((n, s) => n + s.productIds.length, 0);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-700">
          {t('admin.brand_auto_summary', { missing: unbranded.length, total: products.length })}
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Wand2 className="mr-1.5 h-4 w-4" /> {t('admin.brand_auto_button')}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-luna-navy">{t('admin.brand_auto_existing_title', { count: countA })}</h3>
            <p className="mb-2 text-xs text-slate-500">{t('admin.brand_auto_existing_hint')}</p>
            {existing.length === 0 ? (
              <p className="text-sm text-slate-500">{t('admin.brand_auto_none')}</p>
            ) : (
              <>
                <ul className="mb-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {existing.map((m) => (
                    <li key={m.brand.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={!skipA.has(m.brand.id)} onChange={() => toggle(skipA, setSkipA, m.brand.id)} />
                        <span className="font-medium">{m.brand.name_fr}</span>
                        <span className="text-slate-500">· {t('admin.brand_auto_n_products', { count: m.productIds.length })}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="navy" disabled={busy || countA === 0} onClick={applyExisting}>
                  {t('admin.brand_auto_apply', { count: countA })}
                </Button>
              </>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-luna-navy">{t('admin.brand_auto_new_title', { count: suggestions.length })}</h3>
            <p className="mb-2 text-xs text-slate-500">{t('admin.brand_auto_new_hint')}</p>
            {suggestions.length === 0 ? (
              <p className="text-sm text-slate-500">{t('admin.brand_auto_none')}</p>
            ) : (
              <>
                <ul className="mb-3 space-y-2">
                  {suggestions.map((s) => (
                    <li key={s.token} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-2">
                      <input
                        type="checkbox"
                        aria-label={s.label}
                        checked={pickB.has(s.token)}
                        onChange={() => toggle(pickB, setPickB, s.token)}
                      />
                      <Input
                        value={names[s.token] ?? s.label}
                        onChange={(e) => setNames((n) => ({ ...n, [s.token]: e.target.value }))}
                        className="h-8 w-48"
                      />
                      <span className="text-xs text-slate-600">{t('admin.brand_auto_n_products', { count: s.productIds.length })}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{s.samples.join(' · ')}</span>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="navy" disabled={busy || countB === 0} onClick={applySuggestions}>
                  {t('admin.brand_auto_create_apply', { count: countB })}
                </Button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
