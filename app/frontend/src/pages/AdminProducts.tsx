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
import { Upload, Trash2, Languages, Wand2, Check, X } from 'lucide-react';
import { BilingualPair } from '@/components/BilingualPair';
import { translateText } from '@/lib/translate';
import { slugify } from '@/lib/blog';
import { suggestHsCode, type HsSuggestion } from '@/lib/hs-classifier';
import { isLunaEligibleProduct, type EligibilityResult } from '@/lib/product-eligibility';
import { normalizeCsvRow, rejectedRowsToCsv } from '@/lib/store-import';
import {
  applyImportProfile, categoryPrefixes, headerSignature, DEFAULT_RULES, slugify as slugifyImport,
  type CategoryMapping, type ImportProfile, type ProfiledRow,
} from '@/lib/import-profile';
import {
  fetchImportProfiles, fetchCategoryMappings, createImportProfile, updateImportProfile,
  saveCategoryMapping, deleteCategoryMapping, findProductBySource, updateProductFromSource,
} from '@/lib/import-profiles-db';
import type { ProductType } from '@/lib/normalized-product';
import { optimizeImage } from '@/lib/optimize-image';
import {
  fetchAllProducts, fetchProductCategories, upsertProduct, toggleProductActive, deleteProduct,
  upsertCategory, deleteCategory, uploadProductImage, fetchStores, upsertProductSource, type Store,
  type Product, type ProductCategory,
} from '@/lib/products';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';

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
      return [p.name_fr, p.name_en, p.slug_fr, p.slug_en, p.barcode ?? ''].some((f) => f.toLowerCase().includes(q));
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
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    <div>{p.slug_fr}</div>
                    <div className="text-slate-400">{p.slug_en}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{cat?.name_fr ?? '—'}</td>
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
      setValues({ is_active: true, price: 0, weight_kg: null, barcode: null, hs_code: null, image_url: null, category_id: payload.category_id, slug_fr: '', slug_en: '' });
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
      <div>
        <Label htmlFor="category_id">{t('admin.product_field_category')}</Label>
        <Select value={values.category_id ?? ''} onValueChange={(v) => set('category_id', v)}>
          <SelectTrigger id="category_id" className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_fr}</SelectItem>)}
          </SelectContent>
        </Select>
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
  raw: Record<string, string>;
  errors: string[];
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
  profiled?: ProfiledRow;
  data?: {
    slug_fr: string; slug_en: string;
    name_fr: string; name_en: string;
    description_fr: string | null; description_en: string | null;
    price: number; category_id: string;
    barcode: string | null; hs_code: string | null; weight_kg: number | null; image_url: string | null;
    is_active: boolean;
    meta_title_fr: string | null; meta_title_en: string | null;
    meta_description_fr: string | null; meta_description_en: string | null;
  };
};

type EnOverride = { name_en?: string; description_en?: string };
type MappingDraft = { prefix: string; action: 'map' | 'skip'; category_id: string; product_type: ProductType | '' };
type RowResult = { ok: boolean; detail: string };

const TYPE_KEYS: ProductType[] = ['food', 'hygiene', 'household', 'clothing', 'other'];

