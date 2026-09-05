import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import Papa from 'papaparse';
import { BilingualPair } from '@/components/BilingualPair';
import {
  fetchAllProducts, fetchProductCategories, upsertProduct, toggleProductActive, deleteProduct,
  upsertCategory, deleteCategory,
  type Product, type ProductCategory,
} from '@/lib/products';
import { cn } from '@/lib/utils';

type Tab = 'list' | 'add' | 'import' | 'categories';

export default function AdminProducts() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('list');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);

  const reload = async () => {
    const [p, c] = await Promise.all([fetchAllProducts(), fetchProductCategories()]);
    setProducts(p); setCategories(c);
  };
  useEffect(() => { void reload(); }, []);

  return (
    <>
      <SEO title={t('admin.products_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.products_title')}</h1>
      <p className="mt-2 text-slate-600 max-w-3xl">{t('admin.products_intro')}</p>

      <div className="mt-6 border-b border-slate-200 flex flex-wrap gap-1">
        {(['list', 'add', 'import', 'categories'] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setTab(k); if (k !== 'add') setEditing(null); }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === k
                ? 'border-luna-navy text-luna-navy'
                : 'border-transparent text-slate-500 hover:text-luna-navy'
            )}
          >
            {t(`admin.products_tab_${k}`)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'list' && (
          <ProductList
            products={products}
            categories={categories}
            onEdit={(p) => { setEditing(p); setTab('add'); }}
            onChanged={reload}
          />
        )}
        {tab === 'add' && (
          <ProductForm
            product={editing}
            categories={categories}
            onSaved={async () => { await reload(); setEditing(null); }}
          />
        )}
        {tab === 'import' && <CsvImport categories={categories} onDone={reload} />}
        {tab === 'categories' && (
          <CategoriesEditor categories={categories} products={products} onChanged={reload} />
        )}
      </div>
    </>
  );
}

// ─── List tab ──────────────────────────────────────────────────────────────

