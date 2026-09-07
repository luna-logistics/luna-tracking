import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wallet, Plus, Search, Pencil, Trash2, Save, Loader2, X, ArrowRight } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import {
  fetchBusinessExpenses, upsertExpense, deleteExpense, emptyExpense,
  EXPENSE_KINDS, type Expense, type ExpenseInput, type ExpenseKind,
} from '@/lib/expenses';
import { CURRENCIES, type Currency } from '@/lib/businesses';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

type ShipmentRef = { id: string; reference: string };

export default function BusinessExpenses() {
  const { t, i18n } = useTranslation();
  const { current, can } = useBusiness();
  const [rows, setRows] = useState<Expense[]>([]);
  const [shipments, setShipments] = useState<ShipmentRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | ExpenseKind>('all');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  const canWrite = can('expenses.write');

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    const [exp, { data: ships }] = await Promise.all([
      fetchBusinessExpenses(current.id),
      supabase.from('shipments').select('id, reference').eq('business_id', current.id).order('reference'),
    ]);
    setRows(exp);
    setShipments((ships ?? []) as ShipmentRef[]);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  const shipRef = (id: string | null) =>
    id ? (shipments.find((s) => s.id === id)?.reference ?? '—') : t('business_expenses.standalone');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (!query) return true;
      return [r.label, r.vendor, r.invoice_ref, shipRef(r.shipment_id)]
        .some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, kind, shipments]);

  if (!current) return null;

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <SEO title={t('business_expenses.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            {t('business_expenses.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_expenses.intro')}</p>
        </div>
        {canWrite && !editing && (
          <Button variant="navy" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('business_expenses.new')}
          </Button>
        )}
      </div>

      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          businessId={current.id} shipments={shipments}
          defaultCurrency={current.currency as Currency}
          onDone={async () => { await reload(); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('business_expenses.search_placeholder')} className="pl-8" />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as 'all' | ExpenseKind)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('business_expenses.kind_all')}</SelectItem>
            {EXPENSE_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`expense_kind.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} / {rows.length} · {t('business_expenses.total')}: <span className="font-semibold text-luna-navy">{total.toLocaleString()} {current.currency}</span>
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('business_expenses.col_date')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_expenses.col_kind')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_expenses.col_label')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_expenses.col_shipment')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('business_expenses.col_vendor')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('business_expenses.col_amount')}</th>
              {canWrite && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">{t('common.loading')}</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">{t('business_expenses.empty')}</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                  {new Date(r.incurred_on).toLocaleDateString(lang)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {t(`expense_kind.${r.kind}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-luna-navy">{r.label}</td>
                <td className="px-4 py-3">
                  {r.shipment_id
                    ? <Link to={`/entreprise/expeditions/${r.shipment_id}`}
                        className="font-mono text-xs text-luna-blue hover:underline inline-flex items-center gap-1">
                        {shipRef(r.shipment_id)} <ArrowRight className="h-3 w-3 opacity-50" />
                      </Link>
                    : <span className="text-slate-500 italic text-xs">{t('business_expenses.standalone')}</span>}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{r.vendor ?? '—'}</td>
                <td className="px-4 py-3 text-right font-semibold text-luna-navy whitespace-nowrap">
                  {Number(r.amount).toLocaleString()} {r.currency}
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        if (!confirm(t('business_expenses.delete_confirm'))) return;
                        try { await deleteExpense(r.id); await reload(); }
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
    </>
  );
}

function ExpenseForm({
  expense, businessId, shipments, defaultCurrency, onDone, onCancel,
}: {
  expense: Expense | null;
  businessId: string;
  shipments: ShipmentRef[];
  defaultCurrency: Currency;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState<ExpenseInput>(expense ?? emptyExpense(defaultCurrency));
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.label.trim()) return;
    setBusy(true);
    try {
      await upsertExpense(businessId, { ...f, id: expense?.id });
      await onDone();
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="mt-4 rounded-2xl border-2 border-luna-blue/30 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-luna-navy">
          {expense ? t('business_expenses.form_title_edit') : t('business_expenses.form_title_new')}
        </h2>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-700">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('business_expenses.f_date')}>
          <Input type="date" value={f.incurred_on} onChange={(e) => setF((p) => ({ ...p, incurred_on: e.target.value }))} required />
        </Field>
        <Field label={t('business_expenses.f_kind')}>
          <Select value={f.kind} onValueChange={(v) => setF((p) => ({ ...p, kind: v as ExpenseKind }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EXPENSE_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`expense_kind.${k}`)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t('business_expenses.f_shipment')}>
          <Select value={f.shipment_id ?? '__none__'} onValueChange={(v) => setF((p) => ({ ...p, shipment_id: v === '__none__' ? null : v }))}>
            <SelectTrigger><SelectValue placeholder={t('business_expenses.standalone')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— {t('business_expenses.standalone')} —</SelectItem>
              {shipments.map((s) => <SelectItem key={s.id} value={s.id}>{s.reference}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={t('business_expenses.f_label')}>
        <Input value={f.label} onChange={(e) => setF((p) => ({ ...p, label: e.target.value }))} required maxLength={200} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t('business_expenses.f_amount')}>
          <Input type="number" step="0.01" min="0" value={f.amount} onChange={(e) => setF((p) => ({ ...p, amount: Number(e.target.value) }))} required />
        </Field>
        <Field label={t('business_expenses.f_currency')}>
          <Select value={f.currency} onValueChange={(v) => setF((p) => ({ ...p, currency: v as Currency }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t('business_expenses.f_vat')}>
          <Input type="number" step="0.1" min="0" max="100" value={f.vat_pct} onChange={(e) => setF((p) => ({ ...p, vat_pct: Number(e.target.value) }))} />
        </Field>
        <Field label={t('business_expenses.f_vendor')}>
          <Input value={f.vendor ?? ''} onChange={(e) => setF((p) => ({ ...p, vendor: e.target.value || null }))} maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('business_expenses.f_invoice_ref')}>
          <Input value={f.invoice_ref ?? ''} onChange={(e) => setF((p) => ({ ...p, invoice_ref: e.target.value || null }))} maxLength={80} />
        </Field>
        <Field label={t('business_expenses.f_notes')}>
          <Textarea rows={1} value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value || null }))} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t('business_expenses.cancel')}</Button>
        <Button type="submit" variant="navy" disabled={busy || !f.label.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('business_expenses.save')}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy text-xs uppercase tracking-wide">{label}</Label>
      <div className={cn('mt-1.5')}>{children}</div>
    </div>
  );
}
