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
import { Upload, Trash2, Languages, Wand2, Check, X } from 'lucide-react';
import { BilingualPair } from '@/components/BilingualPair';
import { translateText } from '@/lib/translate';
import { slugify } from '@/lib/blog';
import { suggestHsCode, type HsSuggestion } from '@/lib/hs-classifier';
import type { EligibilityResult } from '@/lib/product-eligibility';
import { rejectedRowsToCsv } from '@/lib/store-import';
import {
  decodeCsvBytes, detectSourceFormat, diagnoseFile, looksLikeCents, parseImportCsv, pickProfile, resolveStore,
  type CsvDelimiter,
} from '@/lib/import-csv';
import { validateImportRow, type ImportIssue, type ImportRowData, type ValidatedRow } from '@/lib/import-validate';
import { detectCategorySlug } from '@/lib/category-detect';
import { recognizeColumns, type ColumnRecognition } from '@/lib/import-columns';
import { BUILTIN_PRODUCT_TYPES, fetchProductTypes, isBuiltinType, productTypeLabel, withProductType, type ProductTypeDef } from '@/lib/product-types';
import { ProductTypeSelect } from '@/components/ProductTypeSelect';
import { ProductTypesEditor } from '@/components/ProductTypesEditor';
import {
  applyImportProfile, categoryPrefixes, headerSignature, DEFAULT_RULES, slugify as slugifyImport,
  type CategoryMapping, type ImportProfile, type ProfiledRow,
  categoryGroupKey,
} from '@/lib/import-profile';
import {
  fetchImportProfiles, fetchCategoryMappings, createImportProfile, updateImportProfile,
  saveCategoryMapping, deleteCategoryMapping, findProductBySource, updateProductFromSource,
} from '@/lib/import-profiles-db';
import type { ProductType } from '@/lib/normalized-product';
import { optimizeImage } from '@/lib/optimize-image';
import { BrandAutoDetect } from '@/components/BrandAutoDetect';
import { CategoryAutoSort } from '@/components/CategoryAutoSort';
import { ProductEnrichPanel } from '@/components/ProductEnrichPanel';
import { BrandPicker } from '@/components/BrandPicker';
import { detectBrandInText, matchBrandName } from '@/lib/brand-detect';
import {
  fetchAllProducts, fetchProductCategories, upsertProduct, toggleProductActive, deleteProduct,
  upsertCategory, deleteCategory, uploadProductImage, fetchStores, upsertProductSource, type Store,
  fetchBrands, upsertBrand, deleteBrand, type Brand, orderedCategories,
  bulkUpdateProducts, bulkDeleteProducts,
  type Product, type ProductCategory,
} from '@/lib/products';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';

type Tab = 'list' | 'add' | 'import' | 'categories' | 'brands' | 'types';

export default function AdminProducts() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('list');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);

  const reload = async () => {
    const [p, c, b] = await Promise.all([fetchAllProducts(), fetchProductCategories(), fetchBrands()]);
    setProducts(p); setCategories(c); setBrands(b);
  };
  useEffect(() => { void reload(); }, []);
  const addBrand = (b: Brand) => setBrands((prev) => (prev.some((x) => x.id === b.id) ? prev : [...prev, b]));

  return (
    <>
      <SEO title={t('admin.products_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.products_title')}</h1>
      <p className="mt-2 text-slate-600 max-w-3xl">{t('admin.products_intro')}</p>

      <div className="mt-6 border-b border-slate-200 flex flex-wrap gap-1">
        {(['list', 'add', 'import', 'categories', 'brands', 'types'] as Tab[]).map((k) => (
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
            brands={brands}
            onBrandCreated={addBrand}
            onEdit={(p) => { setEditing(p); setTab('add'); }}
            onChanged={reload}
          />
        )}
        {tab === 'add' && (
          <ProductForm
            product={editing}
            categories={categories}
            brands={brands}
            onBrandCreated={addBrand}
            onSaved={async () => { await reload(); setEditing(null); }}
          />
        )}
        {tab === 'import' && <CsvImport categories={categories} brands={brands} onDone={reload} onBrandCreated={addBrand} />}
        {tab === 'categories' && (
          <CategoriesEditor categories={categories} products={products} onChanged={reload} />
        )}
        {tab === 'brands' && (
          <BrandsEditor brands={brands} products={products} onChanged={reload} />
        )}
        {tab === 'types' && <ProductTypesEditor />}
      </div>
    </>
  );
}

// ─── List tab ──────────────────────────────────────────────────────────────

