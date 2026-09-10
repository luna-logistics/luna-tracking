import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Plus, ArrowLeft, XCircle, RotateCcw, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { ChatMessageList } from '@/components/ChatMessageList';
import { ChatMessageInput } from '@/components/ChatMessageInput';
import {
  fetchConversations, createConversation, setConversationStatus,
  fetchMessages, sendMessage, markConversationRead,
  subscribeToMessages, subscribeToConversations,
  type ConversationSummary, type SupportMessage, type ConversationStatus,
} from '@/lib/support-chat';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Client-facing support inbox. Two-pane on desktop, single-pane on
 * mobile (tapping a row swaps the view to the conversation and shows
 * a back arrow). Same page used by the customer area (/compte/support)
 * and the business area (/entreprise/support) — the routing shell
 * decides the surrounding chrome.
 */
export default function SupportChat() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reloadList = async () => {
    setLoading(true);
    setRows(await fetchConversations());
    setLoading(false);
  };
  useEffect(() => { void reloadList(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToConversations(() => { void reloadList(); });
    return unsub;
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    (async () => {
      const ms = await fetchMessages(selectedId);
      if (!cancelled) setMessages(ms);
      await markConversationRead(selectedId);
      void reloadList();
    })();
    const unsub = subscribeToMessages(selectedId, (m) => {
      setMessages((prev) => [...prev, m]);
      // Mark as read immediately if the tab is visible.
      if (document.visibilityState === 'visible' && m.sender_role !== 'client') {
        void markConversationRead(selectedId).then(() => void reloadList());
      }
    });
    return () => { cancelled = true; unsub(); };
  }, [selectedId]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  if (!user) return null;

  const startNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstMessage.trim()) return;
    setBusy(true);
    try {
      const conv = await createConversation(subject || null);
      await sendMessage(conv.id, firstMessage);
      setSubject(''); setFirstMessage(''); setCreating(false);
      await reloadList();
      setSelectedId(conv.id);
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const onSend = async (body: string) => {
    if (!selectedId) return;
    try {
      const m = await sendMessage(selectedId, body);
      // Optimistically append; Realtime will echo it back and dedup by id.
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); throw err; }
  };

  const flipStatus = async (next: ConversationStatus) => {
    if (!selectedId) return;
    try { await setConversationStatus(selectedId, next); await reloadList(); }
    catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
  };

  return (
    <>
      <SEO title={t('support_chat.page_title')} noindex />
      <div className="grid gap-0 lg:grid-cols-[340px_1fr] h-[calc(100vh-14rem)] min-h-[520px] rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* List */}
        <aside className={cn(
          'border-r border-slate-200 flex flex-col',
          selectedId && 'hidden lg:flex',
        )}>
          <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-luna-navy flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('support_chat.title')}
            </h1>
            <Button size="sm" variant="navy" onClick={() => { setCreating(true); setSelectedId(null); }}>
              <Plus className="h-4 w-4" />{t('support_chat.new')}
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-6 text-center text-sm text-slate-500">{t('common.loading')}</div>}
            {!loading && rows.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">{t('support_chat.empty_list')}</div>
            )}
            {rows.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors',
                  selectedId === r.id && 'bg-luna-blue/5',
                )}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-luna-navy line-clamp-1 flex-1">
                    {r.subject || t('support_chat.no_subject')}
                  </p>
                  {r.unread_count > 0 && (
                    <span className="rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 min-w-[1.25rem] text-center">
                      {r.unread_count > 9 ? '9+' : r.unread_count}
                    </span>
                  )}
                </div>
                {r.last_body && (
                  <p className="mt-0.5 text-xs text-slate-600 line-clamp-1">
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
                    {r.last_message_at && new Date(r.last_message_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Detail */}
        <section className={cn('flex flex-col', !selectedId && !creating && 'hidden lg:flex')}>
          {creating && (
            <form onSubmit={startNew} className="flex-1 p-6 flex flex-col items-center justify-center">
              <div className="w-full max-w-md space-y-4">
                <h2 className="text-lg font-bold text-luna-navy">{t('support_chat.new_conv_title')}</h2>
                <p className="text-sm text-slate-600">{t('support_chat.new_conv_intro')}</p>
                <div>
                  <Label>{t('support_chat.subject_label')}</Label>
                  <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('support_chat.subject_placeholder')} maxLength={200} />
                </div>
                <div>
                  <Label>{t('support_chat.first_message_label')}</Label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                    rows={5} required maxLength={5000}
                    value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)}
                    placeholder={t('support_chat.first_message_placeholder')} />
                </div>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={() => setCreating(false)}>{t('support_chat.cancel')}</Button>
                  <Button type="submit" variant="navy" disabled={busy || !firstMessage.trim()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {t('support_chat.create_and_send')}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {!creating && selected && (
            <>
              <header className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
                <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-luna-navy line-clamp-1">{selected.subject || t('support_chat.no_subject')}</p>
                  <p className="text-[11px] text-slate-500">{t(`support_chat.status_${selected.status}`)}</p>
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
              <ChatMessageList messages={messages} viewerRole="client" />
              <ChatMessageInput onSend={onSend} disabled={selected.status === 'closed'} />
              {selected.status === 'closed' && (
                <p className="px-4 py-2 text-xs text-center text-slate-500 bg-slate-50 border-t border-slate-200">
                  {t('support_chat.closed_hint')}
                </p>
              )}
            </>
          )}

          {!creating && !selected && (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-500">
              <div>
                <MessageSquare className="h-10 w-10 mx-auto opacity-40" aria-hidden="true" />
                <p className="mt-3 text-sm">{t('support_chat.pick_or_create')}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
