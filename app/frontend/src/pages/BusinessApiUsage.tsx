import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { useBusiness } from '@/contexts/BusinessContext';
import { fetchUsage, type UsageReport, type UsageRange } from '@/lib/api-usage';
import { urlFor } from '@/lib/url/routes';
import { cn } from '@/lib/utils';

/**
 * API usage dashboard for a business. Reads get_api_usage() aggregate
 * RPC — no client-side crunching, so the page stays fast even when the
 * log grows into millions of rows.
 */
export default function BusinessApiUsage() {
  const { t, i18n } = useTranslation();
  const { current } = useBusiness();
  const [range, setRange] = useState<UsageRange>('7d');
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    void fetchUsage(current.id, range).then((r) => { setReport(r); setLoading(false); });
  }, [current?.id, range]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_api_usage.meta_title')} noindex />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to={urlFor('businessApiKeys', lang)}>
            <ArrowLeft className="h-4 w-4" />{t('business_api_usage.back')}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
          <Activity className="h-6 w-6" />
          {t('business_api_usage.title')}
        </h1>
        <div className="ml-auto flex gap-1">
          {(['24h', '7d', '30d'] as UsageRange[]).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border',
                r === range
                  ? 'border-luna-navy bg-luna-navy text-white'
                  : 'border-slate-200 text-slate-700 hover:border-luna-blue',
              )}>
              {t(`business_api_usage.range_${r}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-slate-600 mb-6 max-w-2xl">{t('business_api_usage.intro')}</p>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      )}

      {!loading && report && report.totals.calls === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('business_api_usage.empty')}
        </div>
      )}

      {!loading && report && report.totals.calls > 0 && (
        <div className="space-y-6">
          <Totals totals={report.totals} />

          <section>
            <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-2">
              {t('business_api_usage.timeline_title')}
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <TimelineChart data={report.timeline} bucket={report.range.bucket} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <ByEndpoint data={report.by_endpoint} />
            <ByKey data={report.by_key} />
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Totals row ────────────────────────────────────────────────── */

function Totals({ totals }: { totals: UsageReport['totals'] }) {
  const { t } = useTranslation();
  const successRate = totals.calls === 0 ? 0 : Math.round((totals.success / totals.calls) * 100);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Activity}
        label={t('business_api_usage.stat_calls')}
        value={totals.calls.toLocaleString()}
        tone="navy"
      />
      <StatCard
        icon={CheckCircle2}
        label={t('business_api_usage.stat_success')}
        value={`${successRate}%`}
        sub={`${totals.success.toLocaleString()} / ${totals.calls.toLocaleString()}`}
        tone="emerald"
      />
      <StatCard
        icon={AlertTriangle}
        label={t('business_api_usage.stat_errors')}
        value={(totals.client_error + totals.server_error).toLocaleString()}
        sub={t('business_api_usage.stat_errors_sub', {
          client: totals.client_error, server: totals.server_error,
        })}
        tone={totals.server_error > 0 ? 'red' : 'amber'}
      />
      <StatCard
        icon={Clock}
        label={t('business_api_usage.stat_response')}
        value={`${totals.avg_response_ms} ms`}
        sub={t('business_api_usage.stat_p95', { ms: totals.p95_response_ms })}
        tone="blue"
      />
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
  tone: 'navy' | 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const iconClass = {
    navy:    'bg-luna-navy/10 text-luna-navy',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    red:     'bg-red-100 text-red-700',
    blue:    'bg-luna-blue/10 text-luna-blue',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex gap-3 items-start">
      <div className={cn('shrink-0 rounded-xl p-2', iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-luna-navy">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Timeline (SVG bar chart) ─────────────────────────────────── */

function TimelineChart({ data, bucket }: { data: UsageReport['timeline']; bucket: 'hour' | 'day' }) {
  const { t, i18n } = useTranslation();
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.calls)), [data]);
  const width = 720;
  const height = 200;
  const padL = 40;
  const padB = 30;
  const padR = 10;
  const padT = 10;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const barCount = Math.max(1, data.length);
  const barW = Math.max(4, innerW / barCount - 3);

  const fmtBucket = (iso: string) => {
    const d = new Date(iso);
    if (bucket === 'hour') {
      return d.toLocaleString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' });
  };

  if (data.length === 0) {
    return <p className="text-center text-sm text-slate-500 py-8">{t('business_api_usage.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[520px]" role="img"
        aria-label={t('business_api_usage.timeline_title')}>
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} y1={padT + innerH * (1 - f)} x2={padL + innerW} y2={padT + innerH * (1 - f)}
              stroke="#E2E8F0" strokeDasharray="2 3" />
            <text x={padL - 4} y={padT + innerH * (1 - f) + 4} textAnchor="end" fontSize="10" fill="#64748B">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {/* Bars */}
        {data.map((d, i) => {
          const x = padL + i * (innerW / barCount) + 2;
          const h = (d.calls / max) * innerH;
          const y = padT + innerH - h;
          const errorH = (d.errors / max) * innerH;
          const successH = h - errorH;
          return (
            <g key={i}>
              {/* success portion */}
              <rect x={x} y={y + errorH} width={barW} height={Math.max(0, successH)} fill="#0EA5E9" rx="2" />
              {/* error portion (top) */}
              {d.errors > 0 && (
                <rect x={x} y={y} width={barW} height={errorH} fill="#DC2626" rx="2" />
              )}
              {/* x-axis label — every ~5 bars to keep it readable */}
              {(i % Math.max(1, Math.floor(data.length / 8)) === 0 || i === data.length - 1) && (
                <text x={x + barW / 2} y={height - padB + 14} textAnchor="middle" fontSize="10" fill="#64748B">
                  {fmtBucket(d.bucket)}
                </text>
              )}
              <title>{`${fmtBucket(d.bucket)} — ${d.calls} calls${d.errors > 0 ? `, ${d.errors} errors` : ''}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-end gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-luna-blue" />
          {t('business_api_usage.legend_success')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-600" />
          {t('business_api_usage.legend_errors')}
        </span>
      </div>
    </div>
  );
}

/* ─── Breakdown tables ─────────────────────────────────────────── */

function ByEndpoint({ data }: { data: UsageReport['by_endpoint'] }) {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-2">
        {t('business_api_usage.by_endpoint_title')}
      </h2>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">{t('business_api_usage.col_endpoint')}</th>
              <th className="text-right px-4 py-2 font-semibold">{t('business_api_usage.col_calls')}</th>
              <th className="text-right px-4 py-2 font-semibold">{t('business_api_usage.col_avg_ms')}</th>
              <th className="text-right px-4 py-2 font-semibold">{t('business_api_usage.col_errors')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">{t('business_api_usage.empty')}</td></tr>
            )}
            {data.map((r) => (
              <tr key={r.path}>
                <td className="px-4 py-2 font-mono text-xs text-luna-navy">{r.path}</td>
                <td className="px-4 py-2 text-right">{r.calls.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.avg_ms} ms</td>
                <td className={cn('px-4 py-2 text-right', r.errors > 0 ? 'text-red-700 font-semibold' : 'text-slate-500')}>
                  {r.errors}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ByKey({ data }: { data: UsageReport['by_key'] }) {
  const { t, i18n } = useTranslation();
  return (
    <section>
      <h2 className="text-sm font-semibold text-luna-navy uppercase tracking-wide mb-2">
        {t('business_api_usage.by_key_title')}
      </h2>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">{t('business_api_usage.col_key')}</th>
              <th className="text-right px-4 py-2 font-semibold">{t('business_api_usage.col_calls')}</th>
              <th className="text-right px-4 py-2 font-semibold">{t('business_api_usage.col_last_call')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">{t('business_api_usage.empty')}</td></tr>
            )}
            {data.map((r, i) => (
              <tr key={r.api_key_id ?? `null-${i}`}>
                <td className="px-4 py-2">
                  {r.api_key_id ? (
                    <span className="text-luna-navy">{r.key_name}</span>
                  ) : (
                    <span className="text-slate-500 italic">{t('business_api_usage.key_jwt_or_public')}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">{r.calls.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-500 whitespace-nowrap">
                  {r.last_call_at ? new Date(r.last_call_at).toLocaleString(i18n.language) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
