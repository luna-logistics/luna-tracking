import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Store as StoreIcon, Upload, Pencil, Plus, X } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { fetchStores, upsertStore, toggleStoreActive, uploadProductImage, type Store } from '@/lib/products';
import { optimizeImage } from '@/lib/optimize-image';
import { slugify } from '@/lib/blog';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const STORE_TYPES = ['food', 'clothing', 'hygiene', 'diy', 'other'] as const;
type StoreType = (typeof STORE_TYPES)[number];

type FormValues = {
  id?: string;
  name: string;
  slug: string;
  store_type: StoreType;
  country: string;
  logo_url: string | null;
  display_order: number;
  is_active: boolean;
};

const emptyForm: FormValues = {
  name: '', slug: '', store_type: 'food', country: 'BE', logo_url: null, display_order: 100, is_active: true,
};

export default function AdminStores() {
  const { t } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reload = () => fetchStores().then((s) => { setStores(s); setLoading(false); });
  useEffect(() => { reload(); }, []);

  const editing = !!values.id;
  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((p) => ({ ...p, [k]: v }));
  const resetForm = () => setValues(emptyForm);

  const startEdit = (s: Store) => setValues({
    id: s.id, name: s.name, slug: s.slug, store_type: (s.store_type as StoreType) ?? 'other',
    country: s.country, logo_url: s.logo_url, display_order: s.display_order, is_active: s.is_active,
  });

  const onLogo = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxWidth: 400, quality: 0.85 });
      const url = await uploadProductImage(`store-${values.slug || 'logo'}`, optimized);
      set('logo_url', url);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setUploading(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9-]+$/.test(values.slug)) { toast.error(t('admin.stores_slug_format_error')); return; }
    setSaving(true);
    try {
      await upsertStore({
        ...(values.id ? { id: values.id } : {}),
        name: values.name.trim(),
        slug: values.slug.trim(),
        store_type: values.store_type,
        country: values.country.trim() || 'BE',
        logo_url: values.logo_url,
        display_order: Number(values.display_order) || 100,
        is_active: values.is_active,
      });
      toast.success(t('admin.stores_saved'));
      resetForm();
      reload();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setSaving(false); }
  };

  const toggle = async (s: Store) => {
    try { await toggleStoreActive(s.id, !s.is_active); reload(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
  };

  return (
    <>
      <SEO title={t('admin.stores_title')} noindex />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-luna-navy inline-flex items-center gap-2">
          <StoreIcon className="h-6 w-6" />
          {t('admin.stores_title')}
        </h1>
        <p className="mt-2 text-sm text-slate-600 max-w-3xl">{t('admin.stores_intro')}</p>
      </div>

      {/* Add / edit form */}
      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 mb-8">
        <h2 className="text-sm font-semibold text-luna-navy">
          {editing ? t('admin.stores_edit_title') : t('admin.stores_add_title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="store-name">{t('admin.stores_field_name')}</Label>
            <Input id="store-name" value={values.name} required className="mt-1.5"
              onChange={(e) => {
                const name = e.target.value;
                setValues((p) => ({ ...p, name, slug: p.slug || slugify(name) }));
              }} />
          </div>
          <div>
            <Label htmlFor="store-slug">{t('admin.stores_field_slug')}</Label>
            <Input id="store-slug" value={values.slug} required className="mt-1.5 font-mono"
              onChange={(e) => set('slug', e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">{t('admin.stores_field_slug_hint')}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>{t('admin.stores_field_type')}</Label>
            <Select value={values.store_type} onValueChange={(v) => set('store_type', v as StoreType)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STORE_TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>{t(`admin.stores_type_${ty}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="store-country">{t('admin.stores_field_country')}</Label>
            <Input id="store-country" value={values.country} maxLength={2} className="mt-1.5 uppercase"
              onChange={(e) => set('country', e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label htmlFor="store-order">{t('admin.stores_field_order')}</Label>
            <Input id="store-order" type="number" value={values.display_order} className="mt-1.5"
              onChange={(e) => set('display_order', Number(e.target.value))} />
          </div>
        </div>

        <div>
          <Label>{t('admin.stores_field_logo')}</Label>
          <div className="mt-1.5 flex flex-wrap items-start gap-4">
            <div className="w-24 h-24 rounded-md border border-slate-200 bg-slate-50 grid place-items-center overflow-hidden">
              {values.logo_url
                ? <img src={values.logo_url} alt="" className="max-w-full max-h-full object-contain" />
                : <StoreIcon className="h-6 w-6 text-slate-300" />}
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <label className="inline-flex items-center gap-2 rounded-md bg-luna-navy text-white px-3 py-2 text-sm font-medium cursor-pointer hover:bg-luna-navy/90">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? t('admin_blog.uploading') : t('admin_blog.upload_image')}
                <input type="file" className="hidden" accept="image/*" disabled={uploading}
                  onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
              </label>
              <Input value={values.logo_url ?? ''} placeholder="https://…" className="text-xs"
                onChange={(e) => set('logo_url', e.target.value || null)} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={values.is_active} onCheckedChange={(v) => set('is_active', v)} id="store-active" />
          <Label htmlFor="store-active">{t('admin.stores_field_active')}</Label>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" variant="navy" disabled={saving}>
            {saving ? t('admin.stores_saving') : (editing ? t('admin.stores_save') : <><Plus className="h-4 w-4" />{t('admin.stores_add_title')}</>)}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>
      ) : stores.length === 0 ? (
        <div className="py-16 text-center text-slate-500 rounded-2xl border-2 border-dashed border-slate-300 bg-white">
          {t('admin.stores_empty')}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.stores_col_name')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.stores_col_slug')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.stores_col_type')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.stores_col_country')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.stores_col_order')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('admin.stores_col_status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map((s) => (
                <tr key={s.id} className={s.is_active ? '' : 'bg-slate-50/60'}>
                  <td className="px-4 py-3 font-medium text-luna-navy inline-flex items-center gap-2">
                    {s.logo_url
                      ? <img src={s.logo_url} alt="" className="h-6 w-6 rounded object-contain bg-white border border-slate-200" />
                      : <StoreIcon className="h-4 w-4 text-slate-400" />}
                    {s.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.slug}</td>
                  <td className="px-4 py-3">{t(`admin.stores_type_${STORE_TYPES.includes(s.store_type as StoreType) ? s.store_type : 'other'}`)}</td>
                  <td className="px-4 py-3">{s.country}</td>
                  <td className="px-4 py-3">{s.display_order}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                      s.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600')}>
                      {s.is_active ? t('admin.stores_active') : t('admin.stores_inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button type="button" size="sm" variant="ghost" onClick={() => startEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => toggle(s)}>
                      {s.is_active ? t('admin.stores_deactivate') : t('admin.stores_activate')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
