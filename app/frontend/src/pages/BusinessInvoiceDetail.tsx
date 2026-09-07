import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Trash2, CheckCircle2, Send, Printer, Loader2, XCircle } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchInvoice, fetchInvoiceLines, issueInvoice, deleteInvoice, updateInvoiceStatus,
  INVOICE_STATUS_STYLES, type Invoice, type InvoiceLine, type Party,
} from '@/lib/invoices';
import { fetchCustomer, type BusinessCustomer } from '@/lib/customers';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Print CSS lives inline (@media print in a <style>) so a single
 *  window.print() call yields an accounting-grade PDF via the OS
 *  dialog. Everything outside .invoice-print is hidden. */
export default function BusinessInvoiceDetail() {
  const { t, i18n } = useTranslation();
  const { can } = useBusiness();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [customer, setCustomer] = useState<BusinessCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  const canWrite = can('invoices.write');

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const inv = await fetchInvoice(id);
    setInvoice(inv);
    if (inv) {
      const [ls, c] = await Promise.all([
        fetchInvoiceLines(inv.id),
        inv.customer_id ? fetchCustomer(inv.customer_id) : Promise.resolve(null),
      ]);
      setLines(ls); setCustomer(c);
    }
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;
  if (!invoice) return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-luna-navy">{t('business_invoices.not_found')}</h1>
      <Button asChild variant="navy" className="mt-4"><Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_invoices.back')}</Link></Button>
    </div>
  );

  const issue = async () => {
    if (!confirm(t('business_invoices.issue_confirm'))) return;
    setBusy(true);
    try { const no = await issueInvoice(invoice.id); toast.success(t('business_invoices.issued', { number: no })); await reload(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };
  const markPaid = async () => {
    setBusy(true);
    try { await updateInvoiceStatus(invoice.id, 'paid', { paid_on: new Date().toISOString().slice(0, 10) }); await reload(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!confirm(t('business_invoices.cancel_confirm'))) return;
    setBusy(true);
    try { await updateInvoiceStatus(invoice.id, 'cancelled'); await reload(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(t('business_invoices.delete_confirm'))) return;
    setBusy(true);
    try { await deleteInvoice(invoice.id); toast.success(t('business_invoices.deleted')); navigate('..'); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); setBusy(false); }
  };

  const cur = invoice.currency;
  const fmtDate = (v: string | null) => v ? new Date(v).toLocaleDateString(lang) : '—';

  return (
    <>
      <SEO title={invoice.number ?? t('business_invoices.draft')} noindex />

      {/* Screen-only toolbar */}
      <div className="print:hidden flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_invoices.back')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy font-mono">
          {invoice.number ?? t('business_invoices.draft')}
        </h1>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', INVOICE_STATUS_STYLES[invoice.status])}>
          {t(`invoice_status.${invoice.status}`)}
        </span>
        {canWrite && (
          <div className="ml-auto flex flex-wrap gap-2">
            {invoice.status === 'draft' && (
              <>
                <Button asChild variant="outline" size="sm"><Link to="edit"><Pencil className="h-3.5 w-3.5" />{t('business_invoices.edit')}</Link></Button>
                <Button size="sm" variant="navy" onClick={issue} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {t('business_invoices.issue')}
                </Button>
              </>
            )}
            {invoice.status === 'issued' && (
              <Button size="sm" variant="outline" onClick={markPaid} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5" />{t('business_invoices.mark_paid')}
              </Button>
            )}
            {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={cancel} disabled={busy}>
                <XCircle className="h-3.5 w-3.5" />{t('business_invoices.cancel_invoice')}
              </Button>
            )}
            {invoice.status === 'draft' && (
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />{t('business_invoices.print')}
            </Button>
          </div>
        )}
      </div>

      {/* Print-friendly invoice body */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print, .invoice-print * { visibility: visible; }
          .invoice-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <article className="invoice-print rounded-2xl border border-slate-200 bg-white p-8">
        <header className="flex items-start justify-between gap-6 border-b pb-6 border-slate-200">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              {t('business_invoices.print_from')}
            </p>
            <PartyBlock party={invoice.supplier_party} />
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-luna-navy">{t('business_invoices.print_title')}</h2>
            <p className="mt-1 font-mono text-lg">{invoice.number ?? '—'}</p>
            <div className="mt-3 text-xs text-slate-600 space-y-0.5">
              <p>{t('business_invoices.print_issued')} : <span className="font-medium">{fmtDate(invoice.issued_on)}</span></p>
              <p>{t('business_invoices.print_due')} : <span className="font-medium">{fmtDate(invoice.due_on)}</span></p>
              {invoice.paid_on && <p className="text-emerald-800">{t('business_invoices.print_paid')} : {fmtDate(invoice.paid_on)}</p>}
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">{t('business_invoices.print_bill_to')}</p>
            <p className="font-semibold text-luna-navy">{customer?.display_name ?? '—'}</p>
            <PartyBlock party={invoice.customer_party} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">{t('business_invoices.print_payment')}</p>
            {invoice.payment_terms && <p className="text-sm">{invoice.payment_terms}</p>}
            {invoice.payment_reference && <p className="text-sm font-mono mt-1">{invoice.payment_reference}</p>}
            {invoice.endpoint_id && (
              <p className="mt-2 text-xs text-slate-500">
                {t('business_invoices.print_peppol_endpoint')} {invoice.endpoint_scheme}:{invoice.endpoint_id}
              </p>
            )}
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="text-luna-navy border-b-2 border-luna-navy">
              <th className="text-left py-2 font-semibold">{t('business_invoices.line_desc')}</th>
              <th className="text-right py-2 font-semibold">{t('business_invoices.line_qty')}</th>
              <th className="text-right py-2 font-semibold">{t('business_invoices.line_unit')}</th>
              <th className="text-right py-2 font-semibold">{t('business_invoices.line_vat')}</th>
              <th className="text-right py-2 font-semibold">{t('business_invoices.line_total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-2">
                  {l.description}
                  {l.item_code && <span className="ml-2 text-xs text-slate-500 font-mono">{l.item_code}</span>}
                </td>
                <td className="py-2 text-right">{Number(l.quantity)}</td>
                <td className="py-2 text-right">{Number(l.unit_price).toFixed(2)} {cur}</td>
                <td className="py-2 text-right text-slate-500">{Number(l.vat_pct)}%</td>
                <td className="py-2 text-right font-semibold">{(Number(l.quantity) * Number(l.unit_price)).toFixed(2)} {cur}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <dl className="w-72 text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-slate-600">{t('business_invoices.print_subtotal')}</dt><dd className="font-medium">{Number(invoice.subtotal).toFixed(2)} {cur}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">{t('business_invoices.print_vat')}</dt><dd className="font-medium">{Number(invoice.vat_total).toFixed(2)} {cur}</dd></div>
            <div className="mt-2 pt-2 border-t border-slate-300 flex justify-between text-base">
              <dt className="font-bold text-luna-navy">{t('business_invoices.print_total')}</dt>
              <dd className="font-bold text-luna-navy">{Number(invoice.total).toFixed(2)} {cur}</dd>
            </div>
          </dl>
        </div>

        {invoice.notes && (
          <p className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-600 whitespace-pre-wrap">
            {invoice.notes}
          </p>
        )}
      </article>
    </>
  );
}

function PartyBlock({ party }: { party: Party }) {
  const cityLine = [party.postal_code, party.city].filter(Boolean).join(' ');
  return (
    <div className="mt-1 text-sm text-slate-700 space-y-0.5">
      {party.name && <p className="font-semibold text-luna-navy">{party.name}</p>}
      {party.address_line1 && <p>{party.address_line1}</p>}
      {party.address_line2 && <p>{party.address_line2}</p>}
      {cityLine && <p>{cityLine}</p>}
      {party.country && <p>{party.country}</p>}
      {party.vat_number && <p className="mt-1 text-xs text-slate-500">TVA : {party.vat_number}</p>}
      {party.email && <p className="text-xs text-slate-500">{party.email}</p>}
    </div>
  );
}
