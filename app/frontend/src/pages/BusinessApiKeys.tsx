import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Plus, Trash2, Copy, Check, Loader2, ShieldAlert, Info } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchApiKeys, createApiKey, revokeApiKey,
  API_KEY_SCOPES, type ApiKey, type ApiKeyScope,
} from '@/lib/api-keys';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Business API keys — dormant surface. Keys are usable today by anyone
 * with the URL, but no rate-limit or paid plan is enforced. They exist
 * so partners (or the customer's own tooling) can call /api/v1/* today
 * without depending on Supabase JWTs.
 */
export default function BusinessApiKeys() {
  const { t } = useTranslation();
  const { current, role } = useBusiness();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ id: string; full_key: string } | null>(null);

  const canManage = role === 'owner' || role === 'admin';

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    setKeys(await fetchApiKeys(current.id));
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  if (!current) return null;

  return (
    <>
      <SEO title={t('business_api_keys.meta_title')} noindex />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
            <Key className="h-6 w-6" />
            {t('business_api_keys.title')}
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">{t('business_api_keys.intro')}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-luna-blue/20 bg-luna-blue/5 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-luna-blue shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-luna-navy">
          <p className="font-semibold">{t('business_api_keys.usage_title')}</p>
          <p className="mt-1">{t('business_api_keys.usage_body')}</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white border border-slate-200 p-3 text-[11px] font-mono text-slate-700">
{`curl https://zlpzajjfzezjildvchoz.functions.supabase.co/api-v1/shipments?business_id=${current.id} \\
  -H "Authorization: ApiKey lk_live_xxxxxxxx.<secret>"`}
          </pre>
        </div>
      </div>

      {canManage && (
        <CreateForm
          onCreated={(row) => { setNewKey(row); setCreating(false); void reload(); }}
          creating={creating} setCreating={setCreating} businessId={current.id}
        />
      )}

      {newKey && <NewKeyReveal row={newKey} onDismiss={() => setNewKey(null)} />}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-luna-navy mb-3">{t('business_api_keys.list_title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('business_api_keys.col_name')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_api_keys.col_prefix')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_api_keys.col_permissions')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_api_keys.col_last_used')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_api_keys.col_status')}</th>
                {canManage && <th className="text-right px-4 py-3 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('business_api_keys.empty')}</td></tr>
              )}
              {keys.map((k) => (
                <KeyRow key={k.id} k={k} canManage={canManage} onChanged={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CreateForm({ businessId, onCreated, creating, setCreating }: {
  businessId: string;
  onCreated: (row: { id: string; full_key: string }) => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['shipments.read', 'customers.read']);
  const [busy, setBusy] = useState(false);

  const toggle = (s: ApiKeyScope) => {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const row = await createApiKey(businessId, name, scopes);
      onCreated(row);
      setName('');
    } catch (err) {
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally {
      setBusy(false);
    }
  };

  if (!creating) {
    return (
      <div className="mt-4">
        <Button variant="navy" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />{t('business_api_keys.create')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border-2 border-luna-blue/30 bg-white p-5 space-y-4">
      <div>
        <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_api_keys.field_name')}</Label>
        <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t('business_api_keys.field_name_placeholder')} required maxLength={80} />
      </div>
      <div>
        <Label className="text-luna-navy text-xs uppercase tracking-wide">{t('business_api_keys.field_permissions')}</Label>
        <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {API_KEY_SCOPES.map((s) => (
            <label key={s} className="inline-flex items-center gap-2 text-sm text-luna-navy cursor-pointer">
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)}
                className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
              <span className="font-mono text-xs">{s}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
          {t('business_api_keys.cancel')}
        </Button>
        <Button type="submit" variant="navy" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t('business_api_keys.create_submit')}
        </Button>
      </div>
    </form>
  );
}

function NewKeyReveal({ row, onDismiss }: { row: { id: string; full_key: string }; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row.full_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('business_api_keys.copy_failed'));
    }
  };
  return (
    <div className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-900 font-semibold">
        <ShieldAlert className="h-5 w-5" />
        {t('business_api_keys.reveal_title')}
      </div>
      <p className="text-sm text-amber-900">{t('business_api_keys.reveal_body')}</p>
      <div className="flex items-center gap-2 rounded-lg bg-white border border-amber-300 px-3 py-2">
        <code className="flex-1 text-xs font-mono text-slate-800 truncate" title={row.full_key}>{row.full_key}</code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('business_api_keys.copied') : t('business_api_keys.copy')}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="navy" size="sm" onClick={onDismiss}>
          {t('business_api_keys.reveal_done')}
        </Button>
      </div>
    </div>
  );
}

function KeyRow({ k, canManage, onChanged }: { k: ApiKey; canManage: boolean; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const revoked = !!k.revoked_at;
  const perms = useMemo(() => (Array.isArray(k.permissions) ? k.permissions : []) as string[], [k.permissions]);

  const revoke = async () => {
    if (!confirm(t('business_api_keys.revoke_confirm'))) return;
    setBusy(true);
    try { await revokeApiKey(k.id); await onChanged(); toast.success(t('business_api_keys.revoked')); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  return (
    <tr className={cn(revoked && 'opacity-50')}>
      <td className="px-4 py-3 text-luna-navy font-medium">{k.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-slate-700">{k.key_prefix}<span className="text-slate-400">.…</span></td>
      <td className="px-4 py-3">
        {perms.length === 0
          ? <span className="text-slate-400 text-xs">—</span>
          : (
            <div className="flex flex-wrap gap-1">
              {perms.map((p) => (
                <span key={p} className="inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-mono">
                  {p}
                </span>
              ))}
            </div>
          )
        }
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
        {k.last_used_at ? new Date(k.last_used_at).toLocaleString(i18n.language) : '—'}
      </td>
      <td className="px-4 py-3">
        {revoked
          ? <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[11px] font-semibold">{t('business_api_keys.status_revoked')}</span>
          : <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold">{t('business_api_keys.status_active')}</span>
        }
      </td>
      {canManage && (
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {!revoked && (
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={revoke} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {t('business_api_keys.revoke')}
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}
