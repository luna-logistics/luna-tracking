import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Pencil, Package, Receipt, ArrowRight,
  Plus, Trash2, Save, Loader2, MapPin, CheckCircle2, Circle,
  Files, Upload, Download, FileText, Image as ImageIcon,
  History, MessageSquarePlus, FilePlus, FileMinus, Sparkles,
  Share2, Copy, RotateCcw, Check,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { ShipmentStatusBadge } from '@/components/ShipmentStatusBadge';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchShipment, fetchPackages, fetchCharges,
  upsertPackage, deletePackage, upsertCharge, deleteCharge,
  updateShipmentStatus, sumBillable,
  setTrackingEnabled, rotateTrackingToken,
  type Shipment, type ShipmentPackage, type ShipmentCharge, type ChargeKind,
} from '@/lib/shipments';
import {
  fetchDocuments, uploadDocument, signedUrl, updateDocument, deleteDocument,
  formatBytes, DOCUMENT_KINDS,
  type ShipmentDocument, type DocumentKind,
} from '@/lib/shipment-documents';
import {
  fetchEvents, addNote,
  type ShipmentEvent,
} from '@/lib/shipment-events';
import { fetchCustomer, type BusinessCustomer } from '@/lib/customers';
import {
  SHIPMENT_PIPELINE, SHIPMENT_STATUSES, type ShipmentStatus,
} from '@/lib/shipment-status';
import { CURRENCIES, type Currency } from '@/lib/businesses';
import { errorMessage } from '@/lib/errors';
import { urlFor, type Lang } from '@/lib/url/routes';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'packages' | 'charges' | 'documents' | 'activity';

