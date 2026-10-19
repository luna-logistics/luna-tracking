import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { bulkUpdateProducts, type Product, type ProductCategory } from '@/lib/products';
import { detectCategorySlug } from '@/lib/category-detect';

type Group = { key: string; kind: 'place' | 'move'; category: ProductCategory; ids: string[]; samples: string[] };

/**
 * Admin helper: puts products in the right sub-category from their name.
 *  - "place": the product sits directly in a family (e.g. Hygiène) → ticked by default;
 *  - "move": the product is in a sub-category but its name points elsewhere → unticked
 *    by default, the admin decides (a manual choice may be deliberate).
 * Only category_id is written.
 */
export function CategoryAutoSort({ products, categories, onChanged }: { products: Product[]; categories: ProductCategory[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const byId = new Map(categories.map((c) => [c.id, c]));
    const parents = new Set(categories.filter((c) => c.parent_id).map((c) => c.parent_id as string));
    const acc = new Map<string, Group>();
    for (const p of products) {
      const slug = detectCategorySlug(p.name_fr);
      const target = slug ? bySlug.get(slug) : undefined;
      if (!target || target.id === p.category_id) continue;
      const current = byId.get(p.category_id);
      const kind: Group['kind'] = !current || parents.has(current.id) ? 'place' : 'move';
      const key = `${kind}:${target.id}`;
      const g = acc.get(key) ?? { key, kind, category: target, ids: [], samples: [] };
      g.ids.push(p.id);
      if (g.samples.length < 3) g.samples.push(p.name_fr);
      acc.set(key, g);
    }
    return [...acc.values()].sort((a, b) => (a.kind === b.kind ? b.ids.length - a.ids.length : a.kind === 'place' ? -1 : 1));
  }, [products, categories]);

  const picked = (g: Group) => override[g.key] ?? g.kind === 'place';
  const place = groups.filter((g) => g.kind === 'place');
  const move = groups.filter((g) => g.kind === 'move');
  const chosen = groups.filter(picked);
  const chosenCount = chosen.reduce((n, g) => n + g.ids.length, 0);
  const total = (gs: Group[]) => gs.reduce((n, g) => n + g.ids.length, 0);

  const apply = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      for (const g of chosen) await bulkUpdateProducts(g.ids, { category_id: g.category.id });
      toast.success(t('admin.cat_auto_done', { count: chosenCount }));
      setOverride({});
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error_generic'));
    } finally { setBusy(false); }
  };

  const renderGroup = (g: Group) => (
    <li key={g.key}>
      <label className="flex cursor-pointer flex-wrap items-center gap-x-2 text-sm">
        <input type="checkbox" checked={picked(g)} onChange={() => setOverride((o) => ({ ...o, [g.key]: !picked(g) }))} />
        <span className="font-medium">{g.category.name_fr}</span>
        <span className="text-slate-500">· {t('admin.brand_auto_n_products', { count: g.ids.length })}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{g.samples.join(' · ')}</span>
      </label>
    </li>
  );

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-700">{t('admin.cat_auto_summary', { place: total(place), move: total(move) })}</p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Wand2 className="mr-1.5 h-4 w-4" /> {t('admin.cat_auto_button')}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-5">
          {groups.length === 0 && <p className="text-sm text-slate-500">{t('admin.brand_auto_none')}</p>}
          {place.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-luna-navy">{t('admin.cat_auto_place_title', { count: total(place) })}</h3>
              <ul className="mt-2 space-y-1.5">{place.map(renderGroup)}</ul>
            </section>
          )}
          {move.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-luna-navy">{t('admin.cat_auto_move_title', { count: total(move) })}</h3>
              <p className="text-xs text-slate-500">{t('admin.cat_auto_move_hint')}</p>
              <ul className="mt-2 space-y-1.5">{move.map(renderGroup)}</ul>
            </section>
          )}
          {groups.length > 0 && (
            <Button size="sm" variant="navy" disabled={busy || chosenCount === 0} onClick={apply}>
              {t('admin.brand_auto_apply', { count: chosenCount })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
