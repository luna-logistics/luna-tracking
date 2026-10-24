import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import { createProductType, productTypeLabel, productTypeSlug, type ProductTypeDef } from '@/lib/product-types';

const NEW = '__new__';

/**
 * Product type picker for the import (native select, like the rest of the
 * preview) whose last option creates a type on the spot: French + English
 * name, and whether its products are accepted without review.
 */
export function ProductTypeSelect({
  id, value, onChange, types, onCreated, placeholder, className, ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (slug: string) => void;
  types: ProductTypeDef[];
  onCreated: (t: ProductTypeDef) => void;
  /** Label of the empty first option ("Type…", "— no change —"). */
  placeholder: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name_fr: '', name_en: '', auto_accept: false });
  const [busy, setBusy] = useState(false);

  const close = () => { setCreating(false); setForm({ name_fr: '', name_en: '', auto_accept: false }); };
  const create = async () => {
    const name = form.name_fr.trim();
    if (!name) return;
    const existing = types.find((x) => x.slug === productTypeSlug(name));
    if (existing) {
      onChange(existing.slug);
      toast.info(t('admin.ptype_exists', { name: productTypeLabel(existing, i18n.language) }));
      close();
      return;
    }
    setBusy(true);
    try {
      const created = await createProductType(form);
      onCreated(created);
      onChange(created.slug);
      toast.success(t('admin.ptype_created', { name: productTypeLabel(created, i18n.language) }));
      close();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(false); }
  };

  if (creating) {
    return (
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-luna-navy/20 bg-white p-2">
        <label className="text-xs">
          {t('admin.ptype_name_fr')}
          <Input autoFocus value={form.name_fr} className="h-9 w-44" placeholder={t('admin.ptype_placeholder')}
            onChange={(e) => setForm((f) => ({ ...f, name_fr: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create(); } if (e.key === 'Escape') close(); }} />
        </label>
        <label className="text-xs">
          {t('admin.ptype_name_en')}
          <Input value={form.name_en} className="h-9 w-44" placeholder={form.name_fr}
            onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
        </label>
        <label className="flex max-w-xs items-start gap-1.5 text-xs" title={t('admin.ptype_auto_accept_hint')}>
          <input type="checkbox" className="mt-0.5" checked={form.auto_accept}
            onChange={(e) => setForm((f) => ({ ...f, auto_accept: e.target.checked }))} />
          {t('admin.ptype_auto_accept')}
        </label>
        <Button type="button" size="sm" variant="navy" disabled={busy || !form.name_fr.trim()} onClick={create}>{t('admin.ptype_create')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={close}>{t('admin.brand_picker_cancel')}</Button>
      </div>
    );
  }

  return (
    <select id={id} aria-label={ariaLabel} className={cn(className)} value={value}
      onChange={(e) => (e.target.value === NEW ? setCreating(true) : onChange(e.target.value))}>
      <option value="">{placeholder}</option>
      {types.map((x) => <option key={x.slug} value={x.slug}>{productTypeLabel(x, i18n.language)}</option>)}
      <option value={NEW}>{t('admin.ptype_new_option')}</option>
    </select>
  );
}
