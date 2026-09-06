import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Pencil, MapPin, User, Building2, Mail, Phone,
  Plus, Trash2, Save, Loader2, Truck, Receipt, FileText, Sparkles,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchCustomer, fetchCustomerAddresses,
  upsertAddress, deleteAddress,
  type BusinessCustomer, type CustomerAddress,
} from '@/lib/customers';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

type Tab = 'info' | 'addresses' | 'history';

/**
 * Customer detail. Three tabs:
 *   1. info      — read-only overview + Edit button linking to the form
 *   2. addresses — full CRUD on postal addresses (multi-address book)
 *   3. history   — placeholder for the quotes / shipments / invoices
 *                  that will hang off customer_id in later phases
 */
export default function BusinessClientDetail() {
  const { t } = useTranslation();
  const { current, can } = useBusiness();
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<BusinessCustomer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [tab, setTab] = useState<Tab>('info');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const [c, a] = await Promise.all([fetchCustomer(id), fetchCustomerAddresses(id)]);
    setCustomer(c); setAddresses(a);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const canWrite = can('clients.write');
  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;
  if (!customer || !current) return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-luna-navy">{t('business_client_detail.not_found_title')}</h1>
      <Button asChild variant="navy" className="mt-4"><Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_client_detail.back_to_list')}</Link></Button>
    </div>
  );

  return (
    <>
      <SEO title={customer.display_name} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="h-4 w-4" /> {t('business_client_detail.back_to_list')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
          {customer.customer_type === 'company' ? <Building2 className="h-6 w-6" /> : <User className="h-6 w-6" />}
          {customer.display_name}
        </h1>
        {!customer.is_active && (
          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">
            {t('business_clients.inactive')}
          </span>
        )}
        {canWrite && (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to="edit"><Pencil className="h-3.5 w-3.5" />{t('business_client_detail.edit')}</Link>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap gap-1">
        {(['info','addresses','history'] as Tab[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === k ? 'border-luna-navy text-luna-navy' : 'border-transparent text-slate-500 hover:text-luna-navy',
            )}>
            {t(`business_client_detail.tab_${k}`)}
            {k === 'addresses' && addresses.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 text-slate-600 px-1.5 text-[10px]">{addresses.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'info'      && <InfoTab customer={customer} />}
        {tab === 'addresses' && <AddressesTab customerId={customer.id} addresses={addresses} canWrite={canWrite} onChanged={reload} />}
        {tab === 'history'   && <HistoryTab />}
      </div>
    </>
  );
}

function InfoTab({ customer }: { customer: BusinessCustomer }) {
  const { t } = useTranslation();
  const items: Array<{ label: string; value: string | null | undefined; icon?: typeof Mail }> = [
    { label: t('business_client_form.field_company_name'),  value: customer.company_name },
    { label: t('business_client_form.field_first_name'),    value: customer.first_name },
    { label: t('business_client_form.field_last_name'),     value: customer.last_name },
    { label: t('business_client_form.field_email'),         value: customer.email, icon: Mail },
    { label: t('business_client_form.field_phone'),         value: customer.phone, icon: Phone },
    { label: t('business_client_form.field_vat'),           value: customer.vat_number },
    { label: t('business_client_form.field_company_number'),value: customer.company_number },
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-luna-navy">{t('business_client_form.section_identity')}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {items.filter((i) => i.value).map((i) => {
            const Icon = i.icon;
            return (
              <div key={i.label} className="grid grid-cols-3 gap-2">
                <dt className="col-span-1 text-slate-500 text-xs uppercase tracking-wide">{i.label}</dt>
                <dd className="col-span-2 text-luna-navy inline-flex items-center gap-1">
                  {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                  {i.value}
                </dd>
              </div>
            );
          })}
          {items.every((i) => !i.value) && (
            <div className="text-slate-500 text-sm italic">{t('business_client_detail.no_info')}</div>
          )}
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-luna-navy">{t('business_client_form.section_notes')}</h2>
        <p className={cn('mt-3 text-sm whitespace-pre-wrap', customer.notes ? 'text-luna-navy' : 'text-slate-500 italic')}>
          {customer.notes || t('business_client_detail.no_notes')}
        </p>
      </section>
    </div>
  );
}

function AddressesTab({
  customerId, addresses, canWrite, onChanged,
}: {
  customerId: string;
  addresses: CustomerAddress[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<CustomerAddress | 'new' | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-luna-navy flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {t('business_client_detail.addresses_title')}
        </h2>
        {canWrite && !editing && (
          <Button variant="navy" size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('business_client_detail.address_new')}
          </Button>
        )}
      </div>

      {editing && (
        <AddressForm
          customerId={customerId}
          address={editing === 'new' ? null : editing}
          onDone={async () => { await onChanged(); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {!editing && addresses.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          {t('business_client_detail.addresses_empty')}
        </div>
      )}

      {!editing && addresses.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {addresses.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-luna-navy">{a.label || t('business_client_detail.address_no_label')}</div>
                  <div className="mt-1 text-sm text-slate-700 whitespace-pre-line">
                    {a.address_line1}
                    {a.address_line2 && `\n${a.address_line2}`}
                    {(a.postal_code || a.city) && `\n${[a.postal_code, a.city].filter(Boolean).join(' ')}`}
                    {`\n${a.country}`}
                  </div>
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {a.is_default_billing  && <span className="rounded-full bg-luna-cyan/20 text-luna-navy px-2 py-0.5 text-[11px]">{t('business_client_detail.default_billing')}</span>}
                    {a.is_default_shipping && <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px]">{t('business_client_detail.default_shipping')}</span>}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={async () => {
                      if (!confirm(t('business_client_detail.address_delete_confirm'))) return;
                      try { await deleteAddress(a.id); await onChanged(); }
                      catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddressForm({
  customerId, address, onDone, onCancel,
}: {
  customerId: string;
  address: CustomerAddress | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    label: address?.label ?? '',
    address_line1: address?.address_line1 ?? '',
    address_line2: address?.address_line2 ?? '',
    postal_code: address?.postal_code ?? '',
    city: address?.city ?? '',
    country: address?.country ?? 'BE',
    is_default_billing: address?.is_default_billing ?? false,
    is_default_shipping: address?.is_default_shipping ?? false,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await upsertAddress(customerId, {
        id: address?.id,
        label: f.label.trim() || null,
        address_line1: f.address_line1.trim(),
        address_line2: f.address_line2.trim() || null,
        postal_code: f.postal_code.trim() || null,
        city: f.city.trim() || null,
        country: f.country,
        is_default_billing: f.is_default_billing,
        is_default_shipping: f.is_default_shipping,
      });
      await onDone();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={onSubmit} className="mb-6 rounded-2xl border-2 border-luna-blue/30 bg-white p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <Field label={t('business_client_detail.address_label')}>
          <Input value={f.label} onChange={(e) => set('label', e.target.value)} placeholder={t('business_client_detail.address_label_placeholder')} />
        </Field>
        <Field label={t('business_client_detail.address_country')}>
          <Input value={f.country} onChange={(e) => set('country', e.target.value.toUpperCase().slice(0, 2))}
            className="font-mono uppercase" minLength={2} maxLength={2} required />
        </Field>
      </div>
      <Field label={t('business_client_detail.address_line1')} required>
        <Input value={f.address_line1} onChange={(e) => set('address_line1', e.target.value)} required />
      </Field>
      <Field label={t('business_client_detail.address_line2')}>
        <Input value={f.address_line2} onChange={(e) => set('address_line2', e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('business_client_detail.address_postal_code')}>
          <Input value={f.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('business_client_detail.address_city')}>
            <Input value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={f.is_default_billing} onChange={(e) => set('is_default_billing', e.target.checked)}
            className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
          {t('business_client_detail.default_billing')}
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={f.is_default_shipping} onChange={(e) => set('is_default_shipping', e.target.checked)}
            className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
          {t('business_client_detail.default_shipping')}
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('business_client_detail.cancel')}
        </Button>
        <Button type="submit" variant="navy" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('business_client_detail.save_address')}
        </Button>
      </div>
    </form>
  );
}

function HistoryTab() {
  const { t } = useTranslation();
  const items: Array<{ icon: typeof Truck; key: string }> = [
    { icon: Truck,    key: 'shipments' },
    { icon: FileText, key: 'quotes' },
    { icon: Receipt,  key: 'invoices' },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map(({ icon: Icon, key }) => (
        <div key={key} className="rounded-2xl border-2 border-dashed border-luna-blue/30 bg-white p-6 text-center">
          <Icon className="h-6 w-6 mx-auto text-luna-blue" aria-hidden="true" />
          <div className="mt-3 font-semibold text-luna-navy">{t(`business_nav.${key}`)}</div>
          <p className="mt-1 text-xs text-slate-500">{t('business_client_detail.history_placeholder')}</p>
        </div>
      ))}
      <div className="md:col-span-3 mt-2 rounded-2xl bg-luna-navy/[0.03] border border-luna-blue/20 p-4 text-xs text-slate-600 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-luna-blue" aria-hidden="true" />
        {t('business_client_detail.history_note')}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy text-xs uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