function ProductList({
  products, categories, brands, onEdit, onChanged, onBrandCreated,
}: { products: Product[]; categories: ProductCategory[]; brands: Brand[]; onEdit: (p: Product) => void; onChanged: () => void; onBrandCreated: (b: Brand) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => { void fetchStores().then(setStores); }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const catTree = useMemo(() => orderedCategories(categories), [categories]);
  const [bulkCategory, setBulkCategory] = useState<string>('nochange');
  const [bulkBrand, setBulkBrand] = useState<string>('nochange');
  const [bulkStore, setBulkStore] = useState<string>('nochange');
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'all' && p.category_id !== catFilter
        && categories.find((c) => c.id === p.category_id)?.parent_id !== catFilter) return false;
      if (statusFilter === 'active' && !p.is_active) return false;
      if (statusFilter === 'draft' && p.is_active) return false;
      if (brandFilter === 'none' ? !!p.brand_id : brandFilter !== 'all' && (p.brand_id ?? '') !== brandFilter) return false;
      if (storeFilter === 'none' ? !!p.store_id : storeFilter !== 'all' && (p.store_id ?? '') !== storeFilter) return false;
      if (!q) return true;
      return [p.name_fr, p.name_en, p.slug_fr, p.slug_en, p.barcode ?? ''].some((f) => f.toLowerCase().includes(q));
    });
  }, [products, query, catFilter, brandFilter, storeFilter, statusFilter, categories]);

  // Selection is kept by id, independent of which page/filter is showing —
  // but the "select all" checkbox only ever acts on what's currently visible.
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleOne = (id: string, v: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    if (v) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAllVisible = (v: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    filtered.forEach((p) => { if (v) next.add(p.id); else next.delete(p.id); });
    return next;
  });

  const resetBulkForm = () => { setBulkCategory('nochange'); setBulkBrand('nochange'); setBulkStore('nochange'); };

  const applyBulk = async () => {
    const patch: Parameters<typeof bulkUpdateProducts>[1] = {};
    if (bulkCategory !== 'nochange') patch.category_id = bulkCategory;
    if (bulkBrand !== 'nochange') patch.brand_id = bulkBrand === 'none' ? null : bulkBrand;
    if (bulkStore !== 'nochange') patch.store_id = bulkStore === 'none' ? null : bulkStore;
    if (Object.keys(patch).length === 0) { toast.error(t('admin.products_bulk_nothing_selected')); return; }
    setBulkBusy(true);
    try {
      await bulkUpdateProducts([...selected], patch);
      toast.success(t('admin.products_bulk_applied', { count: selected.size }));
      setSelected(new Set());
      resetBulkForm();
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBulkBusy(false);
    }
  };

  const applyBulkActive = async (next: boolean) => {
    setBulkBusy(true);
    try {
      await bulkUpdateProducts([...selected], { is_active: next });
      toast.success(t('admin.products_bulk_applied', { count: selected.size }));
      setSelected(new Set());
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(t('admin.products_bulk_delete_confirm', { count: selected.size }))) return;
    setBulkBusy(true);
    try {
      await bulkDeleteProducts([...selected]);
      toast.success(t('admin.products_bulk_applied', { count: selected.size }));
      setSelected(new Set());
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <>
      <ProductEnrichPanel products={products} categories={categories} onChanged={onChanged} />
      <CategoryAutoSort products={products} categories={categories} onChanged={onChanged} />
      <BrandAutoDetect products={products} brands={brands} onChanged={onChanged} />
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
            {catTree.map(({ category: c, label, depth }) => <SelectItem key={c.id} value={c.id} className={depth ? 'pl-8' : 'font-semibold'}>{depth ? label.split(' › ')[1] : label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'draft')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.products_filter_status_any')}</SelectItem>
            <SelectItem value="active">{t('admin.products_filter_status_active')}</SelectItem>
            <SelectItem value="draft">{t('admin.products_filter_status_draft')}</SelectItem>
          </SelectContent>
        </Select>
        {stores.length > 0 && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.products_filter_store_any')}</SelectItem>
              <SelectItem value="none">{t('admin.products_filter_store_none')}</SelectItem>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {brands.length > 0 && (
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.products_filter_brand_any')}</SelectItem>
              <SelectItem value="none">{t('admin.products_filter_brand_none')}</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name_fr}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-4 rounded-xl border border-luna-navy/20 bg-luna-navy/5 p-4 flex flex-wrap items-end gap-3">
          <div className="text-sm font-semibold text-luna-navy basis-full sm:basis-auto sm:self-center">
            {t('admin.products_bulk_selected_count', { count: selected.size })}
          </div>

          <div>
            <Label className="text-xs">{t('admin.product_field_category')}</Label>
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger className="w-56 h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nochange">{t('admin.products_bulk_no_change')}</SelectItem>
                {catTree.map(({ category: c, label }) => <SelectItem key={c.id} value={c.id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{t('admin.product_field_brand')}</Label>
            <BrandPicker
              value={bulkBrand}
              onChange={setBulkBrand}
              brands={brands}
              onBrandCreated={onBrandCreated}
              leading={[{ value: 'nochange', label: t('admin.products_bulk_no_change') }, { value: 'none', label: t('admin.product_field_brand_none') }]}
              className="w-64 h-9 mt-1 bg-white"
            />
          </div>

          {stores.length > 0 && (
            <div>
              <Label className="text-xs">{t('admin.products_col_store')}</Label>
              <Select value={bulkStore} onValueChange={setBulkStore}>
                <SelectTrigger className="w-48 h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nochange">{t('admin.products_bulk_no_change')}</SelectItem>
                  <SelectItem value="none">{t('admin.products_filter_store_none')}</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button size="sm" variant="navy" disabled={bulkBusy} onClick={applyBulk}>
            {t('admin.products_bulk_apply')}
          </Button>

          <div className="h-9 w-px bg-luna-navy/15 hidden sm:block" />

          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => applyBulkActive(true)}>
            {t('admin.products_bulk_activate')}
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => applyBulkActive(false)}>
            {t('admin.products_bulk_deactivate')}
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" disabled={bulkBusy} onClick={bulkDelete}>
            {t('admin.products_bulk_delete')}
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            {t('admin.products_bulk_clear')}
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-luna-navy focus:ring-luna-navy"
                  aria-label={t('admin.products_bulk_select_all')}
                />
              </th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_name')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_slug')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_category')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_brand')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_store')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_price')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.products_col_barcode')}</th>
              <th className="text-center px-4 py-3 font-semibold">{t('admin.products_col_active')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">—</td></tr>
            )}
            {filtered.map((p) => {
              const cat = categories.find((c) => c.id === p.category_id);
              const brand = brands.find((b) => b.id === p.brand_id);
              const isSelected = selected.has(p.id);
              return (
                <tr key={p.id} className={cn('hover:bg-slate-50', isSelected && 'bg-luna-navy/5')}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleOne(p.id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-luna-navy focus:ring-luna-navy"
                      aria-label={p.name_fr}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-luna-navy">{p.name_fr}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    <div>{p.slug_fr}</div>
                    <div className="text-slate-400">{p.slug_en}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{cat?.name_fr ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{brand?.name_fr ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{stores.find((s) => s.id === p.store_id)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-luna-navy">{Number(p.price).toFixed(2)} €</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.barcode ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={async (v) => {
                        try { await toggleProductActive(p.id, v); onChanged(); }
                        catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
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
                        catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
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
  product, categories, brands, onSaved, onBrandCreated,
}: { product: Product | null; categories: ProductCategory[]; brands: Brand[]; onSaved: () => Promise<void>; onBrandCreated: (b: Brand) => void }) {
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
    if (!values.slug_fr || !values.slug_en || !values.name_fr || !values.name_en) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      const payload = {
        id: product?.id,
        slug_fr: values.slug_fr!,
        slug_en: values.slug_en!,
        name_fr: values.name_fr!,
        name_en: values.name_en!,
        description_fr: values.description_fr ?? null,
        description_en: values.description_en ?? null,
        price: Number(values.price ?? 0),
        category_id: values.category_id!,
        brand_id: values.brand_id || null,
        barcode: values.barcode || null,
        hs_code: values.hs_code || null,
        weight_kg: values.weight_kg == null || values.weight_kg === '' as any ? null : Number(values.weight_kg),
        image_url: values.image_url || null,
        is_active: values.is_active !== false,
        meta_title_fr: values.meta_title_fr || null,
        meta_title_en: values.meta_title_en || null,
        meta_description_fr: values.meta_description_fr || null,
        meta_description_en: values.meta_description_en || null,
      };
      await upsertProduct(payload as any);
      toast.success(t('admin.product_saved_toast'));
      if (payload.barcode) setFlash(t('admin.product_scanned_flash', { barcode: payload.barcode }));
      // Reset to a fresh form + refocus the barcode input so the next scan can
      // start immediately.
      setValues({ is_active: true, price: 0, weight_kg: null, barcode: null, hs_code: null, image_url: null, category_id: payload.category_id, brand_id: payload.brand_id, slug_fr: '', slug_en: '' });
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

      <ProductSlugsPair
        slugFr={values.slug_fr ?? ''} slugEn={values.slug_en ?? ''}
        titleFr={values.name_fr ?? ''} titleEn={values.name_en ?? ''}
        onFr={(v) => set('slug_fr', v)} onEn={(v) => set('slug_en', v)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category_id">{t('admin.product_field_category')}</Label>
          <Select value={values.category_id ?? ''} onValueChange={(v) => set('category_id', v)}>
            <SelectTrigger id="category_id" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {orderedCategories(categories).map(({ category: c, label }) => <SelectItem key={c.id} value={c.id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="brand_id">{t('admin.product_field_brand')}</Label>
          <BrandPicker
            id="brand_id"
            value={values.brand_id ?? 'none'}
            onChange={(v) => set('brand_id', (v === 'none' ? null : v) as any)}
            brands={brands}
            onBrandCreated={onBrandCreated}
            leading={[{ value: 'none', label: t('admin.product_field_brand_none') }]}
            className="mt-1.5"
          />
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

      <HsClassifier
        nameFr={values.name_fr ?? ''} nameEn={values.name_en ?? ''}
        descriptionFr={values.description_fr ?? null} descriptionEn={values.description_en ?? null}
        current={values.hs_code ?? null}
        onApply={(code) => set('hs_code', code)}
      />

      <ProductImageSlot
        slug={values.slug_fr ?? values.slug_en ?? ''}
        url={values.image_url ?? null}
        onChange={(u) => set('image_url', u)}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-luna-navy">{t('admin.product_seo_section')}</h3>
        <BilingualPair
          label={t('admin.product_field_meta_title')}
          labelFr="Français" labelEn="English"
          fr={values.meta_title_fr ?? ''} en={values.meta_title_en ?? ''}
          onFr={(v) => set('meta_title_fr', v || null)} onEn={(v) => set('meta_title_en', v || null)}
          kind="input"
        />
        <BilingualPair
          label={t('admin.product_field_meta_description')}
          labelFr="Français" labelEn="English"
          fr={values.meta_description_fr ?? ''} en={values.meta_description_en ?? ''}
          onFr={(v) => set('meta_description_fr', v || null)} onEn={(v) => set('meta_description_en', v || null)}
          kind="textarea" rows={3}
        />
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

/**
 * Product photo slot — upload button + preview + remove. Uploads to the
 * product-images Storage bucket, stores the returned public URL in
 * products.image_url. A URL text input stays available for admins who
 * want to paste an already-hosted URL.
 */
function ProductImageSlot({
  slug, url, onChange,
}: { slug: string; url: string | null; onChange: (u: string | null) => void }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxWidth: 1200, quality: 0.85 });
      const newUrl = await uploadProductImage(slug, optimized);
      onChange(newUrl);
      toast.success(t('admin_content.saved'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[product-image] upload failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setUploading(false); }
  };

  return (
    <div>
      <Label className="text-luna-navy">{t('admin.product_field_image_url')}</Label>
      <div className="mt-1.5 flex flex-wrap items-start gap-4">
        <div className="w-40 h-40 rounded-md border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
          {url ? (
            <img src={url} alt="" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400 text-center px-2">{t('admin_blog.no_image')}</span>
          )}
        </div>
        <div className="flex-1 min-w-[200px] space-y-2">
          <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-3 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? t('admin_blog.uploading') : t('admin_blog.upload_image')}
            <input type="file" className="hidden" accept="image/*" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {url && (
            <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50"
              onClick={() => onChange(null)}>
              <Trash2 className="h-3.5 w-3.5" />
              {t('admin_blog.remove_image')}
            </Button>
          )}
          <Input
            value={url ?? ''} onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://…"
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Two side-by-side slug inputs (FR + EN) with per-side auto-fill from the
 * matching-language product name and a DeepL translate button that fills
 * the OTHER side from the current title. Same pattern as the blog form.
 */
/**
 * HS-code suggestion box. Runs the local classifier on product name +
 * description; shows the suggested code + label + confidence and asks for
 * confirmation before applying. Never overwrites an existing code silently.
 */
function HsClassifier({
  nameFr, nameEn, descriptionFr, descriptionEn, current, onApply,
}: {
  nameFr: string; nameEn: string;
  descriptionFr: string | null; descriptionEn: string | null;
  current: string | null;
  onApply: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [suggestion, setSuggestion] = useState<HsSuggestion | null | 'none'>(null);

  const run = () => {
    const s = suggestHsCode(nameFr, nameEn, descriptionFr, descriptionEn);
    setSuggestion(s ?? 'none');
  };

  const alreadyThatCode = suggestion && suggestion !== 'none' && current === suggestion.code;
  const conflict = suggestion && suggestion !== 'none' && current && current !== suggestion.code;

  return (
    <div className="rounded-xl border-2 border-dashed border-luna-blue/30 bg-luna-cyan/5 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-luna-navy inline-flex items-center gap-1.5">
            <Wand2 className="h-4 w-4" />
            {t('admin.hs_detect_title')}
          </div>
          <p className="mt-1 text-xs text-slate-600 max-w-xl">{t('admin.hs_detect_intro')}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={run} disabled={!nameFr.trim() && !nameEn.trim()}>
          <Wand2 className="h-3.5 w-3.5" />
          {t('admin.hs_detect_run')}
        </Button>
      </div>

      {suggestion === 'none' && (
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          {t('admin.hs_no_match')}
        </div>
      )}

      {suggestion && suggestion !== 'none' && (
        <div className="mt-3 rounded-md bg-white border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold inline-flex items-center gap-1.5">
                {t('admin.hs_suggestion')}
                <ConfidencePill level={suggestion.confidence} />
              </div>
              <div className="mt-1 font-mono text-lg text-luna-navy">{suggestion.code}</div>
              <div className="text-sm text-slate-700">{suggestion.labelFr}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t('admin.hs_matched')}: <span className="italic">{suggestion.matched.join(', ')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {alreadyThatCode ? (
                <span className="text-xs text-green-700 font-medium inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  {t('admin.hs_already_applied')}
                </span>
              ) : (
                <Button type="button" size="sm" variant="navy" onClick={() => onApply(suggestion.code)}>
                  <Check className="h-3.5 w-3.5" />
                  {conflict ? t('admin.hs_replace') : t('admin.hs_apply')}
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {conflict && (
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {t('admin.hs_conflict', { current })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ConfidencePill({ level }: { level: HsSuggestion['confidence'] }) {
  const { t } = useTranslation();
  const style =
    level === 'high'   ? 'bg-green-100 text-green-800' :
    level === 'medium' ? 'bg-luna-cyan/20 text-luna-navy' :
                         'bg-amber-100 text-amber-900';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', style)}>
      {t(`admin.hs_confidence_${level}`)}
    </span>
  );
}

function ProductSlugsPair({
  slugFr, slugEn, titleFr, titleEn, onFr, onEn,
}: {
  slugFr: string; slugEn: string; titleFr: string; titleEn: string;
  onFr: (v: string) => void; onEn: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'fr2en' | 'en2fr' | null>(null);

  const translate = async (direction: 'fr2en' | 'en2fr') => {
    const sourceTitle = direction === 'fr2en' ? titleFr : titleEn;
    if (!sourceTitle.trim()) return;
    setBusy(direction);
    try {
      const target = direction === 'fr2en' ? 'en' : 'fr';
      const from   = direction === 'fr2en' ? 'fr' : 'en';
      const res = await translateText(sourceTitle, target, from);
      const s = slugify(res.translation);
      if (direction === 'fr2en') onEn(s); else onFr(s);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[translate-slug] failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(null); }
  };

  return (
    <div>
      <Label className="text-luna-navy">{t('admin.product_field_slugs')}</Label>
      <p className="mt-1 text-xs text-slate-500">{t('admin.product_field_slugs_hint')}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500">FR — /achat-envoi/…</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={!titleFr.trim()}
                onClick={() => onFr(slugify(titleFr))} title={t('admin.product_slug_from_title')}>
                {t('admin.product_slug_from_name')}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy !== null || !titleEn.trim()}
                onClick={() => translate('en2fr')}>
                <Languages className="h-3 w-3" />
                {busy === 'en2fr' ? '…' : t('admin_blog.slug_from_title_en')}
              </Button>
            </div>
          </div>
          <Input value={slugFr} onChange={(e) => onFr(e.target.value)} required className="font-mono text-sm" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500">EN — /en/shop-and-ship/…</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={!titleEn.trim()}
                onClick={() => onEn(slugify(titleEn))} title={t('admin.product_slug_from_title')}>
                {t('admin.product_slug_from_name')}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy !== null || !titleFr.trim()}
                onClick={() => translate('fr2en')}>
                <Languages className="h-3 w-3" />
                {busy === 'fr2en' ? '…' : t('admin_blog.slug_from_title_fr')}
              </Button>
            </div>
          </div>
          <Input value={slugEn} onChange={(e) => onEn(e.target.value)} required className="font-mono text-sm" />
        </div>
      </div>
    </div>
  );
}

// ─── CSV import ────────────────────────────────────────────────────────────
//
// raw CSV row → import profile (store, category mapping, cleaning — see
// lib/import-profile) → admin overrides (EN translation) → validateRow
// (structure + shared eligibility filter) → import. A profile is recognised
// by the file's column set, so the next file from the same source (e.g. the
// Eloshon Scraper's Lidl export) is prepared automatically.

type ImportRow = {
  row: number;
  /** Index in the parsed file (key for per-row admin choices). */
  index: number;
  /** Row after profile + admin fixes — what is validated and imported. */
  raw: Record<string, string>;
  errors: ImportIssue[];
  /** Eligibility verdict (accepted / excluded / to_verify) from the shared,
   *  store-agnostic filter — computed for every row regardless of structural
   *  validity, so the admin sees why a row will or won't be imported. */
  eligibility: EligibilityResult;
  /** Resolved store from store_slug (null if the column is empty). */
  storeId: string | null;
  /** store_slug was given but doesn't match any known store → row is treated
   *  as "to verify" and NOT imported (never auto-creates a store). */
  storeUnknown: boolean;
  /** What the import profile did to / found in this row. */
  profiled: ProfiledRow;
  /** Skipped by a profile mapping or by the admin (null = not skipped). */
  skip: string | null;
  /** English name is a copy of the French one. */
  untranslated: boolean;
  filled: ValidatedRow['filled'];
  data?: ImportRowData;
};

/** Per-row admin fixes made in the preview (single row or in bulk). */
type RowOverride = {
  name_en?: string; description_en?: string;
  category_slug?: string; store_slug?: string;
  /** Luna product type — a scraper's own value ("Alcool") is unknown to the eligibility filter. */
  product_type?: string;
  /** null = explicitly no brand. */
  brand_id?: string | null;
  skip?: boolean;
};
type MappingDraft = { prefix: string; action: 'map' | 'skip'; category_id: string; product_type: string };
type RowResult = { ok: boolean; detail: string };
type FileInfo = { delimiter: CsvDelimiter; encoding: string; unwrapped: number; eloshon: boolean };
type RowFilter = 'all' | 'errors' | 'accepted' | 'to_verify' | 'excluded' | 'skipped';
/** Issue groups shown in the "problems" panel (validation codes). */
type IssueKey = ImportIssue['code'];

/** Category of the rows Luna cannot place: imported there, sorted in bulk later. */
const FALLBACK_CATEGORY_SLUG = 'a-classer';
/** Eligibility exclusions an admin may override with "accept fresh products". Frozen stays excluded. */
const FRESH_EXCLUSION_CODES = new Set(['excluded_meat_seafood', 'excluded_dairy_fresh', 'excluded_refrigerated', 'excluded_cold_chain', 'excluded_fresh', 'excluded_produce_fresh', 'excluded_bakery']);
/** Bulk-fix bar of the import preview, nothing chosen ('' / 'nochange' = leave as is). */
const BULK_ROW_EMPTY = { category_slug: '', product_type: '', store_slug: '', brand: 'nochange' };
const DELIMITER_LABEL: Record<CsvDelimiter, string> = { ',': ',', ';': ';', '\t': 'tab', '|': '|' };

function CsvImport({ categories, brands, onDone, onBrandCreated }: { categories: ProductCategory[]; brands: Brand[]; onDone: () => void; onBrandCreated: (b: Brand) => void }) {
  const { t, i18n } = useTranslation();
  const [productTypes, setProductTypes] = useState<ProductTypeDef[]>(BUILTIN_PRODUCT_TYPES);
  const addProductType = (x: ProductTypeDef) => setProductTypes((l) => withProductType(l, x));
  const customTypes = useMemo(() => productTypes.filter((x) => !isBuiltinType(x.slug)), [productTypes]);
  const typeLabel = (slug: string | null | undefined) => {
    const x = productTypes.find((p) => p.slug === slug);
    return x ? productTypeLabel(x, i18n.language) : slug ?? '';
  };
  /** What Luna understood of the file's columns (shown above the preview). */
  const [recognition, setRecognition] = useState<ColumnRecognition | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  // Safety default: imported products land as drafts (is_active=false) for
  // manual review before they appear on the Courses page.
  const [importAsDraft, setImportAsDraft] = useState(true);

  const [profiles, setProfiles] = useState<ImportProfile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [newProfile, setNewProfile] = useState({ name: '', store_id: '' });
  const [drafts, setDrafts] = useState<Record<string, MappingDraft>>({});
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({});
  const [forced, setForced] = useState<Set<number>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [rowFilter, setRowFilter] = useState<RowFilter>('all');
  // Admin decision: fresh / chilled products (charcuterie, fish, ready meals…)
  // are excluded by the eligibility filter; when ticked they can be forced in
  // bulk like "to verify" rows. Off by default — the filter stays the rule.
  const [allowFresh, setAllowFresh] = useState(false);
  // "Prices in cents" without a saved profile (with one it is a profile rule).
  const [centsNoProfile, setCentsNoProfile] = useState(false);
  // Bulk category mapping (keyed by group path).
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set());
  const [bulkMap, setBulkMap] = useState<{ category_id: string; product_type: string }>({ category_id: '', product_type: 'food' });
  // Bulk fixes on selected preview rows.
  const [bulkRow, setBulkRow] = useState(BULK_ROW_EMPTY);
  const [translating, setTranslating] = useState(false);
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchStores().then(setStores); void fetchImportProfiles().then(setProfiles); void fetchProductTypes().then(setProductTypes);
  }, []);
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const profileStoreSlug = profile?.store_id ? stores.find((s) => s.id === profile.store_id)?.slug ?? null : null;
  const categorySlugById = useMemo(() => new Map(categories.map((c) => [c.id, c.slug])), [categories]);
  const categoryBySlug = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories]);
  const signature = useMemo(() => headerSignature(headers), [headers]);
  const diagnostic = useMemo(() => (headers.length ? diagnoseFile(headers) : null), [headers]);
  const rules = { ...DEFAULT_RULES, ...(profile?.rules ?? {}) };
  const priceInCents = profile ? !!rules.price_in_cents : centsNoProfile;
  const centsSuspected = useMemo(() => looksLikeCents(rawRows.map((r) => r.price)), [rawRows]);

  useEffect(() => {
    if (!profileId) { setMappings([]); return; }
    void fetchCategoryMappings(profileId).then(setMappings);
  }, [profileId]);

  // Re-validated whenever categories, stores, the profile, its mappings or
  // an admin fix change, so one action updates every row at once.
  const rows = useMemo(() => rawRows.map((raw, i): ImportRow => {
    const profiled = applyImportProfile(raw, profile ?? { rules: { price_in_cents: centsNoProfile } }, mappings, { storeSlug: profileStoreSlug, categorySlugById });
    const o = overrides[i] ?? {};
    const merged = { ...profiled.raw };
    if (o.name_en?.trim()) {
      merged.name_en = o.name_en.trim();
      // A copied FR slug becomes a real EN slug once the name is translated.
      if (!merged.slug_en || merged.slug_en === merged.slug_fr) merged.slug_en = slugifyImport(merged.name_en);
    }
    if (o.description_en !== undefined) merged.description_en = o.description_en;
    if (o.category_slug) merged.category_slug = o.category_slug;
    if (o.store_slug) merged.store_slug = o.store_slug;
    if (o.product_type) merged.product_type = o.product_type;
    const v = validateImportRow(merged, categories, stores, customTypes, FALLBACK_CATEGORY_SLUG);
    const errors = [...v.errors];
    if (profiled.priceIssue) errors.push({ code: profiled.priceIssue.code, csv: profiled.priceIssue.csv, ref: profiled.priceIssue.ref });
    let data = errors.length ? undefined : v.data;
    if (data) {
      const brandId = o.brand_id !== undefined ? o.brand_id
        : (matchBrandName(merged.brand, brands) ?? detectBrandInText(data.name_fr, brands))?.id ?? null;
      if (brandId) data = { ...data, brand_id: brandId };
    }
    const skip = profiled.skip ?? (o.skip ? t('admin.imp_skipped_by_admin') : null);
    const untranslated = !o.name_en?.trim() && (profiled.untranslated || v.filled.includes('name_en'));
    return {
      row: i + 2, index: i, raw: merged, errors, eligibility: v.eligibility, storeId: v.storeId, storeUnknown: v.storeUnknown,
      profiled, skip, untranslated, filled: v.filled, data,
    };
  }), [rawRows, profile, centsNoProfile, mappings, profileStoreSlug, categorySlugById, overrides, categories, brands, stores, customTypes, t]);

  const resetRowState = () => {
    setOverrides({}); setForced(new Set()); setResults({}); setDrafts({}); setSelectedRows(new Set()); setPickedGroups(new Set());
    setRowFilter('all'); setCentsNoProfile(false);
  };

  const onFile = async (file: File) => {
    try {
      const { text, encoding } = decodeCsvBytes(await file.arrayBuffer());
      const csv = parseImportCsv(text);
      // Labelled columns ("Nom", "Prix", "Marque"…) → Luna's, values cleaned,
      // store read from the product link, non-product rows dropped.
      const rec = recognizeColumns(csv.headers, csv.rows, stores);
      const parsed = { ...csv, headers: rec.headers, rows: rec.rows };
      const eloshon = detectSourceFormat(parsed.headers) === 'eloshon';
      setRecognition(rec);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setFileInfo({ delimiter: parsed.delimiter, encoding, unwrapped: parsed.unwrapped, eloshon });
      resetRowState();
      if (parsed.unwrapped) toast.info(t('admin.imp_unwrapped', { count: parsed.unwrapped }));
      // Recognise the source: same columns, else the Eloshon profile of the file's store.
      const fileStore = resolveStore(parsed.rows.find((r) => r.store_slug?.trim())?.store_slug, stores);
      const match = pickProfile(parsed.headers, fileStore?.id ?? null, profiles);
      setProfileId(match?.profile.id ?? null);
      if (match) toast.success(t('admin.imp_profile_detected', { name: match.profile.name }));
      setNewProfile({
        name: eloshon ? `Eloshon Scraper — ${fileStore?.name ?? parsed.rows[0]?.store_slug ?? ''}`.replace(/ — $/, '') : '',
        store_id: fileStore?.id ?? '',
      });
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    }
  };

  const isSkipped = (r: ImportRow) => !!r.skip;
  const isFreshExclusion = (r: ImportRow) => r.eligibility.status === 'excluded' && FRESH_EXCLUSION_CODES.has(r.eligibility.code);
  const canForce = (r: ImportRow) => r.errors.length === 0 && !isSkipped(r)
    && (r.eligibility.status === 'to_verify' || (allowFresh && isFreshExclusion(r)));
  // A row imports only if it is structurally valid, not skipped, its store
  // (when given) is known, and it is either accepted by the eligibility
  // filter or explicitly forced by the admin.
  const importable = rows.filter((r) => r.errors.length === 0 && r.data && !isSkipped(r)
    && (r.eligibility.status === 'accepted' || (forced.has(r.index) && canForce(r))));
  const importableSet = new Set(importable.map((r) => r.index));
  const rejected = rows.filter((r) => r.errors.length === 0 && !isSkipped(r) && !importableSet.has(r.index));

  const rowStatus = (r: ImportRow): 'accepted' | 'excluded' | 'to_verify' => r.eligibility.status;
  const rowReason = (r: ImportRow): string => r.skip ?? r.eligibility.reason;
  const issueText = (e: ImportIssue) => t(`admin.imp_issue_${e.code}`, { value: e.value ?? '', csv: e.csv, ref: e.ref });
  const matchesFilter = (r: ImportRow): boolean => {
    switch (rowFilter) {
      case 'all': return true;
      case 'skipped': return isSkipped(r);
      case 'errors': return !isSkipped(r) && r.errors.length > 0;
      default: return !isSkipped(r) && r.errors.length === 0 && r.eligibility.status === rowFilter;
    }
  };
  const visibleRows = rows.filter(matchesFilter);

  // Rows grouped by problem — each group can be selected (then fixed with the
  // bulk bar) or skipped in one click.
  const issueGroups = (() => {
    const m = new Map<IssueKey, { sample: string; indices: number[] }>();
    const add = (key: IssueKey, sample: string, index: number) => {
      const g = m.get(key) ?? { sample, indices: [] };
      g.indices.push(index);
      m.set(key, g);
    };
    for (const r of rows) {
      if (r.skip) continue;
      for (const e of r.errors) add(e.code, issueText(e), r.index);
    }
    return [...m.entries()].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.indices.length - a.indices.length);
  })();
  // Imported anyway, to complete in bulk later (category "À classer", no store).
  const laterGroups = (() => {
    const fallback = rows.filter((r) => !r.skip && !r.errors.length && r.filled.includes('category_fallback')).map((r) => r.index);
    const guessed = rows.filter((r) => !r.skip && !r.errors.length && r.filled.includes('category_guessed')).map((r) => r.index);
    const noStore = rows.filter((r) => !r.skip && !r.errors.length && r.storeUnknown);
    return [
      { key: 'category_fallback', indices: fallback, text: t('admin.imp_later_category', { count: fallback.length }) },
      { key: 'category_guessed', indices: guessed, text: t('admin.imp_later_guessed', { count: guessed.length }) },
      { key: 'store_unknown', indices: noStore.map((r) => r.index),
        text: t('admin.imp_later_store', { count: noStore.length, value: [...new Set(noStore.map((r) => r.raw.store_slug?.trim()))].slice(0, 3).join(', ') }) },
    ].filter((g) => g.indices.length > 0);
  })();

  // Selection is kept by row index; "select all" acts on the visible rows.
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.index));
  const toggleRowSelected = (index: number, v: boolean) => setSelectedRows((prev) => {
    const next = new Set(prev);
    if (v) next.add(index); else next.delete(index);
    return next;
  });
  const toggleAllVisible = (v: boolean) => setSelectedRows((prev) => {
    const next = new Set(prev);
    visibleRows.forEach((r) => { if (v) next.add(r.index); else next.delete(r.index); });
    return next;
  });
  const selected = rows.filter((r) => selectedRows.has(r.index));
  // Among the selected rows, only those `canForce` actually gets added to
  // `forced` — never bypasses eligibility/validation/store checks.
  const forceableSelected = selected.filter(canForce);
  const forceableAll = rows.filter((r) => canForce(r) && !forced.has(r.index));
  const addForced = (list: ImportRow[]) => setForced((prev) => {
    const next = new Set(prev);
    list.forEach((r) => next.add(r.index));
    return next;
  });

  /** Apply the same fix to several rows. */
  const patchRows = (indices: Iterable<number>, patch: RowOverride) => setOverrides((prev) => {
    const next = { ...prev };
    for (const i of indices) next[i] = { ...next[i], ...patch };
    return next;
  });
  const applyBulkRows = () => {
    const patch: RowOverride = {};
    if (bulkRow.category_slug) patch.category_slug = bulkRow.category_slug;
    if (bulkRow.store_slug) patch.store_slug = bulkRow.store_slug;
    if (bulkRow.product_type) patch.product_type = bulkRow.product_type;
    if (bulkRow.brand !== 'nochange') patch.brand_id = bulkRow.brand === 'none' ? null : bulkRow.brand;
    if (Object.keys(patch).length === 0) { toast.error(t('admin.imp_bulk_nothing')); return; }
    patchRows(selectedRows, patch);
    toast.success(t('admin.imp_bulk_applied', { count: selectedRows.size }));
    setBulkRow(BULK_ROW_EMPTY);
  };
  /** Category suggested from the product name (same rules as "Trier les catégories"). */
  const suggestCategories = () => {
    const allowed = new Set(categories.filter((c) => c.parent_id).map((c) => c.slug));
    const next: Record<number, RowOverride> = {};
    for (const r of selected) {
      if (r.raw.category_slug?.trim() && categoryBySlug.has(r.raw.category_slug.trim())) continue;
      const slug = detectCategorySlug(r.raw.name_fr ?? '', allowed);
      if (slug) next[r.index] = { category_slug: slug };
    }
    const n = Object.keys(next).length;
    setOverrides((prev) => {
      const out = { ...prev };
      for (const [i, p] of Object.entries(next)) out[Number(i)] = { ...out[Number(i)], ...p };
      return out;
    });
    if (n) toast.success(t('admin.imp_suggest_done', { count: n }));
    else toast.info(t('admin.imp_suggest_none'));
  };

  // Unmapped source categories, grouped per real category path (the product
  // name some scrapers append is dropped) — one mapping covers the group.
  const unmappedGroups = useMemo(() => {
    const m = new Map<string, { count: number; samples: string[] }>();
    for (const r of rows) {
      if (!r.profiled.unmapped || r.skip || r.raw.category_slug?.trim()) continue;
      const sc = r.raw.source_category?.trim();
      if (!sc) continue;
      const key = categoryGroupKey(sc, r.raw.name_fr);
      const g = m.get(key) ?? { count: 0, samples: [] };
      g.count++;
      if (g.samples.length < 3) g.samples.push(r.raw.name_fr ?? '');
      m.set(key, g);
    }
    return [...m.entries()].map(([key, g]) => ({ key, ...g })).sort((a, b) => a.key.localeCompare(b.key));
  }, [rows]);
  const unmappedCats = unmappedGroups.map((g) => g.key);
  const untranslated = rows.filter((r) => r.untranslated && !isSkipped(r) && r.eligibility.status !== 'excluded');

  const draftFor = (sc: string): MappingDraft =>
    drafts[sc] ?? { prefix: sc, action: 'map', category_id: '', product_type: '' };
  const setDraft = (sc: string, patch: Partial<MappingDraft>) =>
    setDrafts((d) => ({ ...d, [sc]: { ...draftFor(sc), ...patch } }));

  const saveMapping = async (sc: string) => {
    if (!profile) return;
    const d = draftFor(sc);
    if (d.action === 'map' && (!d.category_id || !d.product_type)) { toast.error(t('common.required')); return; }
    setBusy(true);
    try {
      const saved = await saveCategoryMapping({
        profile_id: profile.id, source_category: d.prefix, action: d.action,
        category_id: d.action === 'map' ? d.category_id : null,
        product_type: d.action === 'map' ? (d.product_type as ProductType) : null,
      });
      setMappings((ms) => [...ms.filter((m) => m.source_category !== saved.source_category), saved]);
      toast.success(t('admin.imp_map_saved'));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const removeMapping = async (m: CategoryMapping) => {
    if (!window.confirm(t('admin.imp_map_delete_confirm', { path: m.source_category }))) return;
    try { await deleteCategoryMapping(m.id); setMappings((ms) => ms.filter((x) => x.id !== m.id)); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
  };

  /** Save one mapping per ticked group in one go. */
  const saveMappingsBulk = async (action: 'map' | 'skip') => {
    if (!profile || pickedGroups.size === 0) return;
    if (action === 'map' && (!bulkMap.category_id || !bulkMap.product_type)) { toast.error(t('common.required')); return; }
    setBusy(true);
    const saved: CategoryMapping[] = [];
    try {
      for (const key of pickedGroups) {
        saved.push(await saveCategoryMapping({
          profile_id: profile.id, source_category: key, action,
          category_id: action === 'map' ? bulkMap.category_id : null,
          product_type: action === 'map' ? (bulkMap.product_type as ProductType) : null,
        }));
      }
      toast.success(t('admin.imp_map_bulk_saved', { count: saved.length }));
      setPickedGroups(new Set());
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally {
      if (saved.length) setMappings((ms) => [...ms.filter((m) => !saved.some((x) => x.source_category === m.source_category)), ...saved]);
      setBusy(false);
    }
  };

  const createProfile = async () => {
    const name = newProfile.name.trim();
    if (!name) { toast.error(t('common.required')); return; }
    setBusy(true);
    try {
      const p = await createImportProfile({
        slug: slugifyImport(name) || `profil-${Date.now()}`, name, header_signature: signature,
        store_id: newProfile.store_id || null, rules: { ...DEFAULT_RULES, price_in_cents: centsNoProfile },
      });
      setProfiles((ps) => [...ps, p]);
      setProfileId(p.id);
      toast.success(t('admin.imp_profile_created'));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const patchProfile = async (patch: Partial<Pick<ImportProfile, 'store_id' | 'rules'>>) => {
    if (!profile) return;
    try {
      await updateImportProfile(profile.id, patch);
      setProfiles((ps) => ps.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
  };
  const setPriceInCents = (v: boolean) => {
    if (profile) void patchProfile({ rules: { ...rules, price_in_cents: v } });
    else setCentsNoProfile(v);
  };

  /** DeepL FR → EN for the given rows (names, and descriptions when present). */
  const translateRows = async (list: ImportRow[]) => {
    if (list.length === 0) return;
    setTranslating(true);
    try {
      const names = list.map((r) => r.raw.name_fr);
      const descs = list.map((r) => r.raw.description_fr ?? '');
      const withDesc = descs.map((d, i) => [d, i] as const).filter(([d]) => d.trim());
      const [n, d] = await Promise.all([
        translateText(names, 'en', 'fr'),
        withDesc.length ? translateText(withDesc.map(([x]) => x), 'en', 'fr') : Promise.resolve({ translations: [] as string[] }),
      ]);
      setOverrides((prev) => {
        const next = { ...prev };
        list.forEach((r, i) => { next[r.index] = { ...next[r.index], name_en: n.translations[i] ?? '' }; });
        withDesc.forEach(([, i], k) => {
          const r = list[i];
          next[r.index] = { ...next[r.index], description_en: d.translations[k] ?? '' };
        });
        return next;
      });
      toast.success(t('admin.imp_translated', { count: list.length }));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setTranslating(false); }
  };

  const doImport = async () => {
    if (importable.length === 0) { toast.info(t('admin.products_import_no_valid')); return; }
    // Importing as live (not draft) makes products immediately visible —
    // confirm before doing it.
    if (!importAsDraft &&
        !window.confirm(t('admin.products_import_confirm_live', { count: importable.length }))) return;
    const active = !importAsDraft;
    setImporting(true);
    const res: Record<number, RowResult> = {};
    let created = 0, updated = 0, failed = 0;
    for (const r of importable) {
      const isForced = r.eligibility.status !== 'accepted';
      const sourceId = r.raw.source_product_id?.trim() || null;
      try {
        // Re-import of the same store product = refresh price/image, never a
        // duplicate, and never overwrite texts an admin may have edited.
        const existing = r.storeId && sourceId ? await findProductBySource(r.storeId, sourceId) : null;
        let productId: string;
        if (existing) {
          await updateProductFromSource(existing.id, { price: r.data!.price, image_url: r.data!.image_url, weight_kg: r.data!.weight_kg });
          productId = existing.id;
        } else {
          const prod = await upsertProduct({
            ...r.data!,
            is_active: active,
            store_id: r.storeId,
            is_alcoholic: r.eligibility.is_alcoholic,
            requires_cold_chain: isFreshExclusion(r) ? true : r.eligibility.requires_cold_chain,
          });
          productId = prod.id;
        }
        await upsertProductSource({
          product_id: productId,
          source_url: r.raw.source_url?.trim() || null,
          source_product_id: sourceId,
          source_category: r.raw.source_category?.trim() || null,
          eligibility_status: isForced ? 'forced' : 'accepted',
          eligibility_reason: isForced ? `importé sur décision admin — filtre : ${r.eligibility.reason}` : r.eligibility.reason,
        });
        if (existing) { updated++; res[r.index] = { ok: true, detail: t('admin.imp_result_updated') }; }
        else { created++; res[r.index] = { ok: true, detail: t('admin.imp_result_created') }; }
      } catch (err) {
        failed++;
        const msg = errorMessage(err, t('common.error_generic'));
        res[r.index] = { ok: false, detail: /duplicate key|unique/i.test(msg) ? t('admin.imp_err_slug_taken') : msg };
      }
    }
    setImporting(false);
    setResults(res);
    const summary = t('admin.imp_summary', { created, updated, failed });
    if (failed) toast.error(summary); else toast.success(summary);
    onDone();
  };

  const downloadRejected = () => {
    const csv = rejectedRowsToCsv(rejected.map((r) => ({
      raw: r.raw,
      status: rowStatus(r),
      reason: rowReason(r),
    })));
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'luna-import-a-verifier.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm';
  // "Famille › Sous-catégorie" labels, families A→Z then their children A→Z.
  const categoryOptions = useMemo(
    () => orderedCategories(categories).map(({ category, label }) => ({ id: category.id, slug: category.slug, label, depth: category.parent_id ? 1 : 0 })),
    [categories],
  );
  const categoryLabel = useMemo(() => new Map(categoryOptions.map((c) => [c.slug, c.label])), [categoryOptions]);
  const counts = {
    all: rows.length,
    errors: rows.filter((r) => !isSkipped(r) && r.errors.length > 0).length,
    accepted: rows.filter((r) => !isSkipped(r) && !r.errors.length && r.eligibility.status === 'accepted').length,
    to_verify: rows.filter((r) => !isSkipped(r) && !r.errors.length && r.eligibility.status === 'to_verify').length,
    excluded: rows.filter((r) => !isSkipped(r) && !r.errors.length && r.eligibility.status === 'excluded').length,
    skipped: rows.filter(isSkipped).length,
  };
  // Once the last row is fixed, show everything again instead of an empty table.
  useEffect(() => { if (rowFilter === 'errors' && counts.errors === 0) setRowFilter('all'); }, [rowFilter, counts.errors]);

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-slate-600 mb-4">{t('admin.products_import_intro')}</p>
      <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-4 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
        {t('admin.products_import_choose')}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
      </label>

      {fileInfo && (
        <p className="mt-3 text-xs text-slate-500">
          {t('admin.imp_file_info', {
            rows: rawRows.length, columns: headers.length, delimiter: DELIMITER_LABEL[fileInfo.delimiter],
            encoding: fileInfo.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1252',
          })}
          {fileInfo.eloshon && ` · ${t('admin.imp_file_eloshon')}`}
          {fileInfo.unwrapped > 0 && ` · ${t('admin.imp_file_unwrapped', { count: fileInfo.unwrapped })}`}
        </p>
      )}

      {recognition && (recognition.renamed.length > 0 || recognition.storeFromLink > 0 || recognition.dropped.not_a_product > 0
        || recognition.specsAsDescription > 0 || recognition.foreignLanguage) && (
        <section aria-labelledby="imp-columns" className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <h3 id="imp-columns" className="font-semibold">{t('admin.imp_columns_title')}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {recognition.renamed.length > 0 && (
              <li>{t('admin.imp_columns_renamed', { list: recognition.renamed.map((x) => `${x.from} → ${x.to}`).join(' · ') })}</li>
            )}
            {recognition.storeFromLink > 0 && <li>{t('admin.imp_columns_store_link', { count: recognition.storeFromLink })}</li>}
            {recognition.specsAsDescription > 0 && <li>{t('admin.imp_columns_specs', { count: recognition.specsAsDescription })}</li>}
            {recognition.dropped.not_a_product > 0 && <li>{t('admin.imp_columns_dropped', { count: recognition.dropped.not_a_product })}</li>}
            {recognition.foreignLanguage && (
              <li className="text-amber-900">{t('admin.imp_columns_language', { lang: recognition.foreignLanguage.toUpperCase() })}</li>
            )}
          </ul>
        </section>
      )}

      {laterGroups.length > 0 && !diagnostic && (
        <section aria-labelledby="imp-later" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <h3 id="imp-later" className="font-semibold text-luna-navy">{t('admin.imp_later_title')}</h3>
          <ul className="mt-2 space-y-1">
            {laterGroups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[16rem] text-slate-700">{g.text}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRows(new Set(g.indices))}>
                  {t('admin.imp_issue_select', { count: g.indices.length })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {diagnostic && (
        <section role="alert" className="mt-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <h3 className="font-semibold">{t('admin.imp_diag_title')}</h3>
          <p className="mt-1">{t('admin.imp_diag_missing', { columns: diagnostic.missing.join(', ') })}</p>
          <p className="mt-1">{diagnostic.singleColumn ? t('admin.imp_diag_single_column') : t('admin.imp_diag_wrong_columns')}</p>
          <p className="mt-2 text-xs text-red-800 break-words">{t('admin.imp_diag_read', { columns: headers.slice(0, 12).join(' · ').slice(0, 300) })}</p>
        </section>
      )}

      {rawRows.length > 0 && !diagnostic && (
        <section aria-labelledby="imp-profile" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 id="imp-profile" className="font-semibold text-luna-navy">{t('admin.imp_profile_title')}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="imp-profile-select" className="text-slate-600">{t('admin.imp_profile_select')}</label>
            <select id="imp-profile-select" className={sel} value={profileId ?? ''} onChange={(e) => setProfileId(e.target.value || null)}>
              <option value="">{t('admin.imp_profile_none')}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.header_signature === signature ? ` — ${t('admin.imp_profile_matches')}` : ''}</option>
              ))}
            </select>
            {!profile && <span className="text-amber-700">{t('admin.imp_profile_none_match')}</span>}
          </div>

          {!profile && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
              <div>
                <Label htmlFor="imp-new-name" className="text-xs">{t('admin.imp_profile_name')}</Label>
                <Input id="imp-new-name" value={newProfile.name} placeholder="Eloshon Scraper — Lidl"
                  onChange={(e) => setNewProfile((p) => ({ ...p, name: e.target.value }))} className="h-9 w-64" />
              </div>
              <div>
                <Label htmlFor="imp-new-store" className="text-xs">{t('admin.imp_profile_store')}</Label>
                <select id="imp-new-store" className={cn(sel, 'block')} value={newProfile.store_id}
                  onChange={(e) => setNewProfile((p) => ({ ...p, store_id: e.target.value }))}>
                  <option value="">{t('admin.imp_profile_store_from_file')}</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
                </select>
              </div>
              <Button type="button" variant="navy" size="sm" onClick={createProfile} disabled={busy}>{t('admin.imp_profile_create')}</Button>
              <p className="basis-full text-xs text-slate-500">{t('admin.imp_profile_optional')}</p>
            </div>
          )}

          {profile && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="text-sm">
                <Label htmlFor="imp-store" className="text-xs">{t('admin.imp_profile_store')}</Label>
                <select id="imp-store" className={cn(sel, 'block')} value={profile.store_id ?? ''}
                  onChange={(e) => void patchProfile({ store_id: e.target.value || null })}>
                  <option value="">{t('admin.imp_profile_store_from_file')}</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
                </select>
              </div>
              <fieldset className="text-sm space-y-1">
                <legend className="text-xs font-medium text-slate-600">{t('admin.imp_profile_rules')}</legend>
                {([
                  ['strip_description_price_suffix', 'admin.imp_rule_desc'],
                  ['fix_price_x1000', 'admin.imp_rule_price'],
                  ['price_in_cents', 'admin.imp_rule_cents'],
                  ['strip_slug_suffix', 'admin.imp_rule_slug'],
                  ['strip_generic_description', 'admin.imp_rule_generic_desc'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" checked={!!rules[k]} onChange={(e) => void patchProfile({ rules: { ...rules, [k]: e.target.checked } })} />
                    {t(label)}
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  {t('admin.imp_rule_max')}
                  <Input type="number" min={0} className="h-8 w-28" defaultValue={rules.max_price ?? ''}
                    onBlur={(e) => void patchProfile({ rules: { ...rules, max_price: e.target.value ? Number(e.target.value) : null } })} />
                </label>
              </fieldset>
            </div>
          )}
        </section>
      )}

      {centsSuspected && !priceInCents && !diagnostic && (
        <section role="status" className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[16rem] text-amber-900">{t('admin.imp_cents_hint', { sample: rawRows.find((r) => r.price?.trim())?.price ?? '' })}</p>
          <Button type="button" size="sm" variant="navy" onClick={() => setPriceInCents(true)}>{t('admin.imp_cents_apply')}</Button>
        </section>
      )}
      {priceInCents && !profile && (
        <p className="mt-2 text-xs text-slate-600">
          {t('admin.imp_cents_on')}{' '}
          <button type="button" className="underline" onClick={() => setPriceInCents(false)}>{t('admin.imp_cents_undo')}</button>
        </p>
      )}

      {unmappedCats.length > 0 && (
        <section aria-labelledby="imp-map" className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <h3 id="imp-map" className="font-semibold text-luna-navy">{t('admin.imp_mappings_title', { count: unmappedCats.length })}</h3>
          <p className="mt-1 text-xs text-slate-600">{profile ? t('admin.imp_mappings_intro') : t('admin.imp_need_profile')}</p>
          {profile && (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox"
                    checked={pickedGroups.size > 0 && pickedGroups.size === unmappedGroups.length}
                    onChange={(e) => setPickedGroups(e.target.checked ? new Set(unmappedCats) : new Set())} />
                  {t('admin.imp_map_pick_all', { count: unmappedGroups.length })}
                </label>
                <span className="text-xs text-slate-500">{t('admin.imp_map_picked', { count: pickedGroups.size })}</span>
                <select aria-label={t('admin.imp_map_category')} className={sel} value={bulkMap.category_id} onChange={(e) => setBulkMap((b) => ({ ...b, category_id: e.target.value }))}>
                  <option value="">{t('admin.imp_map_category')}…</option>
                  {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <ProductTypeSelect ariaLabel={t('admin.imp_map_type')} className={sel} value={bulkMap.product_type}
                  onChange={(v) => setBulkMap((b) => ({ ...b, product_type: v }))}
                  types={productTypes} onCreated={addProductType} placeholder={`${t('admin.imp_map_type')}…`} />
                <Button type="button" size="sm" variant="navy" disabled={busy || pickedGroups.size === 0} onClick={() => saveMappingsBulk('map')}>
                  {t('admin.imp_map_bulk_apply', { count: pickedGroups.size })}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || pickedGroups.size === 0} onClick={() => saveMappingsBulk('skip')}>
                  {t('admin.imp_map_bulk_skip', { count: pickedGroups.size })}
                </Button>
              </div>
              <ul className="mt-3 space-y-2">
                {unmappedGroups.map(({ key: sc, count, samples }) => {
                  const d = draftFor(sc);
                  return (
                    <li key={sc} className="rounded-xl bg-white p-3 text-sm">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={pickedGroups.has(sc)}
                          onChange={(e) => setPickedGroups((prev) => { const n = new Set(prev); if (e.target.checked) n.add(sc); else n.delete(sc); return n; })} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-xs text-slate-600 break-words">{sc}</span>
                          <span className="block text-xs text-slate-400">{t('admin.brand_auto_n_products', { count })} · {samples.join(' · ')}</span>
                        </span>
                      </label>
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        <select aria-label={t('admin.imp_map_level')} className={sel} value={d.prefix} onChange={(e) => setDraft(sc, { prefix: e.target.value })}>
                          {categoryPrefixes(sc).map((p) => <option key={p} value={p}>{p.split(' > ').slice(-1)[0]}{p === sc ? '' : ` (${t('admin.imp_map_parent')})`}</option>)}
                        </select>
                        <select aria-label={t('admin.imp_map_action')} className={sel} value={d.action} onChange={(e) => setDraft(sc, { action: e.target.value as 'map' | 'skip' })}>
                          <option value="map">{t('admin.imp_map_action_map')}</option>
                          <option value="skip">{t('admin.imp_map_action_skip')}</option>
                        </select>
                        {d.action === 'map' && (
                          <>
                            <select aria-label={t('admin.imp_map_category')} className={sel} value={d.category_id} onChange={(e) => setDraft(sc, { category_id: e.target.value })}>
                              <option value="">{t('admin.imp_map_category')}…</option>
                              {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                            <ProductTypeSelect ariaLabel={t('admin.imp_map_type')} className={sel} value={d.product_type}
                              onChange={(v) => setDraft(sc, { product_type: v })}
                              types={productTypes} onCreated={addProductType} placeholder={`${t('admin.imp_map_type')}…`} />
                          </>
                        )}
                        <Button type="button" size="sm" variant="navy" onClick={() => saveMapping(sc)} disabled={busy}>{t('admin.imp_map_save')}</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {profile && mappings.length > 0 && (
        <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-luna-navy">{t('admin.imp_mappings_saved_title', { count: mappings.length })}</summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {mappings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-mono text-xs text-slate-500 break-words flex-1 min-w-[16rem]">{m.source_category}</span>
                <span>{m.action === 'skip'
                  ? t('admin.imp_map_action_skip')
                  : `→ ${categories.find((c) => c.id === m.category_id)?.name_fr ?? '?'} · ${typeLabel(m.product_type)}`}</span>
                <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => removeMapping(m)} aria-label={t('admin.imp_map_delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {issueGroups.length > 0 && !diagnostic && (
        <section aria-labelledby="imp-issues" className="mt-4 rounded-2xl border border-red-200 bg-white p-4">
          <h3 id="imp-issues" className="font-semibold text-luna-navy">{t('admin.imp_issues_title', { count: counts.errors })}</h3>
          <p className="mt-1 text-xs text-slate-600">{t('admin.imp_issues_intro')}</p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {issueGroups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center gap-2 py-2">
                <span className="inline-flex min-w-[3rem] justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{g.indices.length}</span>
                <span className="flex-1 min-w-[16rem] text-slate-700">
                  {g.sample}
                  <span className="block text-xs text-slate-500">{t(`admin.imp_fix_${g.key}`)}</span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => { setSelectedRows(new Set(g.indices)); setRowFilter('errors'); }}>
                  {t('admin.imp_issue_select', { count: g.indices.length })}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => patchRows(g.indices, { skip: true })}>
                  {t('admin.imp_issue_skip', { count: g.indices.length })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length > 0 && !diagnostic && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-luna-navy">{t('admin.products_import_preview')}</h3>
            <select aria-label={t('admin.imp_filter_label')} className={sel} value={rowFilter} onChange={(e) => setRowFilter(e.target.value as RowFilter)}>
              {(['all', 'errors', 'accepted', 'to_verify', 'excluded', 'skipped'] as RowFilter[]).map((k) => (
                <option key={k} value={k}>{t(`admin.imp_filter_${k}`)} ({counts[k]})</option>
              ))}
            </select>
            {untranslated.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => translateRows(untranslated)} disabled={translating}>
                <Languages className="h-3.5 w-3.5" />
                {translating ? t('admin.imp_translating') : t('admin.imp_translate', { count: untranslated.length })}
              </Button>
            )}
            <label className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900" title={t('admin.imp_allow_fresh_hint')}>
              <input type="checkbox" checked={allowFresh} onChange={(e) => setAllowFresh(e.target.checked)} />
              {t('admin.imp_allow_fresh')}
            </label>
            {forceableAll.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => addForced(forceableAll)}>
                <Check className="h-3.5 w-3.5" />
                {t('admin.imp_force_all', { count: forceableAll.length })}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => toggleAllVisible(!allVisibleSelected)}>
              {allVisibleSelected ? t('admin.imp_deselect_all') : t('admin.imp_select_all_btn')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-3xl">{t('admin.products_import_filter_note')}</p>

          {selectedRows.size > 0 && (
            <div className="sticky top-0 z-10 mt-3 rounded-xl border border-luna-navy/20 bg-slate-50 p-3 flex flex-wrap items-end gap-2 text-sm shadow-sm">
              <div className="basis-full text-sm font-semibold text-luna-navy">{t('admin.imp_selected_count', { count: selectedRows.size })}</div>
              <div>
                <Label htmlFor="imp-bulk-cat" className="text-xs">{t('admin.product_field_category')}</Label>
                <select id="imp-bulk-cat" className={cn(sel, 'block w-60')} value={bulkRow.category_slug} onChange={(e) => setBulkRow((b) => ({ ...b, category_slug: e.target.value }))}>
                  <option value="">{t('admin.products_bulk_no_change')}</option>
                  {categoryOptions.map((c) => <option key={c.id} value={c.slug}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="imp-bulk-type" className="text-xs">{t('admin.imp_map_type')}</Label>
                <ProductTypeSelect id="imp-bulk-type" className={cn(sel, 'block w-40')} value={bulkRow.product_type}
                  onChange={(v) => setBulkRow((b) => ({ ...b, product_type: v }))}
                  types={productTypes} onCreated={addProductType} placeholder={t('admin.products_bulk_no_change')} />
              </div>
              <div>
                <Label htmlFor="imp-bulk-store" className="text-xs">{t('admin.products_col_store')}</Label>
                <select id="imp-bulk-store" className={cn(sel, 'block w-44')} value={bulkRow.store_slug} onChange={(e) => setBulkRow((b) => ({ ...b, store_slug: e.target.value }))}>
                  <option value="">{t('admin.products_bulk_no_change')}</option>
                  {stores.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('admin.product_field_brand')}</Label>
                <BrandPicker
                  value={bulkRow.brand}
                  onChange={(v) => setBulkRow((b) => ({ ...b, brand: v }))}
                  brands={brands}
                  onBrandCreated={onBrandCreated}
                  leading={[{ value: 'nochange', label: t('admin.products_bulk_no_change') }, { value: 'none', label: t('admin.product_field_brand_none') }]}
                  className="w-56 h-9 bg-white"
                />
              </div>
              <Button type="button" size="sm" variant="navy" onClick={applyBulkRows}>{t('admin.products_bulk_apply')}</Button>
              <div className="h-9 w-px bg-luna-navy/15 hidden sm:block" />
              <Button type="button" size="sm" variant="outline" onClick={suggestCategories}>
                <Wand2 className="h-3.5 w-3.5" />
                {t('admin.imp_suggest_categories')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => translateRows(selected.filter((r) => !isSkipped(r)))} disabled={translating}>
                <Languages className="h-3.5 w-3.5" />
                {t('admin.imp_translate_selected')}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => addForced(forceableSelected)} disabled={forceableSelected.length === 0}>
                <Check className="h-3.5 w-3.5" />
                {forceableSelected.length === selectedRows.size
                  ? t('admin.imp_force_selected', { count: forceableSelected.length })
                  : t('admin.imp_force_selected_partial', { forceable: forceableSelected.length, selected: selectedRows.size })}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => patchRows(selectedRows, { skip: true })}>{t('admin.imp_skip_selected')}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => patchRows(selectedRows, { skip: false })}>{t('admin.imp_unskip_selected')}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedRows(new Set())}>{t('admin.products_bulk_clear')}</Button>
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-luna-navy">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={t('admin.imp_select_all')}
                      checked={allVisibleSelected}
                      onChange={(e) => toggleAllVisible(e.target.checked)}
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_row_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_status_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_reason_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.imp_name_fr_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.imp_name_en_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_col_price')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_col_category')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_col_store')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-500">{t('admin.imp_filter_empty')}</td></tr>
                )}
                {visibleRows.map((r) => {
                  const hasErr = r.errors.length > 0;
                  const skipped = isSkipped(r);
                  const status = rowStatus(r);
                  const result = results[r.index];
                  const rowBg = skipped ? 'bg-slate-50 text-slate-400'
                    : hasErr || status === 'excluded' ? 'bg-red-50/40'
                    : status === 'to_verify' ? 'bg-amber-50/40' : '';
                  const nameEn = overrides[r.index]?.name_en ?? r.raw.name_en ?? '';
                  const catSlug = r.raw.category_slug?.trim() ?? '';
                  const store = resolveStore(r.raw.store_slug, stores);
                  return (
                    <tr key={r.row} className={cn(rowBg, selectedRows.has(r.index) && 'outline outline-1 outline-luna-navy/30')}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`${t('admin.imp_select_row')} — ${r.raw.name_fr ?? ''}`}
                          checked={selectedRows.has(r.index)}
                          onChange={(e) => toggleRowSelected(r.index, e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.row}</td>
                      <td className="px-3 py-2">
                        {skipped ? (
                          <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-semibold">{t('admin.imp_status_skipped')}</span>
                        ) : hasErr ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 font-semibold">
                            {t('admin.imp_status_to_fix')}
                          </span>
                        ) : status === 'accepted' ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 font-semibold">
                            {t('admin.products_import_status_accepted')}
                          </span>
                        ) : status === 'excluded' ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 font-semibold">
                            {t('admin.products_import_status_excluded')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 px-2 py-0.5 font-semibold">
                            {t('admin.products_import_status_to_verify')}
                          </span>
                        )}
                        {canForce(r) && (
                          <label className="mt-1 flex items-center gap-1 text-amber-900" title={t('admin.imp_force_hint')}>
                            <input type="checkbox" checked={forced.has(r.index)}
                              onChange={(e) => setForced((s) => { const n = new Set(s); if (e.target.checked) n.add(r.index); else n.delete(r.index); return n; })} />
                            {t('admin.imp_force')}
                          </label>
                        )}
                        {result && (
                          <span className={cn('mt-1 block font-semibold', result.ok ? 'text-green-700' : 'text-red-700')}>
                            {result.ok ? '✓' : '✗'} {result.detail}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 min-w-[14rem]">
                        {hasErr && !skipped ? (
                          <ul className="space-y-0.5 text-red-700">{r.errors.map((e) => <li key={e.code}>• {issueText(e)}</li>)}</ul>
                        ) : rowReason(r)}
                        {r.eligibility.is_alcoholic && <span className="ml-1 text-slate-400">· {t('admin.imp_tag_alcohol')}</span>}
                        {r.eligibility.requires_cold_chain === true && <span className="ml-1 text-sky-600">· {t('admin.imp_tag_cold_chain')}</span>}
                        {!hasErr && !skipped && r.eligibility.status === 'accepted' && r.eligibility.requires_cold_chain === null &&
                          <span className="ml-1 text-amber-600">· {t('admin.imp_tag_storage_unknown')}</span>}
                        {!!r.profiled.notes.length && <span className="block text-slate-400">{r.profiled.notes.join(' · ')}</span>}
                      </td>
                      <td className="px-3 py-2">{r.raw.name_fr ?? ''}</td>
                      <td className="px-3 py-2 min-w-[14rem]">
                        {skipped ? nameEn : (
                          <Input
                            aria-label={`${t('admin.imp_name_en_col')} — ${r.raw.name_fr ?? ''}`}
                            value={nameEn}
                            onChange={(e) => setOverrides((o) => ({ ...o, [r.index]: { ...o[r.index], name_en: e.target.value } }))}
                            className={cn('h-8 text-xs', r.untranslated && 'border-amber-400')}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.data ? `${r.data.price.toFixed(2)} €` : (r.raw.price ?? '')}</td>
                      <td className="px-3 py-2 min-w-[12rem]">
                        {skipped ? (categoryLabel.get(catSlug) ?? catSlug) : (
                          <select aria-label={`${t('admin.products_col_category')} — ${r.raw.name_fr ?? ''}`}
                            className={cn('h-8 w-full rounded-md border bg-white px-1 text-xs', catSlug && categoryLabel.has(catSlug) ? 'border-slate-300' : 'border-red-300')}
                            value={categoryLabel.has(catSlug) ? catSlug : ''}
                            onChange={(e) => patchRows([r.index], { category_slug: e.target.value })}>
                            <option value="">{catSlug ? `« ${catSlug} » ?` : t('admin.imp_category_choose')}</option>
                            {categoryOptions.map((c) => <option key={c.id} value={c.slug}>{c.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{store?.name ?? (r.raw.store_slug?.trim() ? <span className="text-red-700">{r.raw.store_slug}</span> : '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Switch checked={importAsDraft} onCheckedChange={setImportAsDraft} id="import-draft" />
            <Label htmlFor="import-draft">{t('admin.products_import_draft_label')}</Label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="navy" disabled={importing || importable.length === 0} onClick={doImport}>
              {importing ? t('admin.products_import_importing') : t('admin.products_import_confirm', { count: importable.length })}
            </Button>
            {rejected.length > 0 && (
              <Button variant="outline" type="button" onClick={downloadRejected}>
                {t('admin.products_import_download_rejected')} ({rejected.length})
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Categories editor ────────────────────────────────────────────────────

function CategoriesEditor({
  categories, products, onChanged,
}: { categories: ProductCategory[]; products: Product[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState(''); const [nameFr, setNameFr] = useState(''); const [nameEn, setNameEn] = useState(''); const [order, setOrder] = useState(100);
  const [parentId, setParentId] = useState<string>('none');

  const productCountByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products]);

  // Top-level families only — a sub-category can't itself have children, so
  // the "parent" picker only offers categories without a parent.
  const topLevel = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const hasChildren = (id: string) => categories.some((c) => c.parent_id === id);

  // Render parents followed immediately by their own children, so the
  // family/sub-category relationship reads naturally top to bottom.
  const ordered = useMemo(() => {
    const rows = orderedCategories(categories).map((o) => o.category);
    const seen = new Set(rows.map((r) => r.id));
    categories.forEach((c) => { if (!seen.has(c.id)) rows.push(c); }); // orphans, just in case
    return rows;
  }, [categories]);

  const add = async () => {
    if (!slug || !nameFr || !nameEn) { toast.error(t('common.required')); return; }
    try {
      await upsertCategory({ slug, name_fr: nameFr, name_en: nameEn, display_order: Number(order) || 100, parent_id: parentId === 'none' ? null : parentId });
      setSlug(''); setNameFr(''); setNameEn(''); setOrder(100); setParentId('none');
      onChanged();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err); toast.error(t('common.error_generic'));
    }
  };

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-slate-600 mb-4">{t('admin.categories_intro')}</p>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_slug')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_name_fr')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_name_en')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.categories_field_parent')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.categories_field_order')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ordered.map((c) => {
              const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
              return (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {c.parent_id && <span className="text-slate-300 mr-1">↳</span>}
                    {c.slug}
                  </td>
                  <td className={cn('px-4 py-3', c.parent_id && 'pl-6 text-slate-600')}>{c.name_fr}</td>
                  <td className="px-4 py-3">{c.name_en}</td>
                  <td className="px-4 py-3 text-slate-500">{parent ? parent.name_fr : '—'}</td>
                  <td className="px-4 py-3 text-right">{c.display_order}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      disabled={(productCountByCategory.get(c.id) ?? 0) > 0 || hasChildren(c.id)}
                      onClick={async () => {
                        if (!confirm(t('admin.categories_delete_confirm'))) return;
                        try { await deleteCategory(c.id); onChanged(); } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
                      }}
                    >
                      {t('admin.products_action_delete')}
                    </Button>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-luna-navy/5">
              <td className="px-4 py-3"><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="whisky" className="h-8 font-mono text-xs" /></td>
              <td className="px-4 py-3"><Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} className="h-8" /></td>
              <td className="px-4 py-3"><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="h-8" /></td>
              <td className="px-4 py-3">
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('admin.categories_parent_none')}</SelectItem>
                    {topLevel.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_fr}</SelectItem>)}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-4 py-3 text-right"><Input value={order} onChange={(e) => setOrder(Number(e.target.value) || 100)} type="number" className="h-8 w-20 ml-auto" /></td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="navy" onClick={add}>{t('admin.categories_add')}</Button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Brands editor ─────────────────────────────────────────────────────────

function BrandsEditor({
  brands, products, onChanged,
}: { brands: Brand[]; products: Product[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState(''); const [nameFr, setNameFr] = useState(''); const [nameEn, setNameEn] = useState(''); const [order, setOrder] = useState(100);

  const productCountByBrand = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.brand_id) m.set(p.brand_id, (m.get(p.brand_id) ?? 0) + 1);
    return m;
  }, [products]);

  const add = async () => {
    if (!slug || !nameFr || !nameEn) { toast.error(t('common.required')); return; }
    try {
      await upsertBrand({ slug, name_fr: nameFr, name_en: nameEn, display_order: Number(order) || 100 });
      setSlug(''); setNameFr(''); setNameEn(''); setOrder(100);
      onChanged();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err); toast.error(t('common.error_generic'));
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-slate-600 mb-4">{t('admin.brands_intro')}</p>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.brands_field_slug')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.brands_field_name_fr')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.brands_field_name_en')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.brands_field_order')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.products_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {brands.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.slug}</td>
                <td className="px-4 py-3">{b.name_fr}</td>
                <td className="px-4 py-3">{b.name_en}</td>
                <td className="px-4 py-3 text-right">{b.display_order}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    disabled={(productCountByBrand.get(b.id) ?? 0) > 0}
                    onClick={async () => {
                      if (!confirm(t('admin.brands_delete_confirm'))) return;
                      try { await deleteBrand(b.id); onChanged(); } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
                    }}
                  >
                    {t('admin.products_action_delete')}
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="bg-luna-navy/5">
              <td className="px-4 py-3"><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="jack-daniels" className="h-8 font-mono text-xs" /></td>
              <td className="px-4 py-3"><Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} className="h-8" /></td>
              <td className="px-4 py-3"><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="h-8" /></td>
              <td className="px-4 py-3 text-right"><Input value={order} onChange={(e) => setOrder(Number(e.target.value) || 100)} type="number" className="h-8 w-20 ml-auto" /></td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="navy" onClick={add}>{t('admin.brands_add')}</Button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