/** Shipment detail with pipeline header + 4 tabs. */
export default function BusinessShipmentDetail() {
  const { t } = useTranslation();
  const { can } = useBusiness();
  const { id } = useParams<{ id: string }>();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [customer, setCustomer] = useState<BusinessCustomer | null>(null);
  const [packages, setPackages] = useState<ShipmentPackage[]>([]);
  const [charges, setCharges] = useState<ShipmentCharge[]>([]);
  const [documents, setDocuments] = useState<ShipmentDocument[]>([]);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    const s = await fetchShipment(id);
    setShipment(s);
    if (s) {
      const [p, c, d, ev, cust] = await Promise.all([
        fetchPackages(s.id),
        fetchCharges(s.id),
        fetchDocuments(s.id),
        fetchEvents(s.id),
        s.customer_id ? fetchCustomer(s.customer_id) : Promise.resolve(null),
      ]);
      setPackages(p); setCharges(c); setDocuments(d); setEvents(ev); setCustomer(cust);
    }
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const canWrite = can('shipments.write');

  if (loading) return <div className="py-16 text-center text-slate-500">{t('common.loading')}</div>;
  if (!shipment) return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold text-luna-navy">{t('business_shipment_detail.not_found_title')}</h1>
      <Button asChild variant="navy" className="mt-4"><Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_shipment_detail.back_to_list')}</Link></Button>
    </div>
  );

  const changeStatus = async (s: ShipmentStatus) => {
    try {
      await updateShipmentStatus(shipment.id, s);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    }
  };

  return (
    <>
      <SEO title={shipment.reference} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="h-4 w-4" />{t('business_shipment_detail.back_to_list')}</Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy font-mono">{shipment.reference}</h1>
        <ShipmentStatusBadge status={shipment.status} />
        {canWrite && (
          <div className="ml-auto flex gap-2 items-center">
            <Select value={shipment.status} onValueChange={(v) => changeStatus(v as ShipmentStatus)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIPMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{t(`shipment_status.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm">
              <Link to="edit"><Pencil className="h-3.5 w-3.5" />{t('business_shipment_detail.edit')}</Link>
            </Button>
          </div>
        )}
      </div>

      <Pipeline status={shipment.status} />

      <PublicTrackingCard shipment={shipment} canWrite={canWrite} onChanged={reload} />

      <div className="mt-6 border-b border-slate-200 flex flex-wrap gap-1">
        {(['overview','packages','charges','documents','activity'] as Tab[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === k ? 'border-luna-navy text-luna-navy' : 'border-transparent text-slate-500 hover:text-luna-navy',
            )}>
            {t(`business_shipment_detail.tab_${k}`)}
            {k === 'packages' && packages.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 text-slate-600 px-1.5 text-[10px]">{packages.length}</span>
            )}
            {k === 'charges' && charges.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 text-slate-600 px-1.5 text-[10px]">{charges.length}</span>
            )}
            {k === 'documents' && documents.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 text-slate-600 px-1.5 text-[10px]">{documents.length}</span>
            )}
            {k === 'activity' && events.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 text-slate-600 px-1.5 text-[10px]">{events.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview'  && <OverviewTab s={shipment} customer={customer} charges={charges} />}
        {tab === 'packages'  && <PackagesTab shipmentId={shipment.id} packages={packages} defaultCurrency={shipment.currency} canWrite={canWrite} onChanged={reload} />}
        {tab === 'charges'   && <ChargesTab shipmentId={shipment.id} charges={charges} defaultCurrency={shipment.currency} canWrite={canWrite} onChanged={reload} />}
        {tab === 'documents' && <DocumentsTab shipmentId={shipment.id} businessId={shipment.business_id} documents={documents} canWrite={canWrite} onChanged={reload} />}
        {tab === 'activity'  && <ActivityTab shipmentId={shipment.id} businessId={shipment.business_id} events={events} canWrite={canWrite} onChanged={reload} />}
      </div>
    </>
  );
}

function Pipeline({ status }: { status: ShipmentStatus }) {
  const { t } = useTranslation();
  const isCancelled = status === 'cancelled';
  const currentIdx = SHIPMENT_PIPELINE.indexOf(status);
  return (
    <div className={cn(
      'mt-4 rounded-2xl border-2 bg-white p-4 overflow-x-auto',
      isCancelled ? 'border-red-200' : 'border-luna-blue/20',
    )}>
      {isCancelled ? (
        <div className="text-sm text-red-800 font-semibold">
          {t('shipment_status.cancelled')}
        </div>
      ) : (
        <ol className="flex items-center gap-2 min-w-max">
          {SHIPMENT_PIPELINE.map((s, i) => {
            const done = i <= currentIdx;
            const active = i === currentIdx;
            return (
              <li key={s} className="flex items-center">
                <div className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1 text-xs',
                  done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500',
                  active && 'ring-2 ring-luna-blue/40',
                )}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {t(`shipment_status.${s}`)}
                </div>
                {i < SHIPMENT_PIPELINE.length - 1 && <ArrowRight className="h-3 w-3 mx-1 text-slate-300 shrink-0" />}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function OverviewTab({ s, customer, charges }: { s: Shipment; customer: BusinessCustomer | null; charges: ShipmentCharge[] }) {
  const { t } = useTranslation();
  const billed = sumBillable(s.currency, charges);
  const fmt = (n: number | null | undefined, unit = '') =>
    n === null || n === undefined ? '—' : `${Number(n).toLocaleString()} ${unit}`.trim();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-luna-navy">{t('business_shipment_detail.section_shipment')}</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Dt>{t('business_shipment_form.field_client')}</Dt>
          <Dd>{customer ? <Link to={`../../clients/${customer.id}`} className="text-luna-blue hover:underline">{customer.display_name}</Link> : '—'}</Dd>

          <Dt>{t('business_shipment_form.field_direction')}</Dt>
          <Dd>{t(`shipment_direction.${s.direction}`)}</Dd>

          <Dt>{t('business_shipment_form.field_mode')}</Dt>
          <Dd>{t(`shipment_mode.${s.mode}`)}</Dd>

          <Dt>{t('business_shipment_form.field_incoterm')}</Dt>
          <Dd className="font-mono uppercase">{s.incoterm ?? '—'}</Dd>

          <Dt>{t('business_shipment_form.field_carrier_name')}</Dt>
          <Dd>{s.carrier_name ?? '—'}</Dd>

          <Dt>{t('business_shipment_form.field_tracking_number')}</Dt>
          <Dd className="font-mono">{s.tracking_number ?? '—'}</Dd>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-luna-navy">{t('business_shipment_detail.section_totals')}</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Dt>{t('business_shipment_form.field_weight_kg')}</Dt>
          <Dd>{fmt(s.total_weight_kg, 'kg')}</Dd>
          <Dt>{t('business_shipment_form.field_volume_m3')}</Dt>
          <Dd>{fmt(s.total_volume_m3, 'm³')}</Dd>
          <Dt>{t('business_shipment_form.field_goods_value')}</Dt>
          <Dd>{fmt(s.goods_value, s.currency)}</Dd>
          <Dt>{t('business_shipment_detail.total_billed')}</Dt>
          <Dd className="font-semibold">{billed.toLocaleString()} {s.currency}</Dd>
        </dl>
      </section>

      <AddressCard title={t('business_shipment_form.section_origin')} s={s} prefix="origin" />
      <AddressCard title={<span className="inline-flex items-center gap-2"><ArrowRight className="h-4 w-4" />{t('business_shipment_form.section_destination')}</span>} s={s} prefix="destination" />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
        <h2 className="text-sm font-semibold text-luna-navy">{t('business_shipment_form.section_notes')}</h2>
        <p className={cn('mt-3 text-sm whitespace-pre-wrap', s.notes ? 'text-luna-navy' : 'text-slate-500 italic')}>
          {s.notes || t('business_shipment_detail.no_notes')}
        </p>
      </section>
    </div>
  );
}

function AddressCard({ title, s, prefix }: { title: React.ReactNode; s: Shipment; prefix: 'origin' | 'destination' }) {
  const g = (suffix: string) => (s as unknown as Record<string, string | null>)[`${prefix}_${suffix}`];
  const parts = [
    g('name'),
    g('address_line1'),
    g('address_line2'),
    [g('postal_code'), g('city')].filter(Boolean).join(' ') || null,
    g('country'),
  ].filter(Boolean);
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-luna-navy flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        {title}
      </h2>
      {parts.length ? (
        <p className="mt-3 text-sm text-luna-navy whitespace-pre-line">{parts.join('\n')}</p>
      ) : (
        <p className="mt-3 text-sm text-slate-500 italic">{t('business_shipment_detail.no_address')}</p>
      )}
    </section>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="col-span-1 text-slate-500 text-xs uppercase tracking-wide self-center">{children}</dt>;
}
function Dd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={cn('col-span-2 text-luna-navy', className)}>{children}</dd>;
}

// ─── Packages tab ─────────────────────────────────────────────────────
function PackagesTab({
  shipmentId, packages, defaultCurrency, canWrite, onChanged,
}: {
  shipmentId: string;
  packages: ShipmentPackage[];
  defaultCurrency: Currency;
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ShipmentPackage | 'new' | null>(null);

  const totalWeight = packages.reduce((sum, p) => sum + Number(p.weight_kg ?? 0) * p.quantity, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-luna-navy flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('business_shipment_detail.packages_title')}
          </h2>
          {packages.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {t('business_shipment_detail.packages_total', {
                count: packages.reduce((s, p) => s + p.quantity, 0),
                weight: totalWeight.toLocaleString(),
              })}
            </p>
          )}
        </div>
        {canWrite && !editing && (
          <Button size="sm" variant="navy" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('business_shipment_detail.package_add')}
          </Button>
        )}
      </div>

      {editing && (
        <PackageForm shipmentId={shipmentId} pkg={editing === 'new' ? null : editing}
          nextIndex={packages.length + 1} defaultCurrency={defaultCurrency}
          onDone={async () => { await onChanged(); setEditing(null); }} onCancel={() => setEditing(null)} />
      )}

      {!editing && packages.length === 0 && (
        <EmptyBlock text={t('business_shipment_detail.packages_empty')} />
      )}

      {!editing && packages.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">#</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_shipment_detail.pkg_desc')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_shipment_detail.pkg_qty')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_shipment_detail.pkg_weight')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_shipment_detail.pkg_dims')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_shipment_detail.pkg_value')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_shipment_detail.pkg_hs')}</th>
                {canWrite && <th className="text-right px-4 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {packages.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-slate-500">{p.package_index}</td>
                  <td className="px-4 py-2">{p.description ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{p.quantity}</td>
                  <td className="px-4 py-2 text-right">{p.weight_kg ? `${p.weight_kg} kg` : '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {p.length_cm || p.width_cm || p.height_cm
                      ? `${p.length_cm ?? '?'}×${p.width_cm ?? '?'}×${p.height_cm ?? '?'} cm`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.contents_value ? `${Number(p.contents_value).toLocaleString()} ${p.contents_currency ?? defaultCurrency}` : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{p.hs_code ?? '—'}</td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={async () => {
                        if (!confirm(t('business_shipment_detail.package_delete_confirm'))) return;
                        try { await deletePackage(p.id); await onChanged(); }
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
    </div>
  );
}

function PackageForm({
  shipmentId, pkg, nextIndex, defaultCurrency, onDone, onCancel,
}: {
  shipmentId: string; pkg: ShipmentPackage | null; nextIndex: number; defaultCurrency: Currency;
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    package_index: pkg?.package_index ?? nextIndex,
    description: pkg?.description ?? '',
    quantity: pkg?.quantity ?? 1,
    weight_kg: pkg?.weight_kg ?? null as number | null,
    length_cm: pkg?.length_cm ?? null as number | null,
    width_cm:  pkg?.width_cm  ?? null as number | null,
    height_cm: pkg?.height_cm ?? null as number | null,
    contents_value: pkg?.contents_value ?? null as number | null,
    contents_currency: (pkg?.contents_currency ?? defaultCurrency) as Currency,
    hs_code: pkg?.hs_code ?? '',
    marks_and_numbers: pkg?.marks_and_numbers ?? '',
    notes: pkg?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const num = (v: string) => v === '' ? null : Number(v);
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try {
        await upsertPackage(shipmentId, {
          id: pkg?.id,
          package_index: f.package_index, quantity: f.quantity,
          description: f.description || null,
          weight_kg: f.weight_kg, length_cm: f.length_cm, width_cm: f.width_cm, height_cm: f.height_cm,
          contents_value: f.contents_value, contents_currency: f.contents_currency,
          hs_code: f.hs_code || null, marks_and_numbers: f.marks_and_numbers || null,
          notes: f.notes || null,
        });
        await onDone();
      } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
      finally { setBusy(false); }
    }} className="mb-6 rounded-2xl border-2 border-luna-blue/30 bg-white p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-[80px_1fr_100px]">
        <Field label="#"><Input type="number" min={1} value={f.package_index} onChange={(e) => setF((p) => ({ ...p, package_index: Number(e.target.value) }))} /></Field>
        <Field label={t('business_shipment_detail.pkg_desc')}><Input value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></Field>
        <Field label={t('business_shipment_detail.pkg_qty')}><Input type="number" min={1} value={f.quantity} onChange={(e) => setF((p) => ({ ...p, quantity: Number(e.target.value) }))} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t('business_shipment_detail.pkg_weight')}><Input type="number" step="0.001" value={f.weight_kg ?? ''} onChange={(e) => setF((p) => ({ ...p, weight_kg: num(e.target.value) }))} /></Field>
        <Field label="L cm"><Input type="number" step="0.1" value={f.length_cm ?? ''} onChange={(e) => setF((p) => ({ ...p, length_cm: num(e.target.value) }))} /></Field>
        <Field label="l cm"><Input type="number" step="0.1" value={f.width_cm ?? ''} onChange={(e) => setF((p) => ({ ...p, width_cm: num(e.target.value) }))} /></Field>
        <Field label="H cm"><Input type="number" step="0.1" value={f.height_cm ?? ''} onChange={(e) => setF((p) => ({ ...p, height_cm: num(e.target.value) }))} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('business_shipment_detail.pkg_value')}><Input type="number" step="0.01" value={f.contents_value ?? ''} onChange={(e) => setF((p) => ({ ...p, contents_value: num(e.target.value) }))} /></Field>
        <Field label={t('business_shipment_form.field_currency')}>
          <Select value={f.contents_currency} onValueChange={(v) => setF((p) => ({ ...p, contents_currency: v as Currency }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t('business_shipment_detail.pkg_hs')}><Input value={f.hs_code} onChange={(e) => setF((p) => ({ ...p, hs_code: e.target.value }))} className="font-mono" /></Field>
      </div>
      <Field label={t('business_shipment_detail.pkg_marks')}><Input value={f.marks_and_numbers} onChange={(e) => setF((p) => ({ ...p, marks_and_numbers: e.target.value }))} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t('business_client_detail.cancel')}</Button>
        <Button type="submit" variant="navy" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('business_shipment_detail.package_save')}
        </Button>
      </div>
    </form>
  );
}

// ─── Charges tab ──────────────────────────────────────────────────────
function ChargesTab({
  shipmentId, charges, defaultCurrency, canWrite, onChanged,
}: {
  shipmentId: string; charges: ShipmentCharge[]; defaultCurrency: Currency;
  canWrite: boolean; onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ShipmentCharge | 'new' | null>(null);
  const total = sumBillable(defaultCurrency, charges);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-luna-navy flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {t('business_shipment_detail.charges_title')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t('business_shipment_detail.total_billed')}: <span className="font-semibold text-luna-navy">{total.toLocaleString()} {defaultCurrency}</span>
          </p>
        </div>
        {canWrite && !editing && (
          <Button size="sm" variant="navy" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            {t('business_shipment_detail.charge_add')}
          </Button>
        )}
      </div>

      {editing && (
        <ChargeForm shipmentId={shipmentId} charge={editing === 'new' ? null : editing}
          defaultCurrency={defaultCurrency}
          onDone={async () => { await onChanged(); setEditing(null); }} onCancel={() => setEditing(null)} />
      )}

      {!editing && charges.length === 0 && (
        <EmptyBlock text={t('business_shipment_detail.charges_empty')} />
      )}

      {!editing && charges.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">{t('business_shipment_detail.charge_kind')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_shipment_detail.charge_label')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_shipment_detail.charge_amount')}</th>
                <th className="text-center px-4 py-2 font-semibold">{t('business_shipment_detail.charge_billable')}</th>
                {canWrite && <th className="text-right px-4 py-2 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {charges.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-slate-700">{t(`charge_kind.${c.kind}`)}</td>
                  <td className="px-4 py-2">{c.label}</td>
                  <td className="px-4 py-2 text-right font-semibold text-luna-navy">
                    {Number(c.amount).toLocaleString()} {c.currency}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {c.is_billable
                      ? <span className="text-emerald-700 text-xs">✓</span>
                      : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={async () => {
                        if (!confirm(t('business_shipment_detail.charge_delete_confirm'))) return;
                        try { await deleteCharge(c.id); await onChanged(); }
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
    </div>
  );
}

function ChargeForm({
  shipmentId, charge, defaultCurrency, onDone, onCancel,
}: {
  shipmentId: string; charge: ShipmentCharge | null; defaultCurrency: Currency;
  onDone: () => Promise<void>; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    kind: (charge?.kind ?? 'transport') as ChargeKind,
    label: charge?.label ?? '',
    amount: charge?.amount ?? 0,
    currency: (charge?.currency ?? defaultCurrency) as Currency,
    is_billable: charge?.is_billable ?? true,
    notes: charge?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const KINDS: ChargeKind[] = ['transport','handling','insurance','customs','storage','fuel','other'];
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!f.label.trim()) return;
      setBusy(true);
      try {
        await upsertCharge(shipmentId, {
          id: charge?.id,
          kind: f.kind, label: f.label.trim(),
          amount: f.amount, currency: f.currency,
          is_billable: f.is_billable, notes: f.notes || null,
        });
        await onDone();
      } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
      finally { setBusy(false); }
    }} className="mb-6 rounded-2xl border-2 border-luna-blue/30 bg-white p-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t('business_shipment_detail.charge_kind')}>
          <Select value={f.kind} onValueChange={(v) => setF((p) => ({ ...p, kind: v as ChargeKind }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k} value={k}>{t(`charge_kind.${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('business_shipment_detail.charge_label')}>
            <Input value={f.label} onChange={(e) => setF((p) => ({ ...p, label: e.target.value }))} required />
          </Field>
        </div>
        <Field label={t('business_shipment_detail.charge_amount')}>
          <Input type="number" step="0.01" value={f.amount} onChange={(e) => setF((p) => ({ ...p, amount: Number(e.target.value) }))} required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 items-end">
        <Field label={t('business_shipment_form.field_currency')}>
          <Select value={f.currency} onValueChange={(v) => setF((p) => ({ ...p, currency: v as Currency }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <label className="inline-flex items-center gap-2 text-sm mt-6">
          <input type="checkbox" checked={f.is_billable} onChange={(e) => setF((p) => ({ ...p, is_billable: e.target.checked }))}
            className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
          {t('business_shipment_detail.charge_billable')}
        </label>
      </div>
      <Field label={t('business_shipment_form.section_notes')}>
        <Textarea rows={2} value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t('business_client_detail.cancel')}</Button>
        <Button type="submit" variant="navy" disabled={busy || !f.label.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('business_shipment_detail.charge_save')}
        </Button>
      </div>
    </form>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────
function DocumentsTab({
  shipmentId, businessId, documents, canWrite, onChanged,
}: {
  shipmentId: string; businessId: string;
  documents: ShipmentDocument[]; canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        await uploadDocument({ shipmentId, businessId, file });
        ok++;
      } catch (err) {
        failed++;
        toast.error(errorMessage(err, t('common.error_generic')));
      }
    }
    if (ok > 0) toast.success(t('business_shipment_detail.docs_uploaded', { count: ok }));
    await onChanged();
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-luna-navy flex items-center gap-2">
            <Files className="h-5 w-5" />
            {t('business_shipment_detail.documents_title')}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t('business_shipment_detail.documents_hint')}</p>
        </div>
        {canWrite && (
          <Button size="sm" variant="navy" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t('business_shipment_detail.docs_upload')}
          </Button>
        )}
        <input
          ref={inputRef} type="file" multiple hidden
          onChange={(e) => void handleFiles(e.target.files)}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        />
      </div>

      {canWrite && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'mb-4 rounded-2xl border-2 border-dashed p-6 text-center text-sm transition-colors',
            dragOver ? 'border-luna-blue bg-luna-blue/5 text-luna-navy' : 'border-slate-300 bg-white text-slate-500',
          )}
        >
          <Upload className="h-5 w-5 mx-auto mb-2 opacity-60" aria-hidden="true" />
          {t('business_shipment_detail.docs_drop_zone')}
        </div>
      )}

      {documents.length === 0 && !canWrite && (
        <EmptyBlock text={t('business_shipment_detail.docs_empty')} />
      )}

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((d) => (
            <DocumentRow key={d.id} doc={d} canWrite={canWrite} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({
  doc, canWrite, onChanged,
}: {
  doc: ShipmentDocument; canWrite: boolean; onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<DocumentKind>(doc.kind);
  const [label, setLabel] = useState(doc.label ?? '');
  const [busy, setBusy] = useState(false);

  const isImage = doc.mime_type?.startsWith('image/');
  const Icon = isImage ? ImageIcon : FileText;

  const open = async () => {
    try {
      const url = await signedUrl(doc.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateDocument(doc.id, { kind, label: label.trim() || null });
      await onChanged();
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(t('business_shipment_detail.doc_delete_confirm'))) return;
    setBusy(true);
    try {
      await deleteDocument(doc);
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-slate-100 p-2 text-slate-600">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <button type="button" onClick={open}
                className="text-left font-semibold text-luna-navy hover:text-luna-blue truncate block max-w-full">
                {doc.filename}
              </button>
              <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center rounded-full bg-luna-blue/10 text-luna-blue px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {t(`document_kind.${doc.kind}`)}
                </span>
                {doc.label && <span className="italic">{doc.label}</span>}
                <span>{formatBytes(doc.byte_size)}</span>
                <span>{new Date(doc.uploaded_at).toLocaleDateString(i18n.language)}</span>
              </p>
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] items-end">
              <div>
                <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_shipment_detail.doc_kind')}</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{t(`document_kind.${k}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_shipment_detail.doc_label')}</Label>
                <Input className="mt-1" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing ? (
            <>
              <Button size="sm" variant="outline" onClick={open} disabled={busy}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              {canWrite && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove} disabled={busy}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setKind(doc.kind); setLabel(doc.label ?? ''); }} disabled={busy}>
                {t('business_client_detail.cancel')}
              </Button>
              <Button size="sm" variant="navy" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t('business_shipment_detail.doc_save')}
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────
function ActivityTab({
  shipmentId, businessId, events, canWrite, onChanged,
}: {
  shipmentId: string; businessId: string;
  events: ShipmentEvent[]; canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      await addNote(shipmentId, businessId, note);
      setNote('');
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  const ordered = [...events].reverse();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-luna-navy flex items-center gap-2">
          <History className="h-5 w-5" />
          {t('business_shipment_detail.activity_title')}
        </h2>
      </div>

      {canWrite && (
        <form onSubmit={submit} className="mb-6 rounded-2xl border-2 border-luna-blue/20 bg-white p-4">
          <Label className="text-luna-navy text-xs uppercase tracking-wide">
            {t('business_shipment_detail.add_note_label')}
          </Label>
          <Textarea
            className="mt-2"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('business_shipment_detail.add_note_placeholder')}
            maxLength={2000}
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="navy" disabled={busy || !note.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              {t('business_shipment_detail.add_note_submit')}
            </Button>
          </div>
        </form>
      )}

      {ordered.length === 0 ? (
        <EmptyBlock text={t('business_shipment_detail.activity_empty')} />
      ) : (
        <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4 pl-6">
          {ordered.map((e) => (
            <EventItem key={e.id} event={e} locale={i18n.language} />
          ))}
        </ol>
      )}
    </div>
  );
}

function EventItem({ event, locale }: { event: ShipmentEvent; locale: string }) {
  const { t } = useTranslation();
  const Icon = eventIcon(event.kind);
  const iconClass = eventIconClass(event.kind);
  const when = new Date(event.created_at).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const actor = event.actor_name || t('business_shipment_detail.activity_actor_unknown');
  return (
    <li className="relative">
      <span className={cn(
        'absolute -left-[38px] top-0.5 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white',
        iconClass,
      )}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-luna-navy">
          <EventLabel event={event} />
        </p>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-medium">{actor}</span>
          <span className="mx-1.5">·</span>
          <time dateTime={event.created_at}>{when}</time>
        </p>
      </div>
    </li>
  );
}

function EventLabel({ event }: { event: ShipmentEvent }) {
  const { t } = useTranslation();
  if (event.kind === 'created') {
    return <>{t('business_shipment_detail.evt_created')}</>;
  }
  if (event.kind === 'status_change') {
    const from = event.from_status ? t(`shipment_status.${event.from_status}`) : '—';
    const to = event.to_status ? t(`shipment_status.${event.to_status}`) : '—';
    return (
      <>
        {t('business_shipment_detail.evt_status_change')}
        {' '}
        <span className="text-slate-500">{from}</span>
        {' → '}
        <span className="font-semibold">{to}</span>
      </>
    );
  }
  if (event.kind === 'document_added') {
    return <>{t('business_shipment_detail.evt_document_added')} <span className="font-mono text-xs">{event.note}</span></>;
  }
  if (event.kind === 'document_removed') {
    return <>{t('business_shipment_detail.evt_document_removed')} <span className="font-mono text-xs">{event.note}</span></>;
  }
  return <span className="whitespace-pre-wrap">{event.note}</span>;
}

function eventIcon(kind: ShipmentEvent['kind']) {
  switch (kind) {
    case 'created':          return Sparkles;
    case 'status_change':    return ArrowRight;
    case 'document_added':   return FilePlus;
    case 'document_removed': return FileMinus;
    default:                 return MessageSquarePlus;
  }
}
function eventIconClass(kind: ShipmentEvent['kind']) {
  switch (kind) {
    case 'created':          return 'bg-emerald-100 text-emerald-700';
    case 'status_change':    return 'bg-luna-blue/15 text-luna-blue';
    case 'document_added':   return 'bg-amber-100 text-amber-700';
    case 'document_removed': return 'bg-red-100 text-red-700';
    default:                 return 'bg-slate-100 text-slate-600';
  }
}

// ─── Public tracking link (opt-in) ────────────────────────────────────
function PublicTrackingCard({
  shipment, canWrite, onChanged,
}: {
  shipment: Shipment; canWrite: boolean; onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language.startsWith('en') ? 'en' : 'fr') as Lang;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const path = urlFor('publicTracking', lang).replace(':token', shipment.tracking_token);
  const link = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await setTrackingEnabled(shipment.id, enabled);
      await onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!confirm(t('business_shipment_detail.tracking_rotate_confirm'))) return;
    setBusy(true);
    try {
      await rotateTrackingToken(shipment.id);
      await onChanged();
      toast.success(t('business_shipment_detail.tracking_rotated'));
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('business_shipment_detail.tracking_copy_failed'));
    }
  };

  if (!shipment.tracking_enabled) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
        <Share2 className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-luna-navy">{t('business_shipment_detail.tracking_off_title')}</p>
          <p className="mt-1 text-xs text-slate-600">{t('business_shipment_detail.tracking_off_body')}</p>
        </div>
        {canWrite && (
          <Button size="sm" variant="navy" onClick={() => toggle(true)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {t('business_shipment_detail.tracking_enable')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <Share2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-900">{t('business_shipment_detail.tracking_on_title')}</p>
          <p className="mt-1 text-xs text-emerald-800">{t('business_shipment_detail.tracking_on_body')}</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2">
            <span className="text-xs text-slate-700 font-mono truncate flex-1" title={link}>{link}</span>
            <Button size="sm" variant="ghost" onClick={copy} className="h-7 px-2">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-col gap-1 shrink-0">
            <Button size="sm" variant="outline" onClick={rotate} disabled={busy} title={t('business_shipment_detail.tracking_rotate')}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggle(false)} disabled={busy}>
              {t('business_shipment_detail.tracking_disable')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
      {text}
    </div>
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

