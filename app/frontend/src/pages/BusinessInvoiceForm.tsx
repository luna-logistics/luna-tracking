import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  emptyInvoice, fetchInvoice, upsertInvoice,
  fetchInvoiceLines, upsertInvoiceLine, deleteInvoiceLine,
  type InvoiceInput, type InvoiceLine, type Party,
} from '@/lib/invoices';
import { CURRENCIES, type Currency } from '@/lib/businesses';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

type CustomerRef = { id: string; display_name: string };

export default function BusinessInvoiceForm() {
  const { t } = useTranslation();
  const { current } = useBusiness();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [f, setF] = useState<InvoiceInput>(emptyInvoice((current?.currency as Currency) ?? 'EUR'));
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!current) return;
    void supabase.from('business_customers').select('id, display_name').eq('business_id', current.id)
      .then(({ data }) => setCustomers((data ?? []) as CustomerRef[]));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    void Promise.all([fetchInvoice(id), fetchInvoiceLines(id)]).then(([inv, ls]) => {
      if (inv) setF({ ...inv });
      setLines(ls);
      setLoading(false);
    });
  }, [id]);

  const reloadLines = async () => {
    if (id) setLines(await fetchInvoiceLines(id));
  };

  if (!current) return null;
  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await upsertInvoice(current.id, f);
      toast.success(t('business_invoices.saved'));
      navigate(`../${saved.id}`);
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const patchParty = (which: 'supplier_party' | 'customer_party', key: keyof Party, v: string) => {
    setF((p) => ({ ...p, [which]: { ...p[which], [key]: v || null } }));
  };

  return (
    <>
      <SEO title={isEdit ? t('business_invoices.title_edit') : t('business_invoices.title_new')} noindex />
      <div className="flex items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={isEdit ? '..' : '../..'}><ArrowLeft className="h-4 w-4" />{t('business_invoices.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy">
          {isEdit ? t('business_invoices.title_edit') : t('business_invoices.title_new')}
        </h1>
      </div>

      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Section title={t('business_invoices.section_basics')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('business_invoices.f_customer')}>
                <Select value={f.customer_id ?? '__none__'} onValueChange={(v) => setF((p) => ({ ...p, customer_id: v === '__none__' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('business_invoices.f_customer_placeholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— {t('business_invoices.no_customer')} —</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('business_invoices.f_currency')}>
                <Select value={f.currency} onValueChange={(v) => setF((p) => ({ ...p, currency: v as Currency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t('business_invoices.f_due_on')}>
                <Input type="date" value={f.due_on ?? ''} onChange={(e) => setF((p) => ({ ...p, due_on: e.target.value || null }))} />
              </Field>
            </div>
          </Section>

          <Section title={t('business_invoices.section_supplier')}>
            <PartyFields party={f.supplier_party} onChange={(k, v) => patchParty('supplier_party', k, v)} />
          </Section>
          <Section title={t('business_invoices.section_customer')}>
            <PartyFields party={f.customer_party} onChange={(k, v) => patchParty('customer_party', k, v)} />
          </Section>

          <Section title={t('business_invoices.section_payment')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('business_invoices.f_payment_terms')}>
                <Input value={f.payment_terms ?? ''} onChange={(e) => setF((p) => ({ ...p, payment_terms: e.target.value || null }))}
                  placeholder="30 jours net" />
              </Field>
              <Field label={t('business_invoices.f_payment_reference')}>
                <Input value={f.payment_reference ?? ''} onChange={(e) => setF((p) => ({ ...p, payment_reference: e.target.value || null }))}
                  placeholder="+++123/4567/89012+++" />
              </Field>
              <Field label={t('business_invoices.f_endpoint_scheme')}>
                <Input value={f.endpoint_scheme ?? ''} onChange={(e) => setF((p) => ({ ...p, endpoint_scheme: e.target.value || null }))}
                  placeholder="9925 (BE VAT)" />
              </Field>
              <Field label={t('business_invoices.f_endpoint_id')}>
                <Input value={f.endpoint_id ?? ''} onChange={(e) => setF((p) => ({ ...p, endpoint_id: e.target.value || null }))}
                  placeholder="BE0123456789" />
              </Field>
            </div>
          </Section>

          <Section title={t('business_invoices.section_notes')}>
            <Textarea rows={3} value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value || null }))} />
          </Section>
        </div>

        <div className="space-y-4">
          <Section title={t('business_invoices.section_help')}>
            <p className="text-sm text-slate-600">{t('business_invoices.help_peppol')}</p>
            <p className="mt-2 text-xs text-slate-500 italic">{t('business_invoices.help_lines_note')}</p>
          </Section>
        </div>

        <div className="lg:col-span-3 flex justify-end gap-2">
          <Button asChild variant="ghost" type="button">
            <Link to={isEdit ? '..' : '../..'}>{t('business_invoices.cancel')}</Link>
          </Button>
          <Button type="submit" variant="navy" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('business_invoices.save')}
          </Button>
        </div>
      </form>

      {isEdit && (
        <LinesEditor invoiceId={id!} lines={lines} onChanged={reloadLines} readOnly={f.status !== 'draft'} />
      )}
    </>
  );
}

/* ─── Party fields ─────────────────────────────────────────────── */

function PartyFields({ party, onChange }: { party: Party; onChange: (k: keyof Party, v: string) => void }) {
  const { t } = useTranslation();
  const K = (k: keyof Party) => (party[k] ?? '') as string;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('business_invoices.p_name')}>
        <Input value={K('name')} onChange={(e) => onChange('name', e.target.value)} />
      </Field>
      <Field label={t('business_invoices.p_vat_number')}>
        <Input value={K('vat_number')} onChange={(e) => onChange('vat_number', e.target.value)} placeholder="BE0123456789" />
      </Field>
      <Field label={t('business_invoices.p_line1')}>
        <Input value={K('address_line1')} onChange={(e) => onChange('address_line1', e.target.value)} />
      </Field>
      <Field label={t('business_invoices.p_line2')}>
        <Input value={K('address_line2')} onChange={(e) => onChange('address_line2', e.target.value)} />
      </Field>
      <Field label={t('business_invoices.p_postal')}>
        <Input value={K('postal_code')} onChange={(e) => onChange('postal_code', e.target.value)} />
      </Field>
      <Field label={t('business_invoices.p_city')}>
        <Input value={K('city')} onChange={(e) => onChange('city', e.target.value)} />
      </Field>
      <Field label={t('business_invoices.p_country')}>
        <Input value={K('country')} onChange={(e) => onChange('country', e.target.value)} maxLength={2} className="uppercase font-mono" />
      </Field>
      <Field label={t('business_invoices.p_email')}>
        <Input value={K('email')} onChange={(e) => onChange('email', e.target.value)} type="email" />
      </Field>
    </div>
  );
}

