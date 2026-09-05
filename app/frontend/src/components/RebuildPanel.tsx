import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCcw, CheckCircle2, XCircle, Loader2, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { triggerRebuild, fetchLatestWorkflowRun, type WorkflowRunSummary } from '@/lib/rebuild';
import { cn } from '@/lib/utils';

/**
 * Panel with a "Rebuild the site" button + live status of the latest
 * GitHub Actions run. Polls every 8s while a run is queued/in-progress,
 * every 60s while idle so the admin sees status shifts without hammering
 * the unauthenticated GitHub API rate limit (60/hr).
 */
export function RebuildPanel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [run, setRun] = useState<WorkflowRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = async () => {
    const r = await fetchLatestWorkflowRun();
    setRun(r);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const schedule = () => {
      const running = run?.status === 'queued' || run?.status === 'in_progress';
      const delay = running ? 8000 : 60000;
      pollRef.current = window.setTimeout(async () => { await load(); schedule(); }, delay);
    };
    schedule();
    return () => { if (pollRef.current !== null) window.clearTimeout(pollRef.current); };
  }, [run?.status]);

  const onRebuild = async () => {
    setTriggering(true);
    try {
      await triggerRebuild();
      toast.success(t('rebuild.dispatched'));
      // GitHub takes a few seconds to expose the new run — refresh a moment later.
      window.setTimeout(load, 3000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[rebuild] failed', err);
      const msg = err instanceof Error ? err.message : t('common.error_generic');
      toast.error(msg);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-luna-navy">{t('rebuild.title')}</h2>
      <p className="mt-1 text-sm text-slate-600 max-w-2xl">{t('rebuild.intro')}</p>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="navy" onClick={onRebuild} disabled={triggering || run?.status === 'in_progress' || run?.status === 'queued'}>
          <RefreshCcw className={cn('h-4 w-4', triggering && 'animate-spin')} />
          {triggering ? t('rebuild.dispatching') : t('rebuild.button')}
        </Button>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCcw className="h-3.5 w-3.5" />
          {t('rebuild.refresh')}
        </Button>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 p-4 bg-slate-50/40">
        <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
          {t('rebuild.latest_run')}
        </div>
        {loading ? (
          <div className="text-sm text-slate-500">{t('common.loading')}</div>
        ) : !run ? (
          <div className="text-sm text-slate-500">{t('rebuild.no_run')}</div>
        ) : (
          <RunSummary run={run} lang={lang} />
        )}
      </div>
    </div>
  );
}

function RunSummary({ run, lang }: { run: WorkflowRunSummary; lang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  const status = statusMeta(run);
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', status.pill)}>
          {status.icon}
          {t(status.labelKey)}
        </div>
        <div className="mt-2 text-sm text-luna-navy line-clamp-1 max-w-md">
          {run.head_commit_message?.split('\n')[0] || run.head_sha.slice(0, 7)}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {new Date(run.updated_at).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-BE')}
          {run.actor && ` · ${run.actor}`}
        </div>
      </div>
      <a
        href={run.html_url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-luna-blue hover:underline shrink-0"
      >
        {t('rebuild.view_on_github')}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function statusMeta(run: WorkflowRunSummary) {
  if (run.status === 'in_progress') {
    return { pill: 'bg-blue-100 text-blue-900', icon: <Loader2 className="h-3 w-3 animate-spin" />, labelKey: 'rebuild.status_in_progress' };
  }
  if (run.status === 'queued') {
    return { pill: 'bg-slate-100 text-slate-700', icon: <Clock className="h-3 w-3" />, labelKey: 'rebuild.status_queued' };
  }
  if (run.conclusion === 'success') {
    return { pill: 'bg-green-100 text-green-800', icon: <CheckCircle2 className="h-3 w-3" />, labelKey: 'rebuild.status_success' };
  }
  return { pill: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" />, labelKey: 'rebuild.status_failure' };
}