function ProductList({
  products, categories, onEdit, onChanged,
}: { products: Product[]; categories: ProductCategory[]; onEdit: (p: Product) => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'all' && p.category_id !== catFilter) return false;
      if (!q) return true;
      return [p.name_fr, p.name_en, p.slug, p.barcode ?? ''].some((f) => f.toLowerCase().includes(q));
    });
  }, [products, query, catFilter]);

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder={t('admin.products_search_placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.products_filter_category_any')}</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_fr}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_name')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_slug')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_category')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_price')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_barcode')}</th>
              <th className="text-center px-4 py-3 font-semibold">{t('admin.products_col_active')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">—</td></tr>
            )}
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.category_id);
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-luna-navy">{p.name_fr}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.slug}</td>
                  <td className="px-4 py-3 text-slate-600">{cat?.name_fr ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-luna-navy">{Number(p.price).toFixed(2)} €</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.barcode ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={async (v) => {
                        try { await toggleProductActive(p.id, v); onChanged(); }
                        catch { toast.error(t('common.error_generic')); }
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                      {t('admin.products_action_edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        if (!confirm(t('admin.products_delete_confirm'))) return;
                        try { await deleteProduct(p.id); onChanged(); toast.success('OK'); }
                        catch { toast.error(t('common.error_generic')); }
                      }}
                    >
                      {t('admin.products_action_delete')}
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

// ─── Add / edit form ───────────────────────────────────────────────────────

function ProductForm({
  product, categories, onSaved,
}: { product: Product | null; categories: ProductCategory[]; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Partial<Product>>(
    product ?? { is_active: true, price: 0, weight_kg: null, barcode: null, hs_code: null, image_url: null }
  );

  // Focus the barcode input on mount + after each save — makes a USB/Bluetooth
  // scanner (which types keystrokes) usable for adding one product after another
  // without touching the mouse.
  useEffect(() => { barcodeRef.current?.focus(); }, [product]);

  const set = <K extends keyof Product>(k: K, v: Product[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.category_id) { toast.error(t('common.required')); return; }
    if (!values.slug || !values.name_fr || !values.name_en) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      const payload = {
        id: product?.id,
        slug: values.slug!,
        name_fr: values.name_fr!,
        name_en: values.name_en!,
        description_fr: values.description_fr ?? null,
        description_en: values.description_en ?? null,
        price: Number(values.price ?? 0),
        category_id: values.category_id!,
        barcode: values.barcode || null,
        hs_code: values.hs_code || null,
        weight_kg: values.weight_kg == null || values.weight_kg === '' as any ? null : Number(values.weight_kg),
        image_url: values.image_url || null,
        is_active: values.is_active !== false,
      };
      await upsertProduct(payload as any);
      toast.success(t('admin.product_saved_toast'));
      if (payload.barcode) setFlash(t('admin.product_scanned_flash', { barcode: payload.barcode }));
      // Reset to a fresh form + refocus the barcode input so the next scan can
      // start immediately.
      setValues({ is_active: true, price: 0, weight_kg: null, barcode: null, hs_code: null, image_url: null, category_id: payload.category_id });
      await onSaved();
      setTimeout(() => setFlash(null), 2500);
      barcodeRef.current?.focus();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-products] save failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5 max-w-3xl">
      <h2 className="text-lg font-semibold text-luna-navy">
        {product ? t('admin.product_form_edit_title') : t('admin.product_form_add_title')}
      </h2>

      {flash && (
        <div role="status" className="rounded-md bg-luna-cyan/20 border border-luna-cyan text-luna-navy px-4 py-2 text-sm font-medium">
          ✓ {flash}
        </div>
      )}

      <div>
        <Label htmlFor="barcode">{t('admin.product_field_barcode')}</Label>
        <Input
          ref={barcodeRef}
          id="barcode"
          value={values.barcode ?? ''}
          onChange={(e) => set('barcode', e.target.value || null)}
          className="mt-1.5 font-mono"
          autoComplete="off"
          inputMode="numeric"
        />
        <p className="mt-1 text-xs text-slate-500">{t('admin.product_field_barcode_hint')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="slug">{t('admin.product_field_slug')}</Label>
          <Input id="slug" value={values.slug ?? ''} onChange={(e) => set('slug', e.target.value)} required className="mt-1.5 font-mono" />
          <p className="mt-1 text-xs text-slate-500">{t('admin.product_field_slug_hint')}</p>
        </div>
        <div>
          <Label htmlFor="category_id">{t('admin.product_field_category')}</Label>
          <Select value={values.category_id ?? ''} onValueChange={(v) => set('category_id', v)}>
            <SelectTrigger id="category_id" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_fr}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <BilingualPair
        label={t('admin.product_field_name_fr').replace(' (FR)', '')}
        labelFr={t('admin.product_field_name_fr')} labelEn={t('admin.product_field_name_en')}
        fr={values.name_fr ?? ''} en={values.name_en ?? ''}
        onFr={(v) => set('name_fr', v)} onEn={(v) => set('name_en', v)}
        kind="input" required
      />

      <BilingualPair
        label={t('admin.product_field_description_fr').replace(' (FR)', '')}
        labelFr={t('admin.product_field_description_fr')} labelEn={t('admin.product_field_description_en')}
        fr={values.description_fr ?? ''} en={values.description_en ?? ''}
        onFr={(v) => set('description_fr', v || null)} onEn={(v) => set('description_en', v || null)}
        kind="textarea"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="price">{t('admin.product_field_price')}</Label>
          <Input id="price" type="number" min="0" step="0.01" value={values.price ?? 0} onChange={(e) => set('price', Number(e.target.value))} required className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="weight_kg">{t('admin.product_field_weight')}</Label>
          <Input id="weight_kg" type="number" min="0" step="0.001" value={values.weight_kg ?? ''} onChange={(e) => set('weight_kg', e.target.value === '' ? null : Number(e.target.value) as any)} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="hs_code">{t('admin.product_field_hs_code')}</Label>
          <Input id="hs_code" value={values.hs_code ?? ''} onChange={(e) => set('hs_code', e.target.value || null)} className="mt-1.5 font-mono" />
        </div>
      </div>

      <div>
        <Label htmlFor="image_url">{t('admin.product_field_image_url')}</Label>
        <Input id="image_url" value={values.image_url ?? ''} onChange={(e) => set('image_url', e.target.value || null)} className="mt-1.5" />
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={values.is_active !== false} onCheckedChange={(v) => set('is_active', v)} />
        <Label>{t('admin.product_field_active')}</Label>
      </div>

      <div>
        <Button type="submit" variant="navy" disabled={saving}>
          {saving ? t('admin.product_saving') : t('admin.product_save')}
        </Button>
      </div>
    </form>
  );
}

// ─── CSV import ────────────────────────────────────────────────────────────

type ImportRow = {
  row: number;
  raw: Record<string, string>;
  errors: string[];
  data?: {
    slug: string; name_fr: string; name_en: string;
    description_fr: string | null; description_en: string | null;
    price: number; category_id: string;
    barcode: string | null; hs_code: string | null; weight_kg: number | null; image_url: string | null;
    is_active: boolean;
  };
};

function CsvImport({ categories, onDone }: { categories: ProductCategory[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  const onFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map((raw, i) => validateRow(raw, i + 2, categories));
        setRows(parsed);
      },
      error: (err) => { toast.error(err.message); },
    });
  };

  const valid = rows.filter((r) => r.errors.length === 0 && r.data);

  const doImport = async () => {
    if (valid.length === 0) { toast.info(t('admin.products_import_no_valid')); return; }
    setImporting(true);
    let ok = 0, skipped = 0;
    for (const r of valid) {
      try { await upsertProduct(r.data!); ok++; }
      catch { skipped++; }
    }
    setImporting(false);
    toast.success(t('admin.products_import_summary', { ok, skipped }));
    setRows([]);
    onDone();
  };

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-slate-600 mb-4">{t('admin.products_import_intro')}</p>
      <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-4 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
        {t('admin.products_import_choose')}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      {rows.length > 0 && (
        <>
          <h3 className="mt-6 text-lg font-semibold text-luna-navy">{t('admin.products_import_preview')}</h3>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-luna-navy">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_row_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_status_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">slug</th>
                  <th className="text-left px-3 py-2 font-semibold">name_fr</th>
                  <th className="text-left px-3 py-2 font-semibold">price</th>
                  <th className="text-left px-3 py-2 font-semibold">category_slug</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? 'bg-red-50/40' : ''}>
                    <td className="px-3 py-2 font-mono text-slate-500">{r.row}</td>
                    <td className="px-3 py-2">
                      {r.errors.length === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 font-semibold">
                          {t('admin.products_import_ok')}
                        </span>
                      ) : (
                        <span className="text-red-700" title={r.errors.join('; ')}>
                          {t('admin.products_import_error')}: {r.errors.join('; ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.raw.slug ?? ''}</td>
                    <td className="px-3 py-2">{r.raw.name_fr ?? ''}</td>
                    <td className="px-3 py-2">{r.raw.price ?? ''}</td>
                    <td className="px-3 py-2 font-mono">{r.raw.category_slug ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Button variant="navy" disabled={importing || valid.length === 0} onClick={doImport}>
              {importing ? t('admin.products_import_importing') : t('admin.products_import_confirm', { count: valid.length })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function validateRow(raw: Record<string, string>, row: number, categories: ProductCategory[]): ImportRow {
  const errors: string[] = [];
  const req = (k: string) => { if (!raw[k]?.trim()) errors.push(`${k} required`); };
  ['slug', 'name_fr', 'name_en', 'price', 'category_slug'].forEach(req);

  const price = Number(raw.price);
  if (raw.price != null && Number.isNaN(price)) errors.push('price NaN');
  if (price < 0) errors.push('price < 0');
  const weight = raw.weight_kg?.trim() ? Number(raw.weight_kg) : null;
  if (weight !== null && Number.isNaN(weight)) errors.push('weight_kg NaN');

  const cat = categories.find((c) => c.slug === raw.category_slug?.trim());
  if (raw.category_slug?.trim() && !cat) errors.push(`unknown category_slug "${raw.category_slug}"`);
  if (raw.slug && !/^[a-z0-9-]+$/.test(raw.slug.trim())) errors.push('slug format');

  if (errors.length) return { row, raw, errors };
  return {
    row, raw, errors: [],
    data: {
      slug: raw.slug.trim(),
      name_fr: raw.name_fr.trim(),
      name_en: raw.name_en.trim(),
      description_fr: raw.description_fr?.trim() || null,
      description_en: raw.description_en?.trim() || null,
      price,
      category_id: cat!.id,
      barcode: raw.barcode?.trim() || null,
      hs_code: raw.hs_code?.trim() || null,
      weight_kg: weight,
      image_url: raw.image_url?.trim() || null,
      is_active: true,
    },
  };
}

// ─── Categories editor ────────────────────────────────────────────────────

function CategoriesEditor({
  categories, products, onChanged,
}: { categories: ProductCategory[]; products: Product[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState(''); const [nameFr, setNameFr] = useState(''); const [nameEn, setNameEn] = useState(''); const [order, setOrder] = useState(100);

  const productCountByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products]);

  const add = async () => {
    if (!slug || !nameFr || !nameEn) { toast.error(t('common.required')); return; }
    try {
      await upsertCategory({ slug, name_fr: nameFr, name_en: nameEn, display_order: Number(order) || 100 });
      setSlug(''); setNameFr(''); setNameEn(''); setOrder(100);
      onChanged();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err); toast.error(t('common.error_generic'));
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-slate-600 mb-4">{t('admin.categories_intro')}</p>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_slug')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_name_fr')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_name_en')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.categories_field_order')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.slug}</td>
                <td className="px-4 py-3">{c.name_fr}</td>
                <td className="px-4 py-3">{c.name_en}</td>
                <td className="px-4 py-3 text-right">{c.display_order}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    disabled={(productCountByCategory.get(c.id) ?? 0) > 0}
                    onClick={async () => {
                      if (!confirm(t('admin.categories_delete_confirm'))) return;
                      try { await deleteCategory(c.id); onChanged(); } catch { toast.error(t('common.error_generic')); }
                    }}
                  >
                    {t('admin.products_action_delete')}
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="bg-luna-navy/5">
              <td className="px-4 py-3"><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-cat" className="h-8 font-mono text-xs" /></td>
              <td className="px-4 py-3"><Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} className="h-8" /></td>
              <td className="px-4 py-3"><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="h-8" /></td>
              <td className="px-4 py-3 text-right"><Input value={order} onChange={(e) => setOrder(Number(e.target.value) || 100)} type="number" className="h-8 w-20 ml-auto" /></td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="navy" onClick={add}>{t('admin.categories_add')}</Button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
