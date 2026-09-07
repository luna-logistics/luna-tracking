import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2, Calculator } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  emptyQuote, fetchQuote, upsertQuote, professionalMargin,
  type QuoteInput,
} from '@/lib/quotes';
import { calculateRates } from '@/lib/rates';
import { fetchCustomers, type BusinessCustomer } from '@/lib/customers';
import { CURRENCIES, type Currency } from '@/lib/businesses';
import { SHIPMENT_DIRECTIONS, SHIPMENT_MODES } from '@/lib/shipment-status';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Quote form. Full pricing panel with cost / customer price / platform
 * fee / professional margin — computed live, only shown to team members.
 * A "Suggest a rate" button consults the public calculate_rates() RPC
 * and copies the chosen price into transport_cost.
 */
export default function BusinessQuoteForm() {
  const { t } = useTranslation();
  const { current } = useBusiness();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [f, setF] = useState<QuoteInput>(emptyQuote(current?.currency as Currency ?? 'EUR'));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!current) return;
    void fetchCustomers(current.id).then(setCustomers);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    void fetchQuote(id).then((q) => {
      if (q) setF({ ...q });
      setLoading(false);
    });
  }, [id]);

  if (!current) return null;
  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;

  const num = (v: string) => v === '' ? null : Number(v);
  const marginNow = professionalMargin(f as unknown as { customer_price: number; transport_cost: number; platform_fee: number });

  const suggestRate = async () => {
    if (!f.origin_country || !f.destination_country) {
      toast.error(t('business_quote_form.suggest_needs_countries'));
      return;
    }
    setSuggesting(true);
    try {
      const rates = await calculateRates({
        origin: f.origin_country,
        destination: f.destination_country,
        mode: f.mode,
        weight_kg: f.weight_kg ?? 0,
        volume_m3: f.volume_m3 ?? 0,
      });
      if (rates.length === 0) {
        toast.info(t('business_quote_form.suggest_no_result'));
        return;
      }
      const pick = rates[0];
      setF((p) => ({
        ...p,
        transport_cost: Number(pick.customer_price),
        currency: (pick.currency as Currency) ?? p.currency,
        provider_code: pick.provider_code,
      }));
      toast.success(t('business_quote_form.suggest_applied', { code: pick.provider_code, price: pick.customer_price, currency: pick.currency }));
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setSuggesting(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await upsertQuote(current.id, f);
      toast.success(t('business_quote_form.saved'));
      navigate(`../${saved.id}`);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SEO title={isEdit ? f.notes || t('business_quote_form.title_edit') : t('business_quote_form.title_new')} noindex />
      <div className="flex items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={isEdit ? '..' : '../..'}><ArrowLeft className="h-4 w-4" />{t('business_quote_form.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy">
          {isEdit ? t('business_quote_form.title_edit') : t('business_quote_form.title_new')}
        </h1>
      </div>

      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        {/* Basics + route */}
        <div className="lg:col-span-2 space-y-4">
          <Section title={t('business_quote_form.section_basics')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('business_quote_form.field_client')}>
                <Select value={f.customer_id ?? '__none__'} onValueChange={(v) => setF((p) => ({ ...p, customer_id: v === '__none__' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('business_quote_form.field_client_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— {t('business_quote_form.no_client')} —</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('business_quote_form.field_valid_until')}>
                <Input type="date" value={f.valid_until ?? ''} onChange={(e) => setF((p) => ({ ...p, valid_until: e.target.value || null }))} />
              </Field>
              <Field label={t('business_quote_form.field_direction')}>
                <Select value={f.direction} onValueChange={(v) => setF((p) => ({ ...p, direction: v as typeof p.direction }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIPMENT_DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{t(`shipment_direction.${d}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t('business_quote_form.field_mode')}>
                <Select value={f.mode} onValueChange={(v) => setF((p) => ({ ...p, mode: v as typeof p.mode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SHIPMENT_MODES.map((m) => <SelectItem key={m} value={m}>{t(`shipment_mode.${m}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title={t('business_quote_form.section_route')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('business_quote_form.field_origin_country')}>
                <Input maxLength={2} value={f.origin_country ?? ''} className="uppercase font-mono"
                  onChange={(e) => setF((p) => ({ ...p, origin_country: e.target.value.toUpperCase().slice(0, 2) || null }))} />
              </Field>
              <Field label={t('business_quote_form.field_origin_city')}>
                <Input value={f.origin_city ?? ''} onChange={(e) => setF((p) => ({ ...p, origin_city: e.target.value || null }))} />
              </Field>
              <Field label={t('business_quote_form.field_dest_country')}>
                <Input maxLength={2} value={f.destination_country ?? ''} className="uppercase font-mono"
                  onChange={(e) => setF((p) => ({ ...p, destination_country: e.target.value.toUpperCase().slice(0, 2) || null }))} />
              </Field>
              <Field label={t('business_quote_form.field_dest_city')}>
                <Input value={f.destination_city ?? ''} onChange={(e) => setF((p) => ({ ...p, destination_city: e.target.value || null }))} />
              </Field>
            </div>
          </Section>

          <Section title={t('business_quote_form.section_measure')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('business_quote_form.field_weight')}>
                <Input type="number" step="0.01" value={f.weight_kg ?? ''} onChange={(e) => setF((p) => ({ ...p, weight_kg: num(e.target.value) }))} />
              </Field>
              <Field label={t('business_quote_form.field_volume')}>
                <Input type="number" step="0.001" value={f.volume_m3 ?? ''} onChange={(e) => setF((p) => ({ ...p, volume_m3: num(e.target.value) }))} />
              </Field>
              <Field label={t('business_quote_form.field_pieces')}>
                <Input type="number" step="1" min="0" value={f.package_count ?? ''} onChange={(e) => setF((p) => ({ ...p, package_count: e.target.value === '' ? null : parseInt(e.target.value, 10) }))} />
              </Field>
            </div>
          </Section>

          <Section title={t('business_quote_form.section_notes')}>
            <Textarea rows={3} value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value || null }))} />
          </Section>
        </div>

        {/* Pricing sidebar */}
        <div className="space-y-4">
          <Section title={t('business_quote_form.section_pricing')}>
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={suggestRate} disabled={suggesting}>
                  {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {t('business_quote_form.suggest_rate')}
                </Button>
              </div>
              <Field label={t('business_quote_form.field_transport_cost')}>
                <Input type="number" step="0.01" min="0" value={f.transport_cost} onChange={(e) => setF((p) => ({ ...p, transport_cost: Number(e.target.value) }))} required />
              </Field>
              <Field label={t('business_quote_form.field_customer_price')}>
                <Input type="number" step="0.01" min="0" value={f.customer_price} onChange={(e) => setF((p) => ({ ...p, customer_price: Number(e.target.value) }))} required />
              </Field>
              <Field label={t('business_quote_form.field_platform_fee')}>
                <Input type="number" step="0.01" min="0" value={f.platform_fee} onChange={(e) => setF((p) => ({ ...p, platform_fee: Number(e.target.value) }))} />
              </Field>
              <Field label={t('business_quote_form.field_currency')}>
                <Select value={f.currency} onValueChange={(v) => setF((p) => ({ ...p, currency: v as Currency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className={cn(
                'mt-2 rounded-xl border p-3 text-sm',
                marginNow < 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-300 bg-emerald-50 text-emerald-900',
              )}>
                <p className="text-xs uppercase tracking-wide font-semibold">
                  {t('business_quote_form.professional_margin')}
                </p>
                <p className="mt-1 text-lg font-bold">
                  {marginNow.toLocaleString()} {f.currency}
                </p>
                {marginNow < 0 && (
                  <p className="mt-1 text-xs">{t('business_quote_form.margin_negative_warning')}</p>
                )}
              </div>
              {f.provider_code && (
                <p className="text-[11px] text-slate-500">
                  {t('business_quote_form.provider_stamp', { code: f.provider_code })}
                </p>
              )}
            </div>
          </Section>
        </div>

        <div className="lg:col-span-3 flex justify-end gap-2">
          <Button asChild variant="ghost" type="button">
            <Link to={isEdit ? '..' : '../..'}>{t('business_quote_form.cancel')}</Link>
          </Button>
          <Button type="submit" variant="navy" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('business_quote_form.save')}
          </Button>
        </div>
      </form>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-3">{title}</h2>
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
