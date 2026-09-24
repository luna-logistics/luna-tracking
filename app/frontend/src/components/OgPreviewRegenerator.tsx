import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/lib/supabase';

type Result =
  | { ok: true; generated_at: string; images: Record<'fr' | 'en', { url: string; bytes: number }> }
  | { ok?: false; error: string; message?: string };

/**
 * /admin/contenus → Suivi: the og:image of /suivi and of every shared
 * tracking link, regenerated on the server. The site Worker screenshots the
 * /og/suivi render page (FR + EN, 1200×630, the no-search map — never a real
 * shipment) with Cloudflare Browser Rendering and stores both JPEGs; the
 * og:image URLs don't change, so no rebuild is needed.
 */
export function OgPreviewRegenerator() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(() => Date.now());
  const [result, setResult] = useState<Result | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/og/suivi/regenerate', {
        method: 'POST',
        headers: { authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const body = (await res.json().catch(() => ({ error: `http_${res.status}` }))) as Result;
      setResult(res.ok ? body : { error: 'error' in body ? body.error : `http_${res.status}`, message: 'message' in body ? body.message : undefined });
      if (res.ok) {
        setStamp(Date.now());
        toast.success(t('admin_content.og_success'));
      }
    } catch (err) {
      setResult({ error: 'network', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const failed = result && 'error' in result ? result : null;
  return (
    <section>
      <h2 className="text-lg font-semibold text-luna-navy mb-1">{t('admin_content.og_title')}</h2>
      <p className="mb-4 max-w-3xl text-sm text-slate-600">{t('admin_content.og_intro')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['fr', 'en'] as const).map((lang) => (
          <figure key={lang} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img src={`/brand/og-suivi-${lang}.jpg?t=${stamp}`} alt={t('admin_content.og_thumb_alt', { lang: lang.toUpperCase() })}
              width={1200} height={630} className="block aspect-[1200/630] w-full bg-slate-100 object-cover" />
            <figcaption className="px-3 py-2 text-xs text-slate-500">{lang.toUpperCase()} · 1200×630</figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="navy" onClick={() => void regenerate()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {busy ? t('admin_content.og_running') : t('admin_content.og_button')}
        </Button>
        {result?.ok && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {t('admin_content.og_done', { date: new Date(result.generated_at).toLocaleString(i18n.language) })}
          </span>
        )}
      </div>
      {failed && (
        <div role="alert" className="mt-3 flex max-w-3xl items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('admin_content.og_failed')}</p>
            <p className="mt-0.5">
              {t(`admin_content.og_err_${['unauthorized', 'forbidden', 'browser_rendering_unavailable', 'render_failed', 'not_configured'].includes(failed.error) ? failed.error : 'other'}`)}
            </p>
            {failed.message && <p className="mt-1 font-mono text-xs text-amber-800/80">{failed.message}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