function CsvImport({ categories, onDone }: { categories: ProductCategory[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
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
  const [overrides, setOverrides] = useState<Record<number, EnOverride>>({});
  const [forced, setForced] = useState<Set<number>>(new Set());
  const [translating, setTranslating] = useState(false);
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchStores().then(setStores); void fetchImportProfiles().then(setProfiles); }, []);
  const storeBySlug = useMemo(() => new Map(stores.map((s) => [s.slug, s.id])), [stores]);
  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const profileStoreSlug = profile?.store_id ? stores.find((s) => s.id === profile.store_id)?.slug ?? null : null;
  const categorySlugById = useMemo(() => new Map(categories.map((c) => [c.id, c.slug])), [categories]);
  const signature = useMemo(() => headerSignature(headers), [headers]);

  useEffect(() => {
    if (!profileId) { setMappings([]); return; }
    void fetchCategoryMappings(profileId).then(setMappings);
  }, [profileId]);

  // Re-validated whenever categories, stores, the profile or its mappings
  // change, so a mapping saved in the preview applies to every row at once.
  const rows = useMemo(() => rawRows.map((raw, i) => {
    const profiled = applyImportProfile(raw, profile, mappings, { storeSlug: profileStoreSlug, categorySlugById });
    const o = overrides[i] ?? {};
    const merged = { ...profiled.raw };
    if (o.name_en?.trim()) {
      merged.name_en = o.name_en.trim();
      // A copied FR slug becomes a real EN slug once the name is translated.
      if (!merged.slug_en || merged.slug_en === merged.slug_fr) merged.slug_en = slugifyImport(merged.name_en);
    }
    if (o.description_en !== undefined) merged.description_en = o.description_en;
    const base = validateRow(merged, i + 2, categories, storeBySlug);
    const errors = [...base.errors];
    if (profiled.priceProblem) errors.push(profiled.priceProblem);
    if (profiled.unmapped && !profiled.skip) errors.push(t('admin.imp_err_unmapped'));
    return { ...base, index: i, errors, profiled, data: errors.length ? undefined : base.data } as ImportRow;
  }), [rawRows, profile, mappings, profileStoreSlug, categorySlugById, overrides, categories, storeBySlug, t]);

  const onFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRawRows(res.data);
        setOverrides({}); setForced(new Set()); setResults({}); setDrafts({});
        // Recognise the source by its column set.
        const sig = headerSignature(hdrs);
        const match = profiles.find((p) => p.header_signature === sig);
        setProfileId(match?.id ?? null);
        if (match) toast.success(t('admin.imp_profile_detected', { name: match.name }));
      },
      error: (err) => { toast.error(err.message); },
    });
  };

  const isSkipped = (r: ImportRow) => !!r.profiled?.skip;
  const canForce = (r: ImportRow) => r.errors.length === 0 && !isSkipped(r) && !r.storeUnknown && r.eligibility.status === 'to_verify';
  // A row imports only if it is structurally valid, not skipped by the
  // profile, its store (when given) is known, and it is either accepted by
  // the eligibility filter or explicitly forced by the admin (to_verify only).
  const importable = rows.filter((r) => r.errors.length === 0 && r.data && !isSkipped(r) && !r.storeUnknown
    && (r.eligibility.status === 'accepted' || (r.eligibility.status === 'to_verify' && forced.has(r.index))));
  const importableSet = new Set(importable.map((r) => r.index));
  const rejected = rows.filter((r) => r.errors.length === 0 && !isSkipped(r) && !importableSet.has(r.index));

  const rowReason = (r: ImportRow): string =>
    r.profiled?.skip ?? (r.storeUnknown ? `magasin inconnu « ${r.raw.store_slug?.trim()} »` : r.eligibility.reason);
  const rowStatus = (r: ImportRow): 'accepted' | 'excluded' | 'to_verify' =>
    r.storeUnknown ? 'to_verify' : r.eligibility.status;

  // Distinct unmapped source categories in this file (profile needed to save).
  const unmappedCats = useMemo(() => Array.from(new Set(
    rows.filter((r) => r.profiled?.unmapped && !r.profiled.skip).map((r) => r.raw.source_category?.trim()).filter(Boolean) as string[],
  )), [rows]);
  const untranslated = rows.filter((r) => r.profiled?.untranslated && !isSkipped(r) && !overrides[r.index]?.name_en
    && r.eligibility.status !== 'excluded');

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

  const createProfile = async () => {
    const name = newProfile.name.trim();
    if (!name) { toast.error(t('common.required')); return; }
    setBusy(true);
    try {
      const p = await createImportProfile({
        slug: slugifyImport(name) || `profil-${Date.now()}`, name, header_signature: signature,
        store_id: newProfile.store_id || null, rules: DEFAULT_RULES,
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
  const rules = { ...DEFAULT_RULES, ...(profile?.rules ?? {}) };

  const translateAll = async () => {
    if (untranslated.length === 0) return;
    setTranslating(true);
    try {
      const names = untranslated.map((r) => r.raw.name_fr);
      const descs = untranslated.map((r) => r.raw.description_fr ?? '');
      const withDesc = descs.map((d, i) => [d, i] as const).filter(([d]) => d.trim());
      const [n, d] = await Promise.all([
        translateText(names, 'en', 'fr'),
        withDesc.length ? translateText(withDesc.map(([x]) => x), 'en', 'fr') : Promise.resolve({ translations: [] as string[] }),
      ]);
      setOverrides((prev) => {
        const next = { ...prev };
        untranslated.forEach((r, i) => { next[r.index] = { ...next[r.index], name_en: n.translations[i] ?? '' }; });
        withDesc.forEach(([, i], k) => {
          const r = untranslated[i];
          next[r.index] = { ...next[r.index], description_en: d.translations[k] ?? '' };
        });
        return next;
      });
      toast.success(t('admin.imp_translated', { count: untranslated.length }));
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
            requires_cold_chain: r.eligibility.requires_cold_chain,
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
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'luna-import-a-verifier.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm';

  return (
    <div className="max-w-6xl">
      <p className="text-sm text-slate-600 mb-4">{t('admin.products_import_intro')}</p>
      <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-4 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
        {t('admin.products_import_choose')}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      {rawRows.length > 0 && (
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
            {!profiles.some((p) => p.header_signature === signature) && (
              <span className="text-amber-700">{t('admin.imp_profile_none_match')}</span>
            )}
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
                  <option value="">{t('admin.imp_profile_store_none')}</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
                </select>
              </div>
              <Button type="button" variant="navy" size="sm" onClick={createProfile} disabled={busy}>{t('admin.imp_profile_create')}</Button>
            </div>
          )}

          {profile && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="text-sm">
                <Label htmlFor="imp-store" className="text-xs">{t('admin.imp_profile_store')}</Label>
                <select id="imp-store" className={cn(sel, 'block')} value={profile.store_id ?? ''}
                  onChange={(e) => void patchProfile({ store_id: e.target.value || null })}>
                  <option value="">{t('admin.imp_profile_store_none')}</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
                </select>
              </div>
              <fieldset className="text-sm space-y-1">
                <legend className="text-xs font-medium text-slate-600">{t('admin.imp_profile_rules')}</legend>
                {([
                  ['strip_description_price_suffix', 'admin.imp_rule_desc'],
                  ['fix_price_x1000', 'admin.imp_rule_price'],
                  ['strip_slug_suffix', 'admin.imp_rule_slug'],
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

      {unmappedCats.length > 0 && (
        <section aria-labelledby="imp-map" className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <h3 id="imp-map" className="font-semibold text-luna-navy">{t('admin.imp_mappings_title', { count: unmappedCats.length })}</h3>
          <p className="mt-1 text-xs text-slate-600">{profile ? t('admin.imp_mappings_intro') : t('admin.imp_need_profile')}</p>
          {profile && (
            <ul className="mt-3 space-y-3">
              {unmappedCats.map((sc) => {
                const d = draftFor(sc);
                return (
                  <li key={sc} className="rounded-xl bg-white p-3 text-sm">
                    <p className="font-mono text-xs text-slate-500 break-words">{sc}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name_fr}</option>)}
                          </select>
                          <select aria-label={t('admin.imp_map_type')} className={sel} value={d.product_type} onChange={(e) => setDraft(sc, { product_type: e.target.value as ProductType })}>
                            <option value="">{t('admin.imp_map_type')}…</option>
                            {TYPE_KEYS.map((k) => <option key={k} value={k}>{t(`admin.imp_type_${k}`)}</option>)}
                          </select>
                        </>
                      )}
                      <Button type="button" size="sm" variant="navy" onClick={() => saveMapping(sc)} disabled={busy}>{t('admin.imp_map_save')}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
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
                  : `→ ${categories.find((c) => c.id === m.category_id)?.name_fr ?? '?'} · ${t(`admin.imp_type_${m.product_type}`)}`}</span>
                <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => removeMapping(m)} aria-label={t('admin.imp_map_delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-luna-navy">{t('admin.products_import_preview')}</h3>
            {untranslated.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={translateAll} disabled={translating}>
                <Languages className="h-3.5 w-3.5" />
                {translating ? t('admin.imp_translating') : t('admin.imp_translate', { count: untranslated.length })}
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-3xl">{t('admin.products_import_filter_note')}</p>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-luna-navy">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_row_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_status_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.products_import_reason_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">name_fr</th>
                  <th className="text-left px-3 py-2 font-semibold">{t('admin.imp_name_en_col')}</th>
                  <th className="text-left px-3 py-2 font-semibold">product_type</th>
                  <th className="text-left px-3 py-2 font-semibold">price</th>
                  <th className="text-left px-3 py-2 font-semibold">category_slug</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const hasErr = r.errors.length > 0;
                  const skipped = isSkipped(r);
                  const status = rowStatus(r);
                  const result = results[r.index];
                  const rowBg = skipped ? 'bg-slate-50 text-slate-400'
                    : hasErr || status === 'excluded' ? 'bg-red-50/40'
                    : status === 'to_verify' ? 'bg-amber-50/40' : '';
                  const nameEn = overrides[r.index]?.name_en ?? r.profiled?.raw.name_en ?? r.raw.name_en ?? '';
                  return (
                    <tr key={r.row} className={rowBg}>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.row}</td>
                      <td className="px-3 py-2">
                        {skipped ? (
                          <span className="inline-flex items-center rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-semibold">{t('admin.imp_status_skipped')}</span>
                        ) : hasErr ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 font-semibold">
                            {t('admin.products_import_error')}
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
                      <td className="px-3 py-2 text-slate-600">
                        {hasErr ? <span className="text-red-700">{r.errors.join('; ')}</span> : rowReason(r)}
                        {r.eligibility.is_alcoholic && <span className="ml-1 text-slate-400">· alcool</span>}
                        {r.eligibility.requires_cold_chain === true && <span className="ml-1 text-sky-600">· chaîne du froid</span>}
                        {!hasErr && !skipped && !r.storeUnknown && r.eligibility.status === 'accepted' && r.eligibility.requires_cold_chain === null &&
                          <span className="ml-1 text-amber-600">· conservation inconnue</span>}
                        {!!r.profiled?.notes.length && <span className="block text-slate-400">{r.profiled.notes.join(' · ')}</span>}
                      </td>
                      <td className="px-3 py-2">{r.raw.name_fr ?? ''}</td>
                      <td className="px-3 py-2 min-w-[14rem]">
                        {skipped ? nameEn : (
                          <Input
                            aria-label={`${t('admin.imp_name_en_col')} — ${r.raw.name_fr ?? ''}`}
                            value={nameEn}
                            onChange={(e) => setOverrides((o) => ({ ...o, [r.index]: { ...o[r.index], name_en: e.target.value } }))}
                            className={cn('h-8 text-xs', r.profiled?.untranslated && !overrides[r.index]?.name_en && 'border-amber-400')}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">{r.profiled?.raw.product_type || r.raw.product_type || '—'}</td>
                      <td className="px-3 py-2">{r.profiled?.raw.price ?? r.raw.price ?? ''}</td>
                      <td className="px-3 py-2 font-mono">{r.profiled?.raw.category_slug ?? r.raw.category_slug ?? ''}</td>
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

function validateRow(raw: Record<string, string>, row: number, categories: ProductCategory[], storeBySlug: Map<string, string>): Omit<ImportRow, 'index'> {
  const errors: string[] = [];
  // Store-agnostic eligibility — same pipeline a future scraper will use
  // (normalise → filter). Independent of the structural checks below.
  const eligibility = isLunaEligibleProduct(normalizeCsvRow(raw));
  // Resolve store_slug → store_id. An unknown slug never creates a store; the
  // row is treated as "to verify" and not imported.
  const storeSlug = raw.store_slug?.trim();
  const storeId = storeSlug ? (storeBySlug.get(storeSlug) ?? null) : null;
  const storeUnknown = !!storeSlug && !storeBySlug.has(storeSlug);
  // Back-compat: accept a legacy single `slug` column and use it for both
  // slug_fr and slug_en if the FR/EN columns are missing.
  const slugFr = (raw.slug_fr ?? raw.slug ?? '').trim();
  const slugEn = (raw.slug_en ?? raw.slug ?? '').trim();
  if (!slugFr) errors.push('slug_fr required (or legacy slug)');
  if (!slugEn) errors.push('slug_en required (or legacy slug)');
  const req = (k: string) => { if (!raw[k]?.trim()) errors.push(`${k} required`); };
  ['name_fr', 'name_en', 'price', 'category_slug'].forEach(req);

  const price = Number(raw.price);
  if (raw.price != null && Number.isNaN(price)) errors.push('price NaN');
  if (price < 0) errors.push('price < 0');
  const weight = raw.weight_kg?.trim() ? Number(raw.weight_kg) : null;
  if (weight !== null && Number.isNaN(weight)) errors.push('weight_kg NaN');

  const cat = categories.find((c) => c.slug === raw.category_slug?.trim());
  if (raw.category_slug?.trim() && !cat) errors.push(`unknown category_slug "${raw.category_slug}"`);
  if (slugFr && !/^[a-z0-9-]+$/.test(slugFr)) errors.push('slug_fr format');
  if (slugEn && !/^[a-z0-9-]+$/.test(slugEn)) errors.push('slug_en format');

  if (errors.length) return { row, raw, errors, eligibility, storeId, storeUnknown };
  return {
    row, raw, errors: [], eligibility, storeId, storeUnknown,
    data: {
      slug_fr: slugFr, slug_en: slugEn,
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
      meta_title_fr: raw.meta_title_fr?.trim() || null,
      meta_title_en: raw.meta_title_en?.trim() || null,
      meta_description_fr: raw.meta_description_fr?.trim() || null,
      meta_description_en: raw.meta_description_en?.trim() || null,
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
                      try { await deleteCategory(c.id); onChanged(); } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
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
