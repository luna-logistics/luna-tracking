import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { upsertBrand, type Brand } from '@/lib/products';
import { brandSlug, normalizeBrandText } from '@/lib/brand-detect';

const NEW = '__new__';

/**
 * Brand select that can also CREATE a brand on the spot ("+ Nouvelle
 * marque…"), so the admin never has to leave for the Brands tab. Brands are
 * listed A→Z. A name that already exists (same spelling, accents/case aside)
 * selects the existing brand instead of creating a duplicate.
 */
export function BrandPicker({
  id, value, onChange, brands, onBrandCreated, leading = [], className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  brands: Brand[];
  onBrandCreated: (brand: Brand) => void;
  /** Extra first options, e.g. "— no change —", "— no brand —". */
  leading?: Array<{ value: string; label: string }>;
  className?: string;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...brands].sort((a, b) => a.name_fr.localeCompare(b.name_fr, 'fr', { sensitivity: 'base' })), [brands]);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    const existing = brands.find((b) => normalizeBrandText(b.name_fr) === normalizeBrandText(n) || b.slug === brandSlug(n));
    if (existing) {
      onChange(existing.id);
      toast.info(t('admin.brand_picker_exists', { name: existing.name_fr }));
      setCreating(false); setName('');
      return;
    }
    setBusy(true);
    try {
      const b = await upsertBrand({ slug: brandSlug(n), name_fr: n, name_en: n, display_order: 100 });
      onBrandCreated(b);
      onChange(b.id);
      toast.success(t('admin.brand_picker_created', { name: b.name_fr }));
      setCreating(false); setName('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error_generic'));
    } finally { setBusy(false); }
  };

  if (creating) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            autoFocus
            value={name}
            placeholder={t('admin.brand_picker_placeholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create(); } if (e.key === 'Escape') setCreating(false); }}
            className="h-9"
          />
          <Button type="button" size="sm" variant="navy" disabled={busy || !name.trim()} onClick={create}>{t('admin.brand_picker_create')}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setCreating(false); setName(''); }}>{t('admin.brand_picker_cancel')}</Button>
        </div>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => (v === NEW ? setCreating(true) : onChange(v))}>
      <SelectTrigger id={id} className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NEW} className="font-semibold text-luna-azure">
          <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> {t('admin.brand_picker_new')}</span>
        </SelectItem>
        {leading.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        {sorted.map((b) => <SelectItem key={b.id} value={b.id}>{b.name_fr}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
