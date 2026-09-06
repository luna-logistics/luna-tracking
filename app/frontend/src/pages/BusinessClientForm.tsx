import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2, User, Building2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchCustomer, upsertCustomer, deriveDisplayName,
  type BusinessCustomer, type CustomerType,
} from '@/lib/customers';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Create / edit a customer. Two shapes (Company vs Individual) share
 * the same form: switching the top toggle just shows the relevant
 * fields. display_name is auto-derived from company_name (company) or
 * first+last (individual) unless the user overrides it explicitly.
 *
 * Addresses live on their own tab in BusinessClientDetail — this form
 * only handles the customer identity + notes.
 */
export default function BusinessClientForm() {
  const { t } = useTranslation();
  const { current, can } = useBusiness();
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [displayNameEdited, setDisplayNameEdited] = useState(!isNew);
  const [f, setF] = useState({
    customer_type: 'company' as CustomerType,
    display_name: '',
    company_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    vat_number: '',
    company_number: '',
    notes: '',
    is_active: true,
  });

  useEffect(() => {
    if (isNew || !id) return;
    fetchCustomer(id).then((c) => {
      if (c) hydrate(c);
      setLoading(false);
    });
  }, [id, isNew]);

  const hydrate = (c: BusinessCustomer) => setF({
    customer_type: c.customer_type,
    display_name: c.display_name,
    company_name: c.company_name ?? '',
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    vat_number: c.vat_number ?? '',
    company_number: c.company_number ?? '',
    notes: c.notes ?? '',
    is_active: c.is_active,
  });

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  // Auto-derive display_name until the admin edits it manually.
  useEffect(() => {
    if (displayNameEdited) return;
    const derived = deriveDisplayName({
      customer_type: f.customer_type,
      company_name: f.company_name,
      first_name: f.first_name,
      last_name: f.last_name,
    });
    if (derived) setF((p) => ({ ...p, display_name: derived }));
  }, [f.customer_type, f.company_name, f.first_name, f.last_name, displayNameEdited]);

  const canWrite = can('clients.write');
  const canSave = canWrite && !!current && !!f.display_name.trim();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !current) return;
    setSaving(true);
    try {
      const saved = await upsertCustomer(current.id, {
        id: isNew ? undefined : id,
        customer_type: f.customer_type,
        display_name: f.display_name.trim(),
        company_name: f.company_name.trim() || null,
        first_name: f.first_name.trim() || null,
        last_name: f.last_name.trim() || null,
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        vat_number: f.vat_number.trim() || null,
        company_number: f.company_number.trim() || null,
        notes: f.notes.trim() || null,
        is_active: f.is_active,
      });
      toast.success(t('business_client_form.saved'));
      navigate(`../${saved.id}`, { relative: 'path', replace: true });
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <>
      <SEO title={isNew ? t('business_client_form.meta_new') : t('business_client_form.meta_edit')} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="h-4 w-4" /> {t('business_client_form.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy">
          {isNew ? t('business_client_form.title_new') : t('business_client_form.title_edit')}
        </h1>
      </div>

      {!canWrite && (
        <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
          {t('business_client_form.readonly_note')}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
        {/* Type toggle */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(['company','individual'] as CustomerType[]).map((typ) => (
            <button key={typ} type="button" disabled={!canWrite}
              onClick={() => set('customer_type', typ)}
              className={cn(
                'rounded-2xl border-2 p-4 text-left transition-colors',
                f.customer_type === typ
                  ? 'border-luna-blue bg-luna-navy/[0.03]'
                  : 'border-slate-200 bg-white hover:border-luna-blue/40',
              )}>
              <div className="flex items-center gap-2 text-luna-navy font-semibold">
                {typ === 'company' ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
                {t(`business_clients.type_${typ}`)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {t(`business_client_form.type_${typ}_hint`)}
              </div>
            </button>
          ))}
        </div>

        <Card title={t('business_client_form.section_identity')}>
          {f.customer_type === 'company' ? (
            <>
              <Field label={t('business_client_form.field_company_name')} required>
                <Input value={f.company_name} onChange={(e) => set('company_name', e.target.value)}
                  disabled={!canWrite} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('business_client_form.field_contact_first_name')}>
                  <Input value={f.first_name} onChange={(e) => set('first_name', e.target.value)} disabled={!canWrite} />
                </Field>
                <Field label={t('business_client_form.field_contact_last_name')}>
                  <Input value={f.last_name} onChange={(e) => set('last_name', e.target.value)} disabled={!canWrite} />
                </Field>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('business_client_form.field_first_name')} required>
                <Input value={f.first_name} onChange={(e) => set('first_name', e.target.value)} disabled={!canWrite} required />
              </Field>
              <Field label={t('business_client_form.field_last_name')} required>
                <Input value={f.last_name} onChange={(e) => set('last_name', e.target.value)} disabled={!canWrite} required />
              </Field>
            </div>
          )}
          <Field label={t('business_client_form.field_display_name')} hint={t('business_client_form.field_display_name_hint')}>
            <Input value={f.display_name}
              onChange={(e) => { set('display_name', e.target.value); setDisplayNameEdited(true); }}
              disabled={!canWrite} />
          </Field>
        </Card>

        <Card title={t('business_client_form.section_contact')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('business_client_form.field_email')}>
              <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label={t('business_client_form.field_phone')}>
              <Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} disabled={!canWrite} />
            </Field>
          </div>
        </Card>

        {f.customer_type === 'company' && (
          <Card title={t('business_client_form.section_invoicing')} hint={t('business_client_form.section_invoicing_hint')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('business_client_form.field_vat')}>
                <Input value={f.vat_number} onChange={(e) => set('vat_number', e.target.value)}
                  disabled={!canWrite} placeholder="BE0123456789" />
              </Field>
              <Field label={t('business_client_form.field_company_number')}>
                <Input value={f.company_number} onChange={(e) => set('company_number', e.target.value)} disabled={!canWrite} />
              </Field>
            </div>
          </Card>
        )}

        <Card title={t('business_client_form.section_notes')}>
          <Textarea rows={5} value={f.notes} onChange={(e) => set('notes', e.target.value)}
            disabled={!canWrite} placeholder={t('business_client_form.field_notes_placeholder')} />
        </Card>

        {canWrite && (
          <div className="flex justify-end">
            <Button type="submit" variant="navy" disabled={saving || !canSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('business_client_form.save')}
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

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
