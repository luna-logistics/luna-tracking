import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, ArrowLeft, XCircle, RotateCcw, Search, UserRound, Shield, Mail, Save } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { ChatMessageList } from '@/components/ChatMessageList';
import { ChatMessageInput } from '@/components/ChatMessageInput';
import {
  fetchConversations, setConversationStatus,
  fetchMessages, sendMessage, markConversationRead,
  subscribeToMessages, subscribeToConversations,
  fetchAccessMode, setAccessMode, SUPPORT_ACCESS_MODES,
  fetchNotifyConfig, saveNotifyConfig,
  type ConversationSummary, type SupportMessage, type ConversationStatus,
  type SupportAccessMode, type SupportNotifyConfig,
} from '@/lib/support-chat';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Admin messaging inbox. Same two-pane / one-pane-mobile layout as the
 * client page; the difference is that this list shows every user's
 * conversation and stamps replies as sender_role='admin' (enforced by
 * the DB trigger, not the UI).
 */
export default function AdminSupport() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [mode, setMode] = useState<SupportAccessMode | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  const [notify, setNotify] = useState<SupportNotifyConfig | null>(null);
  const [notifyDirty, setNotifyDirty] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);
  const lang = i18n.language;

  useEffect(() => { void fetchAccessMode().then(setMode); }, []);
  useEffect(() => { void fetchNotifyConfig().then(setNotify); }, []);

  const changeMode = async (next: SupportAccessMode) => {
    setModeSaving(true);
    try {
      await setAccessMode(next);
      setMode(next);
      toast.success(t('admin_support.mode_saved'));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setModeSaving(false); }
  };

  const patchNotify = (patch: Partial<SupportNotifyConfig>) => {
    setNotify((prev) => prev ? { ...prev, ...patch } : prev);
    setNotifyDirty(true);
  };

  const saveNotify = async () => {
    if (!notify) return;
    setNotifySaving(true);
    try {
      await saveNotifyConfig(notify);
      setNotifyDirty(false);
      toast.success(t('admin_support.notify_saved'));
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setNotifySaving(false); }
  };

  const reload = async () => {
    setLoading(true);
    setRows(await fetchConversations());
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    const unsub = subscribeToConversations(() => { void reload(); });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      const ms = await fetchMessages(selectedId);
      if (!cancelled) setMessages(ms);
      await markConversationRead(selectedId);
      void reload();
    })();
    const unsub = subscribeToMessages(selectedId, (m) => {
      setMessages((prev) => [...prev, m]);
      if (document.visibilityState === 'visible' && m.sender_role !== 'admin') {
        void markConversationRead(selectedId).then(() => void reload());
      }
    });
    return () => { cancelled = true; unsub(); };
  }, [selectedId]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyUnread && r.unread_count === 0) return false;
      if (!query) return true;
      return [r.subject, r.last_body, r.user_email, r.user_display_name]
        .some((f) => (f ?? '').toString().toLowerCase().includes(query));
    });
  }, [rows, q, onlyUnread]);

  const onSend = async (body: string) => {
    if (!selectedId) return;
    try {
      const m = await sendMessage(selectedId, body);
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); throw err; }
  };

  const flipStatus = async (next: ConversationStatus) => {
    if (!selectedId) return;
    try { await setConversationStatus(selectedId, next); await reload(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
  };

  return (
    <>
      <SEO title={t('admin_support.meta_title')} noindex />
      {notify && (
        <section className="mb-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4">
          <header className="flex items-center gap-2 mb-2">
            <Mail className="h-4 w-4 text-amber-700" aria-hidden="true" />
            <h2 className="font-semibold text-luna-navy text-sm">{t('admin_support.notify_title')}</h2>
          </header>
          <p className="text-xs text-slate-600 mb-3">{t('admin_support.notify_intro')}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label className="text-xs">{t('admin_support.notify_recipient_label')}</Label>
              <Input
                value={notify.recipient_email}
                onChange={(e) => patchNotify({ recipient_email: e.target.value })}
                placeholder="ex: contact@lunatrackinglogistics.com, admin@..."
                className="mt-1 h-9 text-sm bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">{t('admin_support.notify_recipient_help')}</p>
            </div>
            <div>
              <Label className="text-xs">{t('admin_support.notify_from_label')}</Label>
              <Input
                value={notify.from_address}
                onChange={(e) => patchNotify({ from_address: e.target.value })}
                placeholder="Luna Support <support@lunatrackinglogistics.com>"
                className="mt-1 h-9 text-sm bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">{t('admin_support.notify_from_help')}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={notify.enabled}
                onChange={(e) => patchNotify({ enabled: e.target.checked })}
                className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
              {t('admin_support.notify_enabled_label')}
            </label>
            <Button size="sm" variant="navy" onClick={() => void saveNotify()}
              disabled={notifySaving || !notifyDirty}>
              <Save className="h-3.5 w-3.5" />
              {t('admin_support.notify_save')}
            </Button>
          </div>
        </section>
      )}
      <section className="mb-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4">
        <header className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-amber-700" aria-hidden="true" />
          <h2 className="font-semibold text-luna-navy text-sm">{t('admin_support.mode_title')}</h2>
        </header>
        <p className="text-xs text-slate-600 mb-3">{t('admin_support.mode_intro')}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORT_ACCESS_MODES.map((m) => (
            <label key={m} className={cn(
              'flex items-start gap-2 rounded-lg border p-2 cursor-pointer text-xs transition',
              mode === m ? 'border-luna-navy bg-white shadow-sm' : 'border-slate-200 bg-white/60 hover:bg-white',
              modeSaving && 'opacity-60 pointer-events-none',
            )}>
              <input type="radio" name="access-mode" value={m} checked={mode === m}
                onChange={() => void changeMode(m)}
                className="mt-0.5 text-luna-navy focus:ring-luna-navy/20" />
              <span className="min-w-0">
                <span className="block font-semibold text-luna-navy">{t(`admin_support.mode_${m}`)}</span>
                <span className="block text-slate-600 mt-0.5">{t(`admin_support.mode_${m}_help`)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <div className="grid gap-0 lg:grid-cols-[380px_1fr] h-[calc(100vh-14rem)] min-h-[500px] rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* List */}
        <aside className={cn('border-r border-slate-200 flex flex-col', selectedId && 'hidden lg:flex')}>
          <header className="px-4 py-3 border-b border-slate-200 space-y-2">
            <h1 className="text-lg font-bold text-luna-navy flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('admin_support.title')}
            </h1>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t('admin_support.search_placeholder')} className="pl-8 h-8 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)}
                className="rounded border-slate-300 text-luna-navy focus:ring-luna-navy/20" />
              {t('admin_support.only_unread')}
            </label>
          </header>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-6 text-center text-sm text-slate-500">{t('common.loading')}</div>}
            {!loading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">{t('admin_support.empty')}</div>
            )}
            {filtered.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors',
                  selectedId === r.id && 'bg-luna-blue/5',
                )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-luna-navy truncate flex items-center gap-1.5">
                      {r.is_guest && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-semibold px-1.5 py-0.5 uppercase tracking-wide" title={t('admin_support.guest_label')}>
                          <UserRound className="h-2.5 w-2.5" />{t('admin_support.guest_short')}
                        </span>
                      )}
                      <span className="truncate">{r.user_display_name || r.user_email || t('admin_support.unknown_user')}</span>
                    </p>
                    <p className="text-xs text-slate-500 truncate">{r.subject || t('support_chat.no_subject')}</p>
                  </div>
                  {r.unread_count > 0 && (
                    <span className="rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 min-w-[1.25rem] text-center">
                      {r.unread_count > 9 ? '9+' : r.unread_count}
                    </span>
                  )}
                </div>
                {r.last_body && (
                  <p className="mt-1 text-xs text-slate-600 line-clamp-1">
                    {r.last_sender_role === 'admin' && <span className="text-luna-blue font-semibold">{t('support_chat.role_admin')} · </span>}
                    {r.last_body}
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <span className={cn(
                    'text-[10px] uppercase tracking-wide font-semibold',
                    r.status === 'closed' ? 'text-slate-400' : 'text-emerald-700',
                  )}>{t(`support_chat.status_${r.status}`)}</span>
                  <span className="text-[10px] text-slate-400">
                    {r.last_message_at && new Date(r.last_message_at).toLocaleDateString(lang)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Detail */}
        <section className={cn('flex flex-col', !selectedId && 'hidden lg:flex')}>
          {selected && (
            <>
              <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-luna-navy line-clamp-1">
                    {selected.user_display_name || selected.user_email || t('admin_support.unknown_user')}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {selected.subject || t('support_chat.no_subject')} · {t(`support_chat.status_${selected.status}`)}
                  </p>
                </div>
                {selected.status === 'open' ? (
                  <Button size="sm" variant="ghost" onClick={() => void flipStatus('closed')}>
                    <XCircle className="h-3.5 w-3.5" />{t('support_chat.close')}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void flipStatus('open')}>
                    <RotateCcw className="h-3.5 w-3.5" />{t('support_chat.reopen')}
                  </Button>
                )}
              </header>
              <ChatMessageList messages={messages} viewerRole="admin" />
              <ChatMessageInput onSend={onSend} placeholder={t('admin_support.reply_placeholder')} />
            </>
          )}
          {!selected && (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-500">
              <div>
                <MessageSquare className="h-10 w-10 mx-auto opacity-40" aria-hidden="true" />
                <p className="mt-3 text-sm">{t('admin_support.pick_conversation')}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
