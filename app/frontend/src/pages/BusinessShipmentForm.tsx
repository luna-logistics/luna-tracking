import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2, BookmarkPlus, Package, ArrowRight } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchShipment, upsertShipment, saveTemplate, fetchTemplates,
  emptyShipment, type ShipmentInput,
} from '@/lib/shipments';
import {
  SHIPMENT_STATUSES, SHIPMENT_DIRECTIONS, SHIPMENT_MODES,
  type ShipmentStatus, type ShipmentDirection, type ShipmentMode,
} from '@/lib/shipment-status';
import { fetchCustomers, fetchCustomerAddresses, type BusinessCustomer } from '@/lib/customers';
import { CURRENCIES, type Currency } from '@/lib/businesses';
import { errorMessage } from '@/lib/errors';

/**
 * Create / edit a shipment.
 *
 * On create, `?template=<id>` pre-fills from a shipment_template's data.
 * A "Save as template" button captures the current form state minus
 * status/dates as a reusable template — the exact anti-double-saisie
 * feature pro users came here for.
 *
 * Client picker: when a customer is selected, we surface their default
 * shipping address (if any) as a one-click prefill for the destination
 * block. Everything else stays manually editable.
 */
export default function BusinessShipmentForm() {
  const { t } = useTranslation();
  const { current, can } = useBusiness();
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [f, setF] = useState<ShipmentInput>(() => emptyShipment(current?.currency ?? 'EUR'));

  useEffect(() => {
    if (!current) return;
    void fetchCustomers(current.id).then(setCustomers);

    if (isNew) {
      const tplId = search.get('template');
      if (tplId) {
        void fetchTemplates(current.id).then((tpls) => {
          const tpl = tpls.find((x) => x.id === tplId);
          if (tpl) setF((p) => ({ ...p, ...tpl.data, status: 'draft' }));
        });
      }
      setLoading(false);
      return;
    }

    fetchShipment(id!).then((s) => {
      if (s) {
        const { id: _id, business_id: _bid, reference: _ref, created_by: _cb, created_at: _ca, updated_at: _ua, ...rest } = s;
        setF(rest);
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, id, isNew]);

  const canWrite = can('shipments.write');
  const set = <K extends keyof ShipmentInput>(k: K, v: ShipmentInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const setStr = <K extends keyof ShipmentInput>(k: K) => (v: string) => set(k, (v || null) as ShipmentInput[K]);

  const onPickCustomer = async (cid: string | null) => {
    set('customer_id', cid);
    if (!cid) return;
    // Prefill destination with the customer's default shipping address (if any + still empty).
    const addrs = await fetchCustomerAddresses(cid);
    const def = addrs.find((a) => a.is_default_shipping) ?? addrs[0];
    if (!def) return;
    setF((p) => ({
      ...p,
      destination_name: p.destination_name ?? customers.find((c) => c.id === cid)?.display_name ?? null,
      destination_address_line1: p.destination_address_line1 ?? def.address_line1,
      destination_address_line2: p.destination_address_line2 ?? def.address_line2,
      destination_postal_code:   p.destination_postal_code   ?? def.postal_code,
      destination_city:          p.destination_city          ?? def.city,
      destination_country:       p.destination_country       ?? def.country,
    }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setSaving(true);
    try {
      const saved = await upsertShipment(current.id, { id: isNew ? undefined : id, ...f });
      toast.success(t('business_shipment_form.saved'));
      navigate(`../${saved.id}`, { relative: 'path', replace: true });
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setSaving(false); }
  };

  const onSaveTemplate = async () => {
    if (!current) return;
    const name = prompt(t('business_shipment_form.template_name_prompt'));
    if (!name) return;
    setSavingTpl(true);
    try {
      // Strip fields that shouldn't persist in a template.
      const { status: _s, actual_pickup: _ap, actual_delivery: _ad,
              estimated_pickup: _ep, estimated_delivery: _ed,
              tracking_number: _tn, ...tplData } = f;
      await saveTemplate(current.id, name, null, tplData);
      toast.success(t('business_shipment_form.template_saved'));
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setSavingTpl(false); }
  };

  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;
  if (!current) return null;

  return (
    <>
      <SEO title={isNew ? t('business_shipment_form.meta_new') : t('business_shipment_form.meta_edit')} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_shipment_form.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
          <Package className="h-6 w-6" />
          {isNew ? t('business_shipment_form.title_new') : t('business_shipment_form.title_edit')}
        </h1>
        {canWrite && (
          <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={savingTpl} onClick={onSaveTemplate}>
            {savingTpl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
            {t('business_shipment_form.save_as_template')}
          </Button>
        )}
      </div>

      {!canWrite && (
        <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          {t('business_shipment_form.readonly_note')}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-6 max-w-4xl">
        <Card title={t('business_shipment_form.section_basics')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('business_shipment_form.field_client')}>
              <Select value={f.customer_id ?? '__none'} onValueChange={(v) => onPickCustomer(v === '__none' ? null : v)} disabled={!canWrite}>
                <SelectTrigger><SelectValue placeholder={t('business_shipment_form.field_client_placeholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t('business_shipment_form.no_client')}</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('business_shipment_form.field_status')}>
              <Select value={f.status} onValueChange={(v) => set('status', v as ShipmentStatus)} disabled={!canWrite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`shipment_status.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('business_shipment_form.field_direction')}>
              <Select value={f.direction} onValueChange={(v) => set('direction', v as ShipmentDirection)} disabled={!canWrite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>{t(`shipment_direction.${d}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('business_shipment_form.field_mode')}>
              <Select value={f.mode} onValueChange={(v) => set('mode', v as ShipmentMode)} disabled={!canWrite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{t(`shipment_mode.${m}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('business_shipment_form.field_incoterm')}>
              <Input value={f.incoterm ?? ''} onChange={(e) => setStr('incoterm')(e.target.value.toUpperCase().slice(0, 5))}
                className="uppercase font-mono" placeholder="DAP" disabled={!canWrite} />
            </Field>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <AddressCard title={t('business_shipment_form.section_origin')} prefix="origin" f={f} set={set} setStr={setStr} disabled={!canWrite} />
          <AddressCard title={<span className="inline-flex items-center gap-2"><ArrowRight className="h-4 w-4" />{t('business_shipment_form.section_destination')}</span>}
            prefix="destination" f={f} set={set} setStr={setStr} disabled={!canWrite} />
        </div>

        <Card title={t('business_shipment_form.section_carrier')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('business_shipment_form.field_carrier_name')}>
              <Input value={f.carrier_name ?? ''} onChange={(e) => setStr('carrier_name')(e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_tracking_number')}>
              <Input value={f.tracking_number ?? ''} onChange={(e) => setStr('tracking_number')(e.target.value)} disabled={!canWrite} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label={t('business_shipment_form.field_estimated_pickup')}>
              <Input type="date" value={f.estimated_pickup ?? ''} onChange={(e) => setStr('estimated_pickup')(e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_actual_pickup')}>
              <Input type="date" value={f.actual_pickup ?? ''} onChange={(e) => setStr('actual_pickup')(e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_estimated_delivery')}>
              <Input type="date" value={f.estimated_delivery ?? ''} onChange={(e) => setStr('estimated_delivery')(e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_actual_delivery')}>
              <Input type="date" value={f.actual_delivery ?? ''} onChange={(e) => setStr('actual_delivery')(e.target.value)} disabled={!canWrite} />
            </Field>
          </div>
        </Card>

        <Card title={t('business_shipment_form.section_totals')} hint={t('business_shipment_form.section_totals_hint')}>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label={t('business_shipment_form.field_weight_kg')}>
              <Input type="number" step="0.001" value={f.total_weight_kg ?? ''}
                onChange={(e) => set('total_weight_kg', e.target.value === '' ? null : Number(e.target.value))} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_volume_m3')}>
              <Input type="number" step="0.0001" value={f.total_volume_m3 ?? ''}
                onChange={(e) => set('total_volume_m3', e.target.value === '' ? null : Number(e.target.value))} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_goods_value')}>
              <Input type="number" step="0.01" value={f.goods_value ?? ''}
                onChange={(e) => set('goods_value', e.target.value === '' ? null : Number(e.target.value))} disabled={!canWrite} />
            </Field>
            <Field label={t('business_shipment_form.field_currency')}>
              <Select value={f.currency} onValueChange={(v) => set('currency', v as Currency)} disabled={!canWrite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Card>

        <Card title={t('business_shipment_form.section_notes')}>
          <Textarea rows={4} value={f.notes ?? ''} onChange={(e) => setStr('notes')(e.target.value)} disabled={!canWrite}
            placeholder={t('business_shipment_form.notes_placeholder')} />
        </Card>

        {canWrite && (
          <div className="flex justify-end gap-2">
            <Button type="submit" variant="navy" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('business_shipment_form.save')}
            </Button>
          </div>
        )}
      </form>
    </>
  );
}

function AddressCard({
  title, prefix, f, set, setStr, disabled,
}: {
  title: React.ReactNode;
  prefix: 'origin' | 'destination';
  f: ShipmentInput;
  set: <K extends keyof ShipmentInput>(k: K, v: ShipmentInput[K]) => void;
  setStr: <K extends keyof ShipmentInput>(k: K) => (v: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const k = (suffix: string) => `${prefix}_${suffix}` as keyof ShipmentInput;
  const g = (suffix: string) => (f[k(suffix)] as string | null) ?? '';

  return (
    <Card title={title}>
      <Field label={t('business_shipment_form.field_addr_name')}>
        <Input value={g('name')} onChange={(e) => setStr(k('name'))(e.target.value)} disabled={disabled} />
      </Field>
      <Field label={t('business_shipment_form.field_addr_line1')}>
        <Input value={g('address_line1')} onChange={(e) => setStr(k('address_line1'))(e.target.value)} disabled={disabled} />
      </Field>
      <Field label={t('business_shipment_form.field_addr_line2')}>
        <Input value={g('address_line2')} onChange={(e) => setStr(k('address_line2'))(e.target.value)} disabled={disabled} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('business_shipment_form.field_addr_postal')}>
          <Input value={g('postal_code')} onChange={(e) => setStr(k('postal_code'))(e.target.value)} disabled={disabled} />
        </Field>
        <div className="sm:col-span-1">
          <Field label={t('business_shipment_form.field_addr_city')}>
            <Input value={g('city')} onChange={(e) => setStr(k('city'))(e.target.value)} disabled={disabled} />
          </Field>
        </div>
        <Field label={t('business_shipment_form.field_addr_country')}>
          <Input minLength={2} maxLength={2} value={g('country')} onChange={(e) => {
            const v = e.target.value.toUpperCase().slice(0, 2);
            set(k('country'), (v || null) as ShipmentInput[keyof ShipmentInput]);
          }} className="font-mono uppercase" disabled={disabled} />
        </Field>
      </div>
    </Card>
  );
}

function Card({ title, hint, children }: { title: React.ReactNode; hint?: string; children: React.ReactNode }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy text-xs uppercase tracking-wide">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
