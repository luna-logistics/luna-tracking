import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { fetchAuthProviders, setProviderEnabled, type AuthProviderRow } from '@/lib/auth-providers';

/**
 * Toggle which social login buttons appear on /connexion + /inscription.
 * Client credentials themselves live in the Supabase dashboard, not here —
 * a link jumps admins straight there.
 */
export default function AdminAuthProviders() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuthProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setRows(await fetchAuthProviders());
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  // The Supabase project ref is public (part of the URL bundled in the
  // frontend), so linking to it here leaks nothing.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseRef = supabaseUrl?.match(/^https:\/\/([^.]+)\./)?.[1];
  const supabaseAuthUrl = supabaseRef
    ? `https://supabase.com/dashboard/project/${supabaseRef}/auth/providers`
    : 'https://supabase.com/dashboard';

  const onToggle = async (row: AuthProviderRow, next: boolean) => {
    setPending(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)));
    try {
      await setProviderEnabled(row.id, next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-auth-providers] toggle failed', err);
      toast.error(t('common.error_generic'));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: row.enabled } : r)));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <SEO title={t('admin_auth.title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin_auth.title')}</h1>
      <p className="mt-3 text-slate-600 max-w-3xl">{t('admin_auth.intro')}</p>

      <div className="mt-5 rounded-2xl border-2 border-luna-blue/20 bg-luna-cyan/5 p-4 max-w-3xl">
        <h2 className="font-semibold text-luna-navy">{t('admin_auth.setup_title')}</h2>
        <ol className="mt-2 text-sm text-slate-700 space-y-1 list-decimal pl-5">
          <li>{t('admin_auth.setup_step1')}</li>
          <li>{t('admin_auth.setup_step2')}</li>
          <li>{t('admin_auth.setup_step3')}</li>
        </ol>
        <a
          href={supabaseAuthUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-luna-navy px-3 py-2 text-sm font-medium text-white hover:bg-luna-navy/90"
        >
          {t('admin_auth.open_supabase')}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-x-auto max-w-3xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_auth.col_provider')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin_auth.col_state')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin_auth.col_toggle')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-luna-navy capitalize">{r.provider}</td>
                <td className="px-4 py-3">
                  <span className={
                    r.enabled
                      ? 'inline-flex items-center rounded-full bg-green-100 text-green-800 px-2.5 py-1 text-xs font-semibold'
                      : 'inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-semibold'
                  }>
                    {t(r.enabled ? 'admin_auth.state_enabled' : 'admin_auth.state_disabled')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Switch
                    checked={r.enabled}
                    disabled={pending === r.id}
                    onCheckedChange={(v) => onToggle(r, v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
