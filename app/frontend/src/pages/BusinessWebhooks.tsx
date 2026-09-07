import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Webhook, Plus, Trash2, Copy, Check, Loader2, ShieldAlert, Info,
  RotateCcw, ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, Clock,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchEndpoints, fetchRecentDeliveries, createEndpoint, rotateSecret,
  setEndpointActive, deleteEndpoint,
  WEBHOOK_EVENTS, type WebhookEndpoint, type WebhookDelivery, type WebhookEvent,
} from '@/lib/webhooks';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export default function BusinessWebhooks() {
  const { t, i18n } = useTranslation();
  const { current, role } = useBusiness();
  const canManage = role === 'owner' || role === 'admin';
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<{ id: string; secret: string; label: string } | null>(null);

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    const [e, d] = await Promise.all([fetchEndpoints(current.id), fetchRecentDeliveries(current.id)]);
    setEndpoints(e); setDeliveries(d);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_webhooks.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Webhook className="h-6 w-6" />
            {t('business_webhooks.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_webhooks.intro')}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-luna-blue/20 bg-luna-blue/5 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-luna-blue shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-luna-navy">
          <p className="font-semibold">{t('business_webhooks.hmac_title')}</p>
          <p className="mt-1">{t('business_webhooks.hmac_body')}</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white border border-slate-200 p-3 text-[11px] font-mono text-slate-700">
{`X-Webhook-Timestamp: 1788771234
X-Webhook-Signature: t=1788771234,v1=<sha256>
X-Webhook-Event:     shipment.status_changed
X-Webhook-Attempt:   1`}
          </pre>
        </div>
      </div>

      {canManage && (
        <CreateForm
          creating={creating} setCreating={setCreating} businessId={current.id}
          onCreated={(row) => { setReveal({ id: row.id, secret: row.secret, label: 'created' }); setCreating(false); void reload(); }}
        />
      )}

      {reveal && <SecretReveal row={reveal} onDismiss={() => setReveal(null)} />}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-luna-navy mb-3">{t('business_webhooks.endpoints_title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('business_webhooks.col_name')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_webhooks.col_url')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_webhooks.col_events')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_webhooks.col_status')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_webhooks.col_last_success')}</th>
                {canManage && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
              {!loading && endpoints.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('business_webhooks.empty')}</td></tr>
              )}
              {endpoints.map((e) => (
                <EndpointRow key={e.id} e={e} canManage={canManage}
                  onRotated={(id, secret) => setReveal({ id, secret, label: 'rotated' })}
                  onChanged={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-luna-navy mb-3">{t('business_webhooks.deliveries_title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">{t('business_webhooks.d_when')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_webhooks.d_event')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_webhooks.d_status')}</th>
                <th className="text-right px-4 py-2 font-semibold">{t('business_webhooks.d_attempts')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('business_webhooks.d_next_retry')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
              {!loading && deliveries.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('business_webhooks.no_deliveries')}</td></tr>
              )}
              {deliveries.map((d) => <DeliveryRow key={d.id} d={d} lang={i18n.language} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('business_webhooks.retry_hint')}</p>
      </section>
    </>
  );
}

function CreateForm({
  businessId, creating, setCreating, onCreated,
}: {
  businessId: string; creating: boolean; setCreating: (v: boolean) => void;
  onCreated: (row: { id: string; secret: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://');
  const [events, setEvents] = useState<WebhookEvent[]>(['*']);
  const [busy, setBusy] = useState(false);

  const toggle = (evt: WebhookEvent) => {
    setEvents((prev) => {
      if (evt === '*') return ['*'];
      const without = prev.filter((x) => x !== '*' && x !== evt);
      return prev.includes(evt) ? without : [...without, evt];
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const row = await createEndpoint(businessId, name, url, events);
      onCreated(row);
      setName(''); setUrl('https://'); setEvents(['*']);
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setBusy(false); }
  };

  if (!creating) {
    return (
      <div className="mt-4">
        <Button variant="navy" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />{t('business_webhooks.create')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border-2 border-luna-blue/30 bg-white p-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_webhooks.field_name')}</Label>
          <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80}
            placeholder={t('business_webhooks.field_name_placeholder')} />
        </div>
        <div>
          <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_webhooks.field_url')}</Label>
          <Input className="mt-1.5" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required
            placeholder="https://your-app.example.com/hooks/luna" />
        </div>
      </div>
      <div>
        <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_webhooks.field_events')}</Label>
        <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {WEBHOOK_EVENTS.map((evt) => (
            <label key={evt} className="inline-flex items-center gap-2 text-sm text-luna-navy cursor-pointer">
              <input type="checkbox" checked={events.includes(evt)} onChange={() => toggle(evt)}
                className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
              <span className="font-mono text-xs">{evt === '*' ? t('business_webhooks.event_all') : evt}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>{t('business_webhooks.cancel')}</Button>
        <Button type="submit" variant="navy" disabled={busy || !name.trim() || !/^https:\/\//i.test(url)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t('business_webhooks.create_submit')}
        </Button>
      </div>
    </form>
  );
}

function SecretReveal({ row, onDismiss }: { row: { id: string; secret: string; label: string }; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.secret);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { toast.error(t('business_webhooks.copy_failed')); }
  };
  return (
    <div className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-900 font-semibold">
        <ShieldAlert className="h-5 w-5" />
        {t('business_webhooks.reveal_title')}
      </div>
      <p className="text-sm text-amber-900">{t('business_webhooks.reveal_body')}</p>
      <div className="flex items-center gap-2 rounded-lg bg-white border border-amber-300 px-3 py-2">
        <code className="flex-1 text-xs font-mono text-slate-800 truncate" title={row.secret}>{row.secret}</code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('business_webhooks.copied') : t('business_webhooks.copy')}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="navy" size="sm" onClick={onDismiss}>{t('business_webhooks.reveal_done')}</Button>
      </div>
    </div>
  );
}

function EndpointRow({
  e, canManage, onRotated, onChanged,
}: {
  e: WebhookEndpoint; canManage: boolean;
  onRotated: (id: string, secret: string) => void;
  onChanged: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);

  const rotate = async () => {
    if (!confirm(t('business_webhooks.rotate_confirm'))) return;
    setBusy(true);
    try { const secret = await rotateSecret(e.id); onRotated(e.id, secret); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const toggle = async () => {
    setBusy(true);
    try { await setEndpointActive(e.id, !e.is_active); await onChanged(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(t('business_webhooks.delete_confirm'))) return;
    setBusy(true);
    try { await deleteEndpoint(e.id); await onChanged(); toast.success(t('business_webhooks.deleted')); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  return (
    <tr className={cn(!e.is_active && 'opacity-50')}>
      <td className="px-4 py-3 text-luna-navy font-medium">{e.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-xs truncate" title={e.url}>{e.url}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(e.event_types ?? []).slice(0, 6).map((ev) => (
            <span key={ev} className="inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-mono">
              {ev === '*' ? 'all' : ev}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        {e.is_active
          ? <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold">{t('business_webhooks.status_active')}</span>
          : <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-semibold">{t('business_webhooks.status_paused')}</span>
        }
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
        {e.last_success_at ? new Date(e.last_success_at).toLocaleString(i18n.language) : '—'}
      </td>
      {canManage && (
        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
          <Button size="sm" variant="outline" onClick={toggle} disabled={busy} title={e.is_active ? t('business_webhooks.pause') : t('business_webhooks.resume')}>
            {e.is_active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="outline" onClick={rotate} disabled={busy} title={t('business_webhooks.rotate')}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={remove} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </td>
      )}
    </tr>
  );
}

function DeliveryRow({ d, lang }: { d: WebhookDelivery; lang: string }) {
  const delivered = d.delivered_at != null;
  const failed = !delivered && d.attempts >= 6;
  const pending = !delivered && !failed;
  const Icon = delivered ? CheckCircle2 : failed ? AlertTriangle : Clock;
  const badge = delivered
    ? 'bg-emerald-100 text-emerald-800'
    : failed ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  const label = delivered
    ? `${d.last_status_code ?? 200}`
    : failed ? `failed · ${d.last_status_code ?? d.last_error ?? ''}`
             : `pending · ${d.last_error ?? d.last_status_code ?? '…'}`;
  return (
    <tr>
      <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{new Date(d.created_at).toLocaleString(lang)}</td>
      <td className="px-4 py-2 font-mono text-xs text-luna-navy">{d.event_type}</td>
      <td className="px-4 py-2">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', badge)}>
          <Icon className="h-3 w-3" aria-hidden="true" />
          {label}
        </span>
      </td>
      <td className="px-4 py-2 text-right">{d.attempts}</td>
      <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
        {pending && d.next_retry_at ? new Date(d.next_retry_at).toLocaleString(lang) : '—'}
      </td>
    </tr>
  );
}
