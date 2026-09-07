import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, ArrowRight, CheckCircle2, Circle, MapPin, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { supabase } from '@/lib/supabase';
import { SHIPMENT_PIPELINE, type ShipmentStatus } from '@/lib/shipment-status';
import { ShipmentStatusBadge } from '@/components/ShipmentStatusBadge';
import { cn } from '@/lib/utils';

/**
 * Public shipment tracking page — no auth required.
 * The URL carries a per-shipment token; the RPC only returns data when
 * the shipper has enabled sharing. Payload is intentionally narrow:
 * no full addresses, no notes, no charges, no goods value.
 */

type PublicShipmentEvent = {
  kind: 'created' | 'status_change';
  from_status: ShipmentStatus | null;
  to_status: ShipmentStatus | null;
  created_at: string;
};

type PublicShipment = {
  reference: string;
  status: ShipmentStatus;
  direction: string;
  mode: string;
  carrier_name: string | null;
  tracking_number: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_city: string | null;
  destination_country: string | null;
  estimated_pickup: string | null;
  estimated_delivery: string | null;
  actual_pickup: string | null;
  actual_delivery: string | null;
  package_count: number;
  total_weight_kg: number | null;
  events: PublicShipmentEvent[];
};

export default function PublicTracking() {
  const { t, i18n } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [shipment, setShipment] = useState<PublicShipment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) { setLoading(false); return; }
      const { data, error } = await supabase.rpc('get_public_shipment', { p_token: token });
      if (error) console.warn('[public-tracking] rpc failed:', error.message);
      setShipment((data as PublicShipment | null) ?? null);
      setLoading(false);
    })();
  }, [token]);

  const locale = i18n.language;
  const fmtDate = (v: string | null) => v ? new Date(v).toLocaleDateString(locale) : '—';
  const fmtDateTime = (v: string) => new Date(v).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="min-h-[70vh] bg-slate-50">
      <SEO title={t('public_tracking.meta_title')} noindex />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-luna-navy inline-flex items-center gap-2">
            <Package className="h-6 w-6" />
            {t('public_tracking.heading')}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{t('public_tracking.intro')}</p>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        )}

        {!loading && !shipment && (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-800">{t('public_tracking.not_found_title')}</p>
            <p className="mt-1 text-sm text-red-700">{t('public_tracking.not_found_body')}</p>
          </div>
        )}

        {!loading && shipment && (
          <div className="space-y-4">
            <div className="rounded-2xl border-2 border-luna-blue/20 bg-white p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{t('public_tracking.reference')}</p>
                  <p className="font-mono font-bold text-luna-navy text-lg">{shipment.reference}</p>
                </div>
                <ShipmentStatusBadge status={shipment.status} />
              </div>
              <PublicPipeline status={shipment.status} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RouteCard
                label={t('public_tracking.origin')}
                city={shipment.origin_city}
                country={shipment.origin_country}
              />
              <RouteCard
                label={t('public_tracking.destination')}
                city={shipment.destination_city}
                country={shipment.destination_country}
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
                {t('public_tracking.section_dates')}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-slate-500">{t('public_tracking.estimated_pickup')}</dt>
                <dd className="text-luna-navy">{fmtDate(shipment.estimated_pickup)}</dd>
                <dt className="text-slate-500">{t('public_tracking.actual_pickup')}</dt>
                <dd className="text-luna-navy">{fmtDate(shipment.actual_pickup)}</dd>
                <dt className="text-slate-500">{t('public_tracking.estimated_delivery')}</dt>
                <dd className="text-luna-navy">{fmtDate(shipment.estimated_delivery)}</dd>
                <dt className="text-slate-500">{t('public_tracking.actual_delivery')}</dt>
                <dd className="text-luna-navy">{fmtDate(shipment.actual_delivery)}</dd>
              </dl>
            </div>

            {(shipment.carrier_name || shipment.tracking_number) && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
                  {t('public_tracking.section_carrier')}
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  {shipment.carrier_name && (
                    <>
                      <dt className="text-slate-500">{t('public_tracking.carrier')}</dt>
                      <dd className="text-luna-navy">{shipment.carrier_name}</dd>
                    </>
                  )}
                  {shipment.tracking_number && (
                    <>
                      <dt className="text-slate-500">{t('public_tracking.tracking_number')}</dt>
                      <dd className="text-luna-navy font-mono">{shipment.tracking_number}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}

            {shipment.events.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide">
                  {t('public_tracking.section_history')}
                </h2>
                <ol className="mt-3 space-y-2 text-sm">
                  {[...shipment.events].reverse().map((e, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-luna-blue shrink-0" aria-hidden="true" />
                      <div>
                        <p className="text-luna-navy">
                          {e.kind === 'created' ? (
                            t('public_tracking.evt_created')
                          ) : (
                            <>
                              {t('public_tracking.evt_status_change')}{' '}
                              <span className="font-semibold">{t(`shipment_status.${e.to_status ?? 'draft'}`)}</span>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{fmtDateTime(e.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="text-center text-xs text-slate-500 pt-2">
              {t('public_tracking.footer_note')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PublicPipeline({ status }: { status: ShipmentStatus }) {
  const { t } = useTranslation();
  if (status === 'cancelled') {
    return (
      <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 text-center font-semibold">
        {t('shipment_status.cancelled')}
      </div>
    );
  }
  const currentIdx = SHIPMENT_PIPELINE.indexOf(status);
  return (
    <div className="mt-4 overflow-x-auto">
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
    </div>
  );
}

function RouteCard({ label, city, country }: { label: string; city: string | null; country: string | null }) {
  const parts = [city, country].filter(Boolean);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xs font-semibold text-luna-navy uppercase tracking-wide flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5" />
        {label}
      </h2>
      <p className="mt-2 text-luna-navy">
        {parts.length ? parts.join(', ') : '—'}
      </p>
    </div>
  );
}
