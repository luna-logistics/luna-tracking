import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { errorMessage } from '@/lib/errors';
import {
  createProductType, deleteProductType, fetchProductTypes, isBuiltinType, updateProductType, withProductType,
  type ProductTypeDef,
} from '@/lib/product-types';

/** Admin → Produits → Types: list, rename, create, delete the product types. */
export function ProductTypesEditor() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<ProductTypeDef[]>([]);
  const [form, setForm] = useState({ name_fr: '', name_en: '', auto_accept: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetchProductTypes().then(setTypes); }, []);

  const patch = async (slug: string, p: Partial<Pick<ProductTypeDef, 'name_fr' | 'name_en' | 'auto_accept'>>) => {
    const before = types;
    setTypes((ts) => ts.map((x) => (x.slug === slug ? { ...x, ...p } : x)));
    try { await updateProductType(slug, p); toast.success(t('admin.ptype_saved')); }
    catch (err) { setTypes(before); toast.error(errorMessage(err, t('common.error_generic'))); }
  };
  const create = async () => {
    if (!form.name_fr.trim()) return;
    setBusy(true);
    try {
      const created = await createProductType(form);
      setTypes((ts) => withProductType(ts, created));
      setForm({ name_fr: '', name_en: '', auto_accept: false });
      toast.success(t('admin.ptype_created', { name: created.name_fr }));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };
  const remove = async (x: ProductTypeDef) => {
    if (!window.confirm(t('admin.ptype_delete_confirm', { name: x.name_fr }))) return;
    try { await deleteProductType(x.slug); setTypes((ts) => ts.filter((y) => y.slug !== x.slug)); }
    catch (err) {
      const msg = errorMessage(err, t('common.error_generic'));
      toast.error(/foreign key|violates/i.test(msg) ? t('admin.ptype_delete_in_use') : msg);
    }
  };

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-slate-600">{t('admin.ptypes_intro')}</p>
      <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {types.map((x) => {
          const builtin = isBuiltinType(x.slug);
          return (
            <li key={x.slug} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="w-28 font-mono text-xs text-slate-500">{x.slug}</span>
              <Input aria-label={t('admin.ptype_name_fr')} defaultValue={x.name_fr} className="h-9 w-48"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.name_fr) void patch(x.slug, { name_fr: v }); }} />
              <Input aria-label={t('admin.ptype_name_en')} defaultValue={x.name_en} className="h-9 w-48"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.name_en) void patch(x.slug, { name_en: v }); }} />
              {builtin ? (
                <span className="text-xs text-slate-500">{t('admin.ptype_builtin')}</span>
              ) : (
                <>
                  <label className="flex items-center gap-1.5 text-xs" title={t('admin.ptype_auto_accept_hint')}>
                    <input type="checkbox" checked={x.auto_accept} onChange={(e) => void patch(x.slug, { auto_accept: e.target.checked })} />
                    {t('admin.ptype_auto_accept')}
                  </label>
                  <Button type="button" size="sm" variant="ghost" className="ml-auto text-red-600" onClick={() => remove(x)} aria-label={t('admin.ptype_delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="ptype-new" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 id="ptype-new" className="font-semibold text-luna-navy">{t('admin.ptype_new_title')}</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="text-xs">{t('admin.ptype_name_fr')}
            <Input value={form.name_fr} className="h-9 w-56" placeholder={t('admin.ptype_placeholder')} onChange={(e) => setForm((f) => ({ ...f, name_fr: e.target.value }))} />
          </label>
          <label className="text-xs">{t('admin.ptype_name_en')}
            <Input value={form.name_en} className="h-9 w-56" placeholder={form.name_fr} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={form.auto_accept} onChange={(e) => setForm((f) => ({ ...f, auto_accept: e.target.checked }))} />
            {t('admin.ptype_auto_accept')}
          </label>
          <Button type="button" size="sm" variant="navy" disabled={busy || !form.name_fr.trim()} onClick={create}>{t('admin.ptype_create')}</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('admin.ptype_auto_accept_hint')}</p>
      </section>
    </div>
  );
}
