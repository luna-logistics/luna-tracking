import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '@supabase/supabase-js';
import { fetchAuthProviders, signInWithProvider, type AuthProviderRow } from '@/lib/auth-providers';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

/**
 * Renders one button per ENABLED social provider. Nothing rendered when
 * none is enabled — no dead separator, no empty container. Icons are
 * inline SVG so we don't add a whole icon library for two logos.
 */

const PROVIDER_STYLE: Record<string, { className: string; icon: JSX.Element }> = {
  google: {
    className: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
      </svg>
    ),
  },
  facebook: {
    className: 'bg-[#1877F2] text-white hover:bg-[#166FE0]',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
};

export function SocialAuthButtons() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuthProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthProviders().then((r) => { setRows(r); setLoading(false); });
  }, []);

  const enabled = rows.filter((r) => r.enabled);
  if (loading || enabled.length === 0) return null;

  const onClick = async (provider: string) => {
    setBusy(provider);
    try {
      await signInWithProvider(provider as Provider);
      // On success Supabase redirects the browser — this component is unmounted.
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error_generic');
      toast.error(msg);
      setBusy(null);
    }
  };

  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        {t('auth.social_separator')}
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="space-y-2">
        {enabled.map((row) => {
          const style = PROVIDER_STYLE[row.provider];
          if (!style) return null;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onClick(row.provider)}
              disabled={busy !== null}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                style.className
              )}
            >
              {style.icon}
              {t(`auth.continue_with_${row.provider}`)}
              {busy === row.provider && <span className="ml-1 opacity-70">…</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
