import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, RefreshCw, RotateCcw, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  fetchOfficeNotifications, retryOfficeNotification, OFFICE_NOTIFICATION_STATUSES,
  type OfficeNotification, type OfficeNotificationStatus,
} from '@/lib/office-notifications';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<OfficeNotificationStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  sending: 'bg-sky-100 text-sky-800',
  sent:    'bg-emerald-100 text-emerald-800',
  skipped: 'bg-amber-100 text-amber-900',
  failed:  'bg-red-100 text-red-800',
};

/** Send log for the office e-mail notifications (/admin/support).
 *  Shows what was e-mailed to the office, what was skipped or failed and
 *  why, and lets an admin re-send a failed / skipped one. */
export function OfficeNotificationLog({ onOpenConversation }: { onOpenConversation?: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<OfficeNotification[] | null>(null);
  const [status, setStatus] = useState<OfficeNotificationStatus | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { setRows(await fetchOfficeNotifications(status === 'all' ? null : status)); }
    catch (err) { setLoadError(errorMessage(err, t('common.error_generic'))); }
    finally { setLoading(false); }
  }, [status, t]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await retryOfficeNotification(id);
      toast.success(t('admin_support.log_retry_queued'));
      // The Edge Function answers within seconds; refresh once it has had time.
      window.setTimeout(() => void load(), 4000);
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setRetrying(null); }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const failedCount = rows?.filter((r) => r.status === 'failed').length ?? 0;

  return (
    <section className="mb-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4">
      <header className="flex items-center gap-2 flex-wrap">
        <History className="h-4 w-4 text-amber-700" aria-hidden="true" />
        <h2 className="font-semibold text-luna-navy text-sm">{t('admin_support.log_title')}</h2>
        {open && failedCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
            {t('admin_support.log_failed_count', { count: failedCount })}
          </span>
        )}
        <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => setOpen((v) => !v)}
          aria-expanded={open} aria-controls="office-notification-log">
          {open ? t('admin_support.log_hide') : t('admin_support.log_show')}
        </Button>
      </header>
      <p className="text-xs text-slate-600 mt-2">{t('admin_support.log_intro')}</p>

      {open && (
        <div id="office-notification-log" className="mt-3">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <label htmlFor="office-log-status" className="text-xs text-slate-700">{t('admin_support.log_filter')}</label>
            <select id="office-log-status" value={status}
              onChange={(e) => setStatus(e.target.value as OfficeNotificationStatus | 'all')}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs">
              <option value="all">{t('admin_support.log_status_all')}</option>
              {OFFICE_NOTIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`admin_support.log_status_${s}`)}</option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-8" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              {t('admin_support.log_refresh')}
            </Button>
          </div>

          {loadError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {t('admin_support.log_load_error')} {loadError}
            </p>
          )}
          {!loadError && rows && rows.length === 0 && (
            <p className="text-xs text-slate-600">{t('admin_support.log_empty')}</p>
          )}
          {!loadError && rows === null && loading && (
            <p className="text-xs text-slate-500">{t('admin_support.log_loading')}</p>
          )}

          {rows && rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">{t('admin_support.log_col_date')}</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">{t('admin_support.log_col_kind')}</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">{t('admin_support.log_col_subject')}</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold">{t('admin_support.log_col_status')}</th>
                    <th scope="col" className="text-left px-3 py-2 font-semibold"><span className="sr-only">{t('admin_support.log_col_actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmt(r.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{t(`admin_support.log_kind_${r.kind}`)}</td>
                      <td className="px-3 py-2 min-w-[12rem]">
                        <p className="font-medium text-luna-navy">{r.label ?? '—'}</p>
                        {r.contact && <p className="text-slate-500">{r.contact}</p>}
                      </td>
                      <td className="px-3 py-2 min-w-[10rem]">
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[r.status])}>
                          {t(`admin_support.log_status_${r.status}`)}
                        </span>
                        {r.detail && <p className="mt-1 text-slate-600 break-words">{r.detail}</p>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          {r.conversation_id && onOpenConversation && (
                            <Button size="sm" variant="ghost" className="h-7 px-2"
                              onClick={() => onOpenConversation(r.conversation_id!)}
                              aria-label={t('admin_support.log_open_conversation')}
                              title={t('admin_support.log_open_conversation')}>
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(r.status === 'failed' || r.status === 'skipped') && (
                            <Button size="sm" variant="outline" className="h-7 px-2"
                              onClick={() => void retry(r.id)} disabled={retrying === r.id}>
                              <RotateCcw className="h-3.5 w-3.5" />
                              {t('admin_support.log_retry')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
