import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import { updateBusiness, CURRENCIES, type Currency } from '@/lib/businesses';
import { errorMessage } from '@/lib/errors';

/**
 * Business settings. Only the owner (via RLS + can('business.update'))
 * can save; other roles see the form disabled. Fields split into three
 * cards: identity, invoicing (VAT / company number, essential for the
 * Peppol-ready invoicing that lands in phase 7), and postal address.
 */
export default function BusinessSettings() {
  const { t } = useTranslation();
  const { current, can, refresh } = useBusiness();
  const editable = can('business.update');
  const [form, setForm] = useState({
    name: '', legal_name: '', vat_number: '', company_number: '',
    email: '', phone: '',
    address_line1: '', address_line2: '', postal_code: '', city: '',
    country: 'BE', currency: 'EUR' as Currency,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!current) return;
    setForm({
      name: current.name,
      legal_name: current.legal_name ?? '',
      vat_number: current.vat_number ?? '',
      company_number: current.company_number ?? '',
      email: current.email ?? '',
      phone: current.phone ?? '',
      address_line1: current.address_line1 ?? '',
      address_line2: current.address_line2 ?? '',
      postal_code: current.postal_code ?? '',
      city: current.city ?? '',
      country: current.country,
      currency: current.currency,
    });
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateBusiness(current.id, {
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        vat_number: form.vat_number.trim() || null,
        company_number: form.company_number.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        postal_code: form.postal_code.trim() || null,
        city: form.city.trim() || null,
        country: form.country.toUpperCase(),
        currency: form.currency,
      });
      await refresh();
      toast.success(t('business_settings.saved'));
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(false); }
  };

  return (
    <>
      <SEO title={t('business_settings.meta_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('business_settings.title')}</h1>
      <p className="mt-2 text-slate-600 max-w-2xl">{t('business_settings.intro')}</p>
      {!editable && (
        <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          {t('business_settings.readonly_note')}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-6 max-w-3xl">
        <Card title={t('business_settings.section_identity')}>
          <Field label={t('business_settings.field_name')} required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} required disabled={!editable} />
          </Field>
          <Field label={t('business_settings.field_legal_name')}>
            <Input value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} disabled={!editable} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('business_settings.field_email')}>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!editable} />
            </Field>
            <Field label={t('business_settings.field_phone')}>
              <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={!editable} />
            </Field>
          </div>
        </Card>

        <Card title={t('business_settings.section_invoicing')} hint={t('business_settings.section_invoicing_hint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('business_settings.field_vat')}>
              <Input value={form.vat_number} onChange={(e) => set('vat_number', e.target.value)} disabled={!editable} placeholder="BE0123456789" />
            </Field>
            <Field label={t('business_settings.field_company_number')}>
              <Input value={form.company_number} onChange={(e) => set('company_number', e.target.value)} disabled={!editable} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('business_settings.field_country')}>
              <Input required minLength={2} maxLength={2} value={form.country}
                onChange={(e) => set('country', e.target.value.toUpperCase().slice(0, 2))}
                className="font-mono uppercase" disabled={!editable} />
            </Field>
            <Field label={t('business_settings.field_currency')}>
              <Select value={form.currency} onValueChange={(v) => set('currency', v as Currency)} disabled={!editable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        <Card title={t('business_settings.section_address')}>
          <Field label={t('business_settings.field_address_line1')}>
            <Input value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} disabled={!editable} />
          </Field>
          <Field label={t('business_settings.field_address_line2')}>
            <Input value={form.address_line2} onChange={(e) => set('address_line2', e.target.value)} disabled={!editable} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('business_settings.field_postal_code')}>
              <Input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} disabled={!editable} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('business_settings.field_city')}>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} disabled={!editable} />
              </Field>
            </div>
          </div>
        </Card>

        {editable && (
          <div className="flex justify-end">
            <Button type="submit" variant="navy" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('business_settings.save')}
            </Button>
          </div>
        )}
      </form>
    </>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-luna-navy">{title}</h2>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
