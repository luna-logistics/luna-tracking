import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Pencil, Trash2, Send, CheckCircle2, XCircle, Loader2,
  Plus, Save, ArrowRight, Package, MapPin, Link2,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchQuote, fetchQuoteLines, upsertQuoteLine, deleteQuoteLine,
  updateQuoteStatus, deleteQuote, acceptQuoteToShipment,
  professionalMargin, sumLines, QUOTE_STATUS_STYLES,
  type Quote, type QuoteLine,
} from '@/lib/quotes';
import { fetchCustomer, type BusinessCustomer } from '@/lib/customers';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export default function BusinessQuoteDetail() {
  const { t } = useTranslation();
  const { can } = useBusiness();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<BusinessCustomer | null>(null);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const q = await fetchQuote(id);
    setQuote(q);
    if (q) {
      const [ls, c] = await Promise.all([
        fetchQuoteLines(q.id),
        q.customer_id ? fetchCustomer(q.customer_id) : Promise.resolve(null),
      ]);
      setLines(ls); setCustomer(c);
    }
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const canWrite = can('quotes.write');

  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;
  if (!quote) return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-luna-navy">{t('business_quote_detail.not_found_title')}</h1>
      <Button asChild variant="navy" className="mt-4"><Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_quote_detail.back_to_list')}</Link></Button>
    </div>
  );

  const margin = professionalMargin(quote);
  const linesTotal = sumLines(lines);

  const setStatus = async (s: Quote['status']) => {
    setBusy(true);
    try { await updateQuoteStatus(quote.id, s); await reload(); toast.success(t('business_quote_detail.status_updated')); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const convert = async () => {
    if (!confirm(t('business_quote_detail.convert_confirm'))) return;
    setBusy(true);
    try {
      const sid = await acceptQuoteToShipment(quote.id);
      toast.success(t('business_quote_detail.converted'));
      navigate(`/entreprise/expeditions/${sid}`);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(t('business_quote_detail.delete_confirm'))) return;
    setBusy(true);
    try { await deleteQuote(quote.id); toast.success(t('business_quote_detail.deleted')); navigate('..'); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); setBusy(false); }
  };

  const isConvertible = ['draft', 'sent', 'accepted'].includes(quote.status);

  return (
    <>
      <SEO title={quote.reference} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_quote_detail.back_to_list')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy font-mono">{quote.reference}</h1>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', QUOTE_STATUS_STYLES[quote.status])}>
          {t(`quote_status.${quote.status}`)}
        </span>
        {canWrite && (
          <div className="ml-auto flex gap-2 items-center flex-wrap">
            {quote.status === 'draft' && (
              <Button size="sm" variant="outline" onClick={() => setStatus('sent')} disabled={busy}>
                <Send className="h-3.5 w-3.5" />{t('business_quote_detail.mark_sent')}
              </Button>
            )}
            {(quote.status === 'sent' || quote.status === 'draft') && (
              <Button size="sm" variant="outline" onClick={() => setStatus('accepted')} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5" />{t('business_quote_detail.mark_accepted')}
              </Button>
            )}
            {quote.status === 'sent' && (
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setStatus('declined')} disabled={busy}>
                <XCircle className="h-3.5 w-3.5" />{t('business_quote_detail.mark_declined')}
              </Button>
            )}
            {isConvertible && (
              <Button size="sm" variant="navy" onClick={convert} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {t('business_quote_detail.convert')}
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="edit"><Pencil className="h-3.5 w-3.5" />{t('business_quote_detail.edit')}</Link>
            </Button>
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {quote.shipment_id && (
        <div className="mb-4 rounded-2xl border-2 border-purple-300 bg-purple-50 p-3 flex items-center gap-3">
          <Link2 className="h-4 w-4 text-purple-700" aria-hidden="true" />
          <span className="text-sm text-purple-900">{t('business_quote_detail.linked_shipment')}</span>
          <Link to={`/entreprise/expeditions/${quote.shipment_id}`} className="ml-auto text-sm font-semibold text-purple-800 hover:underline">
            {t('business_quote_detail.open_shipment')} →
          </Link>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
            {t('business_quote_detail.section_shipment')}
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Dt>{t('business_quote_form.field_client')}</Dt>
            <Dd>{customer ? customer.display_name : '—'}</Dd>
            <Dt>{t('business_quote_form.field_direction')}</Dt>
            <Dd>{t(`shipment_direction.${quote.direction}`)}</Dd>
            <Dt>{t('business_quote_form.field_mode')}</Dt>
            <Dd>{t(`shipment_mode.${quote.mode}`)}</Dd>
            <Dt>{t('business_quote_form.field_weight')}</Dt>
            <Dd>{quote.weight_kg ? `${Number(quote.weight_kg).toLocaleString()} kg` : '—'}</Dd>
            <Dt>{t('business_quote_form.field_volume')}</Dt>
            <Dd>{quote.volume_m3 ? `${Number(quote.volume_m3).toLocaleString()} m³` : '—'}</Dd>
            <Dt>{t('business_quote_form.field_pieces')}</Dt>
            <Dd>{quote.package_count ?? '—'}</Dd>
            <Dt>{t('business_quote_form.field_valid_until')}</Dt>
            <Dd>{quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : '—'}</Dd>
          </dl>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RouteCard label={t('business_quote_form.section_route') + ' — ' + t('business_quote_form.field_origin_country')}
              city={quote.origin_city} country={quote.origin_country} />
            <RouteCard label={t('business_quote_form.section_route') + ' — ' + t('business_quote_form.field_dest_country')}
              city={quote.destination_city} country={quote.destination_country} />
          </div>

          {quote.notes && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-luna-navy uppercase tracking-wide">
                {t('business_quote_form.section_notes')}
              </h3>
              <p className="mt-1 text-sm text-luna-navy whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border-2 border-luna-blue/30 bg-white p-5">
          <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
            {t('business_quote_form.section_pricing')}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <PriceRow label={t('business_quote_form.field_transport_cost')} value={Number(quote.transport_cost)} cur={quote.currency} muted />
            <PriceRow label={t('business_quote_form.field_customer_price')} value={Number(quote.customer_price)} cur={quote.currency} bold />
            <PriceRow label={t('business_quote_form.field_platform_fee')} value={Number(quote.platform_fee)} cur={quote.currency} muted />
          </dl>
          <div className={cn(
            'mt-3 rounded-xl border p-3',
            margin < 0 ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-300 bg-emerald-50 text-emerald-900',
          )}>
            <p className="text-[11px] uppercase tracking-wide font-semibold">
              {t('business_quote_form.professional_margin')}
            </p>
            <p className="mt-0.5 text-lg font-bold">{margin.toLocaleString()} {quote.currency}</p>
          </div>
          {quote.provider_code && (
            <p className="mt-2 text-[11px] text-slate-500">
              {t('business_quote_form.provider_stamp', { code: quote.provider_code })}
            </p>
          )}
        </section>
      </div>

      <LinesSection quoteId={quote.id} lines={lines} currency={quote.currency} canWrite={canWrite} linesTotal={linesTotal}
        customerPrice={Number(quote.customer_price)} onChanged={reload} />
    </>
  );
}

// ─── Lines editor ─────────────────────────────────────────────────────
function LinesSection({
  quoteId, lines, currency, canWrite, linesTotal, customerPrice, onChanged,
}: {
  quoteId: string; lines: QuoteLine[]; currency: string; canWrite: boolean;
  linesTotal: number; customerPrice: number;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<QuoteLine | 'new' | null>(null);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-luna-navy flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('business_quote_detail.lines_title')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t('business_quote_detail.lines_total', { total: linesTotal.toLocaleString(), currency })}
            {' · '}
            {t('business_quote_detail.lines_vs_price', {
              price: customerPrice.toLocaleString(),
              diff: (customerPrice - linesTotal).toLocaleString(),
            })}
          </p>
        </div>
        {canWrite && !editing && (
          <Button size="sm" variant="navy" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('business_quote_detail.line_add')}
          </Button>
        )}
      </div>

      {editing && (
        <LineForm quoteId={quoteId} line={editing === 'new' ? null : editing}
          nextIndex={lines.length + 1}
          onDone={async () => { await onChanged(); setEditing(null); }}
          onCancel={() => setEditing(null)} />
      )}

      {!editing && lines.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">
          {t('business_quote_detail.lines_empty')}
        </div>
      )}

      {!editing && lines.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">#</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_quote_detail.line_desc')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_quote_detail.line_qty')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_quote_detail.line_unit_price')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_quote_detail.line_total')}</th>
                {canWrite && <th className="text-right px-4 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-slate-500">{l.line_index}</td>
                  <td className="px-4 py-2">{l.description}</td>
                  <td className="px-4 py-2 text-right">{Number(l.quantity).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{Number(l.unit_price).toLocaleString()} {currency}</td>
                  <td className="px-4 py-2 text-right font-semibold text-luna-navy">
                    {(Number(l.quantity) * Number(l.unit_price)).toLocaleString()} {currency}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm(t('business_quote_detail.line_delete_confirm'))) return;
                          try { await deleteQuoteLine(l.id); await onChanged(); }
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
  quoteId, line, nextIndex, onDone, onCancel,
}: {
  quoteId: string; line: QuoteLine | null; nextIndex: number;
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    line_index: line?.line_index ?? nextIndex,
    description: line?.description ?? '',
    quantity: line?.quantity ?? 1,
    unit_price: line?.unit_price ?? 0,
  });
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!f.description.trim()) return;
      setBusy(true);
      try {
        await upsertQuoteLine(quoteId, {
          id: line?.id,
          line_index: f.line_index,
          description: f.description.trim(),
          quantity: Number(f.quantity),
          unit_price: Number(f.unit_price),
        });
        await onDone();
      } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
      finally { setBusy(false); }
    }} className="mb-4 rounded-2xl border-2 border-luna-blue/30 bg-white p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[80px_1fr_100px_120px]">
        <Field label="#"><Input type="number" min={1} value={f.line_index} onChange={(e) => setF((p) => ({ ...p, line_index: Number(e.target.value) }))} /></Field>
        <Field label={t('business_quote_detail.line_desc')}>
          <Input value={f.description} required onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
        </Field>
        <Field label={t('business_quote_detail.line_qty')}>
          <Input type="number" step="0.01" min="0.01" value={f.quantity} onChange={(e) => setF((p) => ({ ...p, quantity: Number(e.target.value) }))} />
        </Field>
        <Field label={t('business_quote_detail.line_unit_price')}>
          <Input type="number" step="0.01" min="0" value={f.unit_price} onChange={(e) => setF((p) => ({ ...p, unit_price: Number(e.target.value) }))} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t('business_quote_form.cancel')}</Button>
        <Button type="submit" variant="navy" disabled={busy || !f.description.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('business_quote_form.save')}
        </Button>
      </div>
    </form>
  );
}

function RouteCard({ label, city, country }: { label: string; city: string | null; country: string | null }) {
  const parts = [city, country].filter(Boolean);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold text-luna-navy uppercase tracking-wide flex items-center gap-1.5">
        <MapPin className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-sm text-luna-navy">{parts.length ? parts.join(', ') : '—'}</p>
    </div>
  );
}

function PriceRow({ label, value, cur, muted, bold }: {
  label: string; value: number; cur: string; muted?: boolean; bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className={cn('text-xs', muted ? 'text-slate-500' : 'text-luna-navy')}>{label}</dt>
      <dd className={cn(bold ? 'font-bold text-luna-navy' : 'text-luna-navy')}>
        {value.toLocaleString()} {cur}
      </dd>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="col-span-1 text-slate-500 text-xs uppercase tracking-wide self-center">{children}</dt>;
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="col-span-2 text-luna-navy">{children}</dd>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy text-xs uppercase tracking-wide">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
