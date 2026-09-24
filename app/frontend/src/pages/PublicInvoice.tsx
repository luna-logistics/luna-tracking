import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CreditCard, FileX2, Info, Loader2, Printer, ShieldCheck } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { fetchInvoiceByToken, type Party, type PublicInvoice as Inv } from '@/lib/invoices';
import { startInvoicePayment } from '@/lib/payment';
import { urlFor } from '@/lib/url/routes';

/**
 * /facture/:token — the customer's copy of an internal FAC-… invoice, reached
 * from the invoice e-mail (no login: the token is unguessable). Shows the
 * invoice (printable) and, when the platform business allows it, a Stripe
 * payment button. Stripe only collects the amount; this internal invoice
 * stays the document of record.
 */
export default function PublicInvoice() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const { token = '' } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const returnState = params.get('paiement');
  const [inv, setInv] = useState<Inv | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // After a successful Stripe return the webhook may land a few seconds later:
  // poll briefly so the page switches to "paid" by itself.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const load = async () => {
      const r = await fetchInvoiceByToken(token);
      if (cancelled) return;
      setInv(r); setLoading(false);
      if (returnState === 'ok' && r && r.status !== 'paid' && tries++ < 10) setTimeout(load, 2000);
    };
    void load();
    return () => { cancelled = true; };
  }, [token, returnState]);

  const pay = async () => {
    setPaying(true); setPayError(null);
    const res = await startInvoicePayment(token, lang);
    if (res.status === 'redirect') { window.location.href = res.url; return; }
    setPayError(res.message);
    setPaying(false);
  };

  if (loading) return <div className="py-24 text-center text-slate-500">{t('common.loading')}</div>;

  if (!inv) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <SEO title={t('public_invoice.not_found_title')} noindex />
        <FileX2 className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-luna-navy">{t('public_invoice.not_found_title')}</h1>
        <p className="mt-2 text-slate-600">{t('public_invoice.not_found_body')}</p>
        <Button asChild variant="navy" className="mt-6"><Link to={urlFor('contact', lang)}>{t('public_invoice.contact')}</Link></Button>
      </div>
    );
  }

  const cur = inv.currency;
  const money = (v: number | string) => `${Number(v).toFixed(2)} ${cur}`;
  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-BE') : '—');
  const paid = inv.status === 'paid';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <SEO title={`${t('business_invoices.print_title')} ${inv.number ?? ''}`} noindex />

      <div className="print:hidden mb-6 space-y-3">
        {paid && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{t('public_invoice.paid_notice', { date: fmtDate(inv.paid_on) })}</p>
          </div>
        )}
        {!paid && returnState === 'ok' && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
            <p>{t('public_invoice.payment_confirming')}</p>
          </div>
        )}
        {!paid && returnState === 'annule' && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{t('public_invoice.payment_cancelled')}</p>
          </div>
        )}
        {inv.status === 'cancelled' && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{t('public_invoice.cancelled_notice')}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {inv.payable && !paid && (
            <Button variant="navy" size="lg" onClick={pay} disabled={paying}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
              {t('public_invoice.pay', { amount: money(inv.total) })}
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />{t('business_invoices.print')}
          </Button>
        </div>
        {inv.payable && !paid && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{t('public_invoice.secure_note')}
          </p>
        )}
        {!inv.payable && !paid && inv.status !== 'cancelled' && (
          <p className="text-sm text-slate-600">{t('public_invoice.not_payable_notice')}</p>
        )}
        {payError && <p role="alert" className="text-sm text-red-700">{payError}</p>}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-print, .invoice-print * { visibility: visible; }
          .invoice-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <article className="invoice-print rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <header className="flex flex-col gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('business_invoices.print_from')}</p>
            <PartyBlock party={inv.supplier_party} />
          </div>
          <div className="sm:text-right">
            <h1 className="text-2xl font-bold text-luna-navy">{t('business_invoices.print_title')}</h1>
            <p className="mt-1 font-mono text-lg">{inv.number ?? '—'}</p>
            <div className="mt-3 space-y-0.5 text-xs text-slate-600">
              <p>{t('business_invoices.print_issued')} : <span className="font-medium">{fmtDate(inv.issued_on)}</span></p>
              <p>{t('business_invoices.print_due')} : <span className="font-medium">{fmtDate(inv.due_on)}</span></p>
              {inv.paid_on && <p className="text-emerald-800">{t('business_invoices.print_paid')} : {fmtDate(inv.paid_on)}</p>}
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('business_invoices.print_bill_to')}</p>
            <PartyBlock party={inv.customer_party} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('business_invoices.print_payment')}</p>
            {inv.payment_terms && <p className="text-sm">{inv.payment_terms}</p>}
            {inv.payment_reference && <p className="mt-1 font-mono text-sm">{inv.payment_reference}</p>}
          </div>
        </section>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b-2 border-luna-navy text-luna-navy">
                <th className="py-2 text-left font-semibold">{t('business_invoices.line_desc')}</th>
                <th className="py-2 text-right font-semibold">{t('business_invoices.line_qty')}</th>
                <th className="py-2 text-right font-semibold">{t('business_invoices.line_unit')}</th>
                <th className="py-2 text-right font-semibold">{t('business_invoices.line_vat')}</th>
                <th className="py-2 text-right font-semibold">{t('business_invoices.line_total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2">{l.description}</td>
                  <td className="py-2 text-right">{Number(l.quantity)}</td>
                  <td className="py-2 text-right">{money(l.unit_price)}</td>
                  <td className="py-2 text-right text-slate-500">{Number(l.vat_pct)}%</td>
                  <td className="py-2 text-right font-semibold">{money(Number(l.quantity) * Number(l.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">{t('business_invoices.print_subtotal')}</dt><dd className="font-medium">{money(inv.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">{t('business_invoices.print_vat')}</dt><dd className="font-medium">{money(inv.vat_total)}</dd></div>
            <div className="mt-2 flex justify-between border-t border-slate-300 pt-2 text-base">
              <dt className="font-bold text-luna-navy">{t('business_invoices.print_total')}</dt>
              <dd className="font-bold text-luna-navy">{money(inv.total)}</dd>
            </div>
          </dl>
        </div>

        {inv.notes && (
          <p className="mt-8 whitespace-pre-wrap border-t border-slate-200 pt-4 text-xs text-slate-600">{inv.notes}</p>
        )}
      </article>
    </div>
  );
}

function PartyBlock({ party }: { party: Party }) {
  const cityLine = [party.postal_code, party.city].filter(Boolean).join(' ');
  return (
    <div className="mt-1 space-y-0.5 text-sm text-slate-700">
      {(party.legal_name || party.name) && <p className="font-semibold text-luna-navy">{party.legal_name || party.name}</p>}
      {party.address_line1 && <p>{party.address_line1}</p>}
      {party.address_line2 && <p>{party.address_line2}</p>}
      {cityLine && <p>{cityLine}</p>}
      {party.country && <p>{party.country}</p>}
      {party.vat_number && <p className="mt-1 text-xs text-slate-500">TVA / VAT : {party.vat_number}</p>}
    </div>
  );
}
