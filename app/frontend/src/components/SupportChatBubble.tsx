import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, X, Send, Loader2, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  fetchAccessMode, fetchConversations, createConversation,
  fetchMessages, sendMessage, markConversationRead,
  subscribeToMessages, subscribeToConversations, fetchUnreadCount,
  guestCreateConversation, guestSendMessage, guestFetchConversation,
  readGuestToken, writeGuestToken,
  type SupportMessage, type GuestConversationView, type SupportAccessMode,
} from '@/lib/support-chat';
/**
 * Global live-chat bubble. Anchored bottom-right on every public and
 * client/business page — the user never has to hunt for a menu. Uses
 * the authenticated flow if signed in, the guest flow otherwise (and
 * hides itself when the admin has locked support to a stricter mode).
 * Hidden on admin routes (they have /admin/support) and on auth pages
 * (focused sign-in shouldn't compete with a chat popover).
 */

const HIDDEN_PREFIXES = [
  '/admin', '/en/admin',
  '/connexion', '/en/login',
  '/inscription', '/en/signup',
  '/mot-de-passe-oublie', '/en/forgot-password',
  '/auth/callback',
];

const OPEN_STORAGE_KEY = 'luna.support.bubble_open';

export function SupportChatBubble() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [accessMode, setAccessMode] = useState<SupportAccessMode | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (hidden) return;
    void fetchAccessMode().then(setAccessMode);
  }, [hidden]);

  // Restore open state across route changes (user opens on / then navigates).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPEN_STORAGE_KEY) === '1') setOpen(true);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      if (open) sessionStorage.setItem(OPEN_STORAGE_KEY, '1');
      else sessionStorage.removeItem(OPEN_STORAGE_KEY);
    } catch { /* ignore */ }
  }, [open]);

  // Unread badge: logged in → server count; guest → derived from local convo.
  useEffect(() => {
    if (hidden) return;
    let stopped = false;
    const tick = async () => {
      if (user) {
        const n = await fetchUnreadCount();
        if (!stopped) setUnread(n);
      } else {
        const token = readGuestToken();
        if (!token) { setUnread(0); return; }
        const c = await guestFetchConversation(token);
        if (stopped || !c) return;
        setUnread(c.messages.filter((m) => m.sender_role === 'admin' && !m.read_at).length);
      }
    };
    void tick();
    const id = window.setInterval(tick, 15000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [hidden, user?.id, open]);

  // If the admin locked support to a mode this visitor doesn't satisfy,
  // hide the bubble entirely — better than a dead-end.
  const gateOK = useMemo(() => {
    if (!accessMode) return false;
    if (accessMode === 'everyone') return true;
    return !!user; // authenticated/individual/business all require login at minimum.
  }, [accessMode, user]);

  if (hidden || !gateOK) return null;

  return (
    <>
      {/* Panel */}
      {open && !minimized && (
        <div
          className="fixed z-[70] bottom-24 right-4 sm:right-6 w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-8rem))] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4"
          role="dialog"
          aria-label={t('support_chat.title')}
        >
          <header className="px-4 py-3 bg-luna-navy text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <p className="font-semibold text-sm truncate">{t('support_chat.bubble_title')}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setMinimized(true)}
                className="p-1 rounded hover:bg-white/10" aria-label={t('support_chat.minimize')}>
                <Minus className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/10" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          {user ? <AuthedBubbleBody /> : <GuestBubbleBody />}
        </div>
      )}

      {/* Floating pill launcher — bar with "Chattez avec nous" + online dot,
          collapses to an icon-only circle on very narrow screens. */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v || minimized); setMinimized(false); }}
        aria-label={t('support_chat.bubble_open_aria')}
        className={cn(
          'fixed z-[71] bottom-4 right-4 sm:bottom-6 sm:right-6 shadow-xl transition-all',
          'bg-luna-navy text-white hover:bg-luna-navy/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-luna-cyan/40',
          open && !minimized
            ? 'h-12 w-12 rounded-full flex items-center justify-center'
            : 'rounded-full pl-3 pr-5 py-2.5 sm:py-3 flex items-center gap-2.5',
        )}
      >
        {open && !minimized ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-luna-navy" title={t('support_chat.bubble_online')} />
            </span>
            <span className="text-sm font-medium whitespace-nowrap">
              {t('support_chat.bubble_launcher_label')}
            </span>
          </>
        )}
        {unread > 0 && !(open && !minimized) && (
          <span className="ml-1 rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 min-w-[1.25rem] text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Authenticated body — reuses (or creates) an open conversation
// ─────────────────────────────────────────────────────────────────

function AuthedBubbleBody() {
  const { t, i18n } = useTranslation();
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pick the most recent open conversation, or create one on first send.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchConversations();
      if (cancelled) return;
      const openRow = rows.find((r) => r.status === 'open') ?? rows[0] ?? null;
      if (openRow) {
        setConvId(openRow.id);
        const ms = await fetchMessages(openRow.id);
        if (!cancelled) { setMessages(ms); await markConversationRead(openRow.id); }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeToMessages(convId, (m) => {
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      if (m.sender_role === 'admin') void markConversationRead(convId);
    });
    return unsub;
  }, [convId]);

  // Also react to convo status flips (admin closes it) — refetches.
  useEffect(() => {
    const unsub = subscribeToConversations(() => {
      if (!convId) return;
      void fetchMessages(convId).then(setMessages);
    });
    return unsub;
  }, [convId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      let id = convId;
      if (!id) {
        const conv = await createConversation(null);
        id = conv.id; setConvId(id);
      }
      const m = await sendMessage(id, body);
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      setDraft('');
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setSending(false); }
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {loading && <div className="text-center text-xs text-slate-500 py-8"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>}
        {!loading && messages.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-8 px-4">{t('support_chat.bubble_start_hint')}</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_role === 'client';
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm',
                mine ? 'bg-luna-navy text-white rounded-br-sm' : 'bg-white text-luna-navy border border-slate-200 rounded-bl-sm',
              )}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-0.5 text-[10px]', mine ? 'text-white/60' : 'text-slate-400')}>{fmtTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <BubbleComposer draft={draft} setDraft={setDraft} onSend={send} busy={sending} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Guest body — first-visit form → sticky guest conversation
// ─────────────────────────────────────────────────────────────────

function GuestBubbleBody() {
  const { t, i18n } = useTranslation();
  const [conv, setConv] = useState<GuestConversationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = readGuestToken();
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const c = await guestFetchConversation(token);
      if (!cancelled) { setConv(c); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll while open (guests can't hold a Realtime auth session).
  useEffect(() => {
    if (!conv) return;
    const token = readGuestToken();
    if (!token) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const fresh = await guestFetchConversation(token);
      if (!stopped && fresh) setConv(fresh);
    };
    const id = window.setInterval(tick, 6000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [conv?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !firstMessage.trim() || busy) return;
    setBusy(true);
    try {
      const row = await guestCreateConversation({ email, name, subject: '', body: firstMessage });
      writeGuestToken(row.guest_token);
      const fresh = await guestFetchConversation(row.guest_token);
      setConv(fresh);
      setFirstMessage('');
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const sendGuest = async () => {
    const token = readGuestToken();
    const body = draft.trim();
    if (!token || !body || busy) return;
    setBusy(true);
    try {
      await guestSendMessage(token, body);
      const fresh = await guestFetchConversation(token);
      if (fresh) setConv(fresh);
      setDraft('');
    } catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
    finally { setBusy(false); }
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return <div className="flex-1 flex items-center justify-center bg-slate-50"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  if (!conv) {
    return (
      <form onSubmit={start} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        <p className="text-xs text-slate-600">{t('support_chat.bubble_guest_intro')}</p>
        <div>
          <Label className="text-xs">{t('guest_support.email_label')} *</Label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-9 text-sm" placeholder="vous@exemple.com" />
        </div>
        <div>
          <Label className="text-xs">{t('guest_support.name_label')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 h-9 text-sm" maxLength={100} />
        </div>
        <div>
          <Label className="text-xs">{t('support_chat.bubble_first_message_label')} *</Label>
          <textarea required rows={4} maxLength={5000}
            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
            value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)}
            placeholder={t('support_chat.bubble_first_message_placeholder')} />
        </div>
        <Button type="submit" variant="navy" className="w-full" disabled={busy || !email.trim() || !firstMessage.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t('support_chat.bubble_send_first')}
        </Button>
      </form>
    );
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {conv.messages.map((m) => {
          const mine = m.sender_role === 'client';
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm',
                mine ? 'bg-luna-navy text-white rounded-br-sm' : 'bg-white text-luna-navy border border-slate-200 rounded-bl-sm',
              )}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-0.5 text-[10px]', mine ? 'text-white/60' : 'text-slate-400')}>{fmtTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        {conv.status === 'closed' && (
          <p className="text-center text-[10px] text-slate-500 py-2">{t('support_chat.bubble_closed')}</p>
        )}
      </div>
      <BubbleComposer draft={draft} setDraft={setDraft} onSend={sendGuest} busy={busy}
        disabled={conv.status === 'closed'} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared composer
// ─────────────────────────────────────────────────────────────────

function BubbleComposer({
  draft, setDraft, onSend, busy, disabled = false,
}: {
  draft: string;
  setDraft: (s: string) => void;
  onSend: () => Promise<void> | void;
  busy: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-slate-200 bg-white p-2 flex gap-2 items-end">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(); }
        }}
        placeholder={t('support_chat.input_placeholder')}
        disabled={disabled || busy}
        rows={2}
        maxLength={5000}
        className="flex-1 resize-none rounded-md border border-slate-300 p-2 text-sm min-h-[44px]"
      />
      <Button type="button" variant="navy" size="sm" onClick={() => void onSend()}
        disabled={disabled || busy || !draft.trim()} className="h-11">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}