/* ─── Lines editor ─────────────────────────────────────────────── */

function LinesEditor({
  invoiceId, lines, onChanged, readOnly,
}: {
  invoiceId: string; lines: InvoiceLine[];
  onChanged: () => Promise<void>; readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<InvoiceLine | 'new' | null>(null);

  const sub = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const vat = lines.reduce((s, l) => s + l.quantity * l.unit_price * (l.vat_pct / 100), 0);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-luna-navy">{t('business_invoices.lines_title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            HT: {sub.toFixed(2)} · TVA: {vat.toFixed(2)} · TTC: {(sub + vat).toFixed(2)}
          </p>
        </div>
        {!readOnly && !editing && (
          <Button size="sm" variant="navy" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />{t('business_invoices.line_add')}
          </Button>
        )}
      </div>

      {editing && (
        <LineForm invoiceId={invoiceId} line={editing === 'new' ? null : editing}
          nextIndex={lines.length + 1}
          onDone={async () => { await onChanged(); setEditing(null); }}
          onCancel={() => setEditing(null)} />
      )}

      {!editing && lines.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
          {t('business_invoices.lines_empty')}
        </div>
      )}

      {!editing && lines.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">#</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_invoices.line_desc')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_invoices.line_qty')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_invoices.line_unit')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_invoices.line_vat')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_invoices.line_total')}</th>
                {!readOnly && <th className="text-right px-4 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-slate-500">{l.line_index}</td>
                  <td className="px-4 py-2">{l.description}</td>
                  <td className="px-4 py-2 text-right">{Number(l.quantity)}</td>
                  <td className="px-4 py-2 text-right">{Number(l.unit_price).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{Number(l.vat_pct)}%</td>
                  <td className="px-4 py-2 text-right font-semibold text-luna-navy">
                    {(Number(l.quantity) * Number(l.unit_price)).toFixed(2)}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(l)}>edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm(t('business_invoices.line_delete_confirm'))) return;
                          try { await deleteInvoiceLine(l.id); await onChanged(); }
                          catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LineForm({
  invoiceId, line, nextIndex, onDone, onCancel,
}: {
  invoiceId: string; line: InvoiceLine | null; nextIndex: number;
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    line_index: line?.line_index ?? nextIndex,
    description: line?.description ?? '',
    quantity: line?.quantity ?? 1,
    unit_price: line?.unit_price ?? 0,
    vat_pct: line?.vat_pct ?? 21,
    item_code: line?.item_code ?? '',
  });
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!f.description.trim()) return;
      setBusy(true);
      try {
        await upsertInvoiceLine(invoiceId, {
          id: line?.id,
          line_index: f.line_index,
          description: f.description.trim(),
          quantity: Number(f.quantity),
          unit_price: Number(f.unit_price),
          vat_pct: Number(f.vat_pct),
          item_code: f.item_code || null,
        });
        await onDone();
      } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
      finally { setBusy(false); }
    }} className="mb-4 rounded-2xl border-2 border-luna-blue/30 bg-white p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[60px_1fr_80px_100px_80px_120px]">
        <Field label="#"><Input type="number" min={1} value={f.line_index} onChange={(e) => setF((p) => ({ ...p, line_index: Number(e.target.value) }))} /></Field>
        <Field label={t('business_invoices.line_desc')}>
          <Input value={f.description} required onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
        </Field>
        <Field label={t('business_invoices.line_qty')}>
          <Input type="number" step="0.01" min="0.01" value={f.quantity} onChange={(e) => setF((p) => ({ ...p, quantity: Number(e.target.value) }))} />
        </Field>
        <Field label={t('business_invoices.line_unit')}>
          <Input type="number" step="0.01" min="0" value={f.unit_price} onChange={(e) => setF((p) => ({ ...p, unit_price: Number(e.target.value) }))} />
        </Field>
        <Field label={t('business_invoices.line_vat')}>
          <Input type="number" step="0.5" min="0" max="100" value={f.vat_pct} onChange={(e) => setF((p) => ({ ...p, vat_pct: Number(e.target.value) }))} />
        </Field>
        <Field label={t('business_invoices.line_code')}>
          <Input value={f.item_code} onChange={(e) => setF((p) => ({ ...p, item_code: e.target.value }))} placeholder="SKU" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t('business_invoices.cancel')}</Button>
        <Button type="submit" variant="navy" disabled={busy || !f.description.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('business_invoices.save')}
        </Button>
      </div>
    </form>
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
