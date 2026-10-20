import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { categoryName, type ProductCategory } from '@/lib/products';
import { cn } from '@/lib/utils';

type Props = {
  categories: ProductCategory[];
  /** Product count per category id (families include their sub-categories). */
  counts: Map<string, number>;
  total: number;
  /** 'all' or a category id. */
  value: string;
  onChange: (value: string) => void;
  lang: 'fr' | 'en';
};

const byOrder = (a: ProductCategory, b: ProductCategory) => a.display_order - b.display_order;

/** The category tree itself: families with counts, each expandable to its sub-categories. */
function Tree({ categories, counts, total, value, onChange, lang, onPicked }: Props & { onPicked?: () => void }) {
  const { t } = useTranslation();
  const active = categories.find((c) => c.id === value);
  const activeFamily = active ? (active.parent_id ?? active.id) : null;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeFamily ? [activeFamily] : []));
  // Opening a family from elsewhere (chips, reset…) keeps the tree in sync.
  useEffect(() => { if (activeFamily) setOpen((s) => (s.has(activeFamily) ? s : new Set([...s, activeFamily]))); }, [activeFamily]);

  const pick = (id: string) => { onChange(id); onPicked?.(); };
  const families = categories.filter((c) => !c.parent_id && ((counts.get(c.id) ?? 0) > 0 || c.id === value)).sort(byOrder);
  const row = (selected: boolean) => cn(
    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors',
    selected ? 'bg-luna-royal font-semibold text-white' : 'text-luna-ink hover:bg-luna-aqua/10',
  );
  const count = (n: number, selected: boolean) => (
    <span className={cn('shrink-0 text-[12px] tabular-nums', selected ? 'text-white/80' : 'text-luna-muted-ink')}>{n}</span>
  );

  return (
    <ul className="space-y-0.5">
      <li>
        <button type="button" onClick={() => pick('all')} aria-pressed={value === 'all'} className={row(value === 'all')}>
          <span>{t('shop.all_categories')}</span>{count(total, value === 'all')}
        </button>
      </li>
      {families.map((f) => {
        const children = categories.filter((c) => c.parent_id === f.id && ((counts.get(c.id) ?? 0) > 0 || c.id === value)).sort(byOrder);
        const isOpen = open.has(f.id);
        const listId = `facet-${f.id}`;
        return (
          <li key={f.id}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => pick(f.id)} aria-pressed={value === f.id} className={row(value === f.id)}>
                <span className="font-medium">{categoryName(f, lang)}</span>{count(counts.get(f.id) ?? 0, value === f.id)}
              </button>
              {children.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  aria-label={t(isOpen ? 'shop.facet_collapse' : 'shop.facet_expand', { name: categoryName(f, lang) })}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-luna-muted-ink hover:bg-luna-aqua/10"
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>
              )}
            </div>
            {children.length > 0 && isOpen && (
              <ul id={listId} className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-[#DCE5F0] pl-2">
                {children.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c.id)} aria-pressed={value === c.id} className={row(value === c.id)}>
                      <span>{categoryName(c, lang)}</span>{count(counts.get(c.id) ?? 0, value === c.id)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Desktop: a sticky sidebar tree. */
export function CategorySidebar(props: Props) {
  const { t } = useTranslation();
  return (
    <aside aria-label={t('shop.categories_title')} className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-[#DCE5F0] bg-white p-3">
        <p className="mb-2 px-2.5 text-[11px] font-semibold tracking-[.14em] text-luna-muted-ink">{t('shop.categories_title').toUpperCase()}</p>
        <Tree {...props} />
      </div>
    </aside>
  );
}

/** Mobile / tablet: a button that unfolds the same tree. */
export function CategoryDropdown(props: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = props.categories.find((c) => c.id === props.value);
  const parent = current?.parent_id ? props.categories.find((c) => c.id === current.parent_id) : undefined;
  const label = current
    ? (parent ? `${categoryName(parent, props.lang)} › ${categoryName(current, props.lang)}` : categoryName(current, props.lang))
    : t('shop.all_categories');
  return (
    <div className="mb-3 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="category-dropdown"
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#C6D4E6] bg-white px-3.5 py-2.5 text-left text-[14px] text-luna-royal"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-luna-azure" aria-hidden="true" />
          <span className="truncate"><span className="text-luna-muted-ink">{t('shop.categories_title')} : </span><span className="font-semibold">{label}</span></span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id="category-dropdown" className="mt-2 rounded-xl border border-[#DCE5F0] bg-white p-2 shadow-sm">
          <Tree {...props} onPicked={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
