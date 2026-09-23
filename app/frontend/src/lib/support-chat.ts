import i18n from 'i18next';
import { supabase } from '@/lib/supabase';

/** Site locale the visitor is using right now ('en' under /en, else 'fr').
 *  Stored on every new conversation so the reply e-mail speaks it. */
export function siteLanguage(): 'fr' | 'en' {
  return i18n.language === 'en' ? 'en' : 'fr';
}

/** Support chat data layer. `sender_role` is trusted (stamped by a
 *  BEFORE INSERT trigger from is_admin(auth.uid()) — clients cannot
 *  pretend to be admin), so the UI can decide bubble style directly
 *  from that value without a second server round-trip. */

export type ConversationStatus = 'open' | 'closed';
export type SenderRole = 'client' | 'admin';

export type SupportConversation = {
  id: string;
  user_id: string;
  subject: string | null;
  status: ConversationStatus;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Enriched row returned by support_conversations_with_unread() — the
 *  list uses this so we render the sidebar in one round-trip. */
export type ConversationSummary = SupportConversation & {
  last_body: string | null;
  last_sender_role: SenderRole | null;
  unread_count: number;
  user_email: string | null;
  user_display_name: string | null;
  is_guest: boolean;
  /** Set when staff deleted (soft) the conversation — only in the admin "deleted" view. */
  deleted_at: string | null;
};

export const SUPPORT_ACCESS_MODES = ['everyone','authenticated','individual','business'] as const;
export type SupportAccessMode = (typeof SUPPORT_ACCESS_MODES)[number];

export type SupportMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_role: SenderRole;
  body: string;
  read_at: string | null;
  created_at: string;
};

// ─── Conversations ───────────────────────────────────────────────

/** Admin variant: surfaces the error instead of an empty list, so a broken
 *  RPC is visible rather than looking like "no conversations". */
export async function fetchConversationsStrict(deleted = false): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('support_conversations_with_unread', { p_deleted: deleted });
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('support_conversations_with_unread');
  if (error) { console.warn('[support] list failed:', error.message); return []; }
  return (data ?? []) as ConversationSummary[];
}

export async function fetchConversation(id: string): Promise<SupportConversation | null> {
  const { data, error } = await supabase.from('support_conversations').select('*').eq('id', id).maybeSingle();
  if (error) { console.warn('[support] fetchOne failed:', error.message); return null; }
  return (data as SupportConversation) ?? null;
}

/** Client only — creates their own conversation. user_id is forced to
 *  auth.uid() by RLS, so passing it is optional; we do so explicitly
 *  for clarity. */
export async function createConversation(subject: string | null): Promise<SupportConversation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  const { data, error } = await supabase.from('support_conversations')
    .insert({ user_id: user.id, subject: subject?.trim() || null, language: siteLanguage() })
    .select().single();
  if (error) throw error;
  return data as SupportConversation;
}

export async function setConversationStatus(id: string, status: ConversationStatus): Promise<void> {
  const { error } = await supabase.from('support_conversations').update({ status }).eq('id', id);
  if (error) throw error;
}

// ─── Messages ────────────────────────────────────────────────────

export async function fetchMessages(conversationId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase.from('support_messages').select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[support] messages failed:', error.message); return []; }
  return (data ?? []) as SupportMessage[];
}

/** sender_id + sender_role are stamped server-side by a trigger; the
 *  client only supplies conversation_id + body. */
export async function sendMessage(conversationId: string, body: string): Promise<SupportMessage> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('empty_body');
  const { data, error } = await supabase.from('support_messages')
    .insert({ conversation_id: conversationId, body: trimmed, sender_role: 'client' })
    // ↑ sender_role is ignored — the trigger overwrites it. Kept in the
    //   payload so we satisfy the NOT NULL constraint even before the
    //   trigger runs (Postgres validates NOT NULL BEFORE triggers).
    .select().single();
  if (error) throw error;
  return data as SupportMessage;
}

export async function markConversationRead(conversationId: string): Promise<number> {
  const { data, error } = await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
  if (error) { console.warn('[support] mark_read failed:', error.message); return 0; }
  const n = (data as number) ?? 0;
  if (n > 0) announceUnreadChanged();
  return n;
}

/** Soft-delete (admin only): the conversation leaves every list and badge;
 *  messages and the send log are kept, and it can be restored. */
export async function adminDeleteConversation(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_support_conversation', { p_id: id });
  if (error) throw error;
  announceUnreadChanged();
}

export async function adminRestoreConversation(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_restore_support_conversation', { p_id: id });
  if (error) throw error;
  announceUnreadChanged();
}

/** Call `cb` each time the page comes back into view. A message that arrived
 *  while the tab was in the background counts as read only once the person
 *  actually returns to it — so every open conversation view re-marks then. */
export function onPageShown(cb: () => void): () => void {
  const run = () => { if (document.visibilityState === 'visible') cb(); };
  document.addEventListener('visibilitychange', run);
  return () => document.removeEventListener('visibilitychange', run);
}

// Every unread badge (dashboard sidebars, chat bubble) re-reads the server
// count when a conversation is marked read or deleted in this tab — Realtime
// only reports new messages, never a read.
const UNREAD_EVENT = 'luna:support-unread-changed';
export function announceUnreadChanged(): void {
  window.dispatchEvent(new Event(UNREAD_EVENT));
}
export function onUnreadChanged(cb: () => void): () => void {
  window.addEventListener(UNREAD_EVENT, cb);
  return () => window.removeEventListener(UNREAD_EVENT, cb);
}

// ─── Unread badge (global) ───────────────────────────────────────

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('support_unread_count');
  if (error) { console.warn('[support] unread failed:', error.message); return 0; }
  return (data as number) ?? 0;
}

// ─── Realtime subscribers ────────────────────────────────────────

type Unsubscribe = () => void;

/**
 * Unique per-subscription channel topic.
 *
 * Every subscriber below MUST get its own channel instance. Two callers
 * that share a fixed topic (e.g. `useSupportUnread` in a dashboard shell
 * AND the global `SupportAdminNotifier`, both wanting all messages) would
 * otherwise both call `supabase.channel('support:all')`; supabase-js hands
 * the second caller back the FIRST — already-subscribed — channel, and its
 * chained `.on('postgres_changes', …)` throws "cannot add postgres_changes
 * callbacks … after subscribe()", which bubbled to the error boundary on
 * login. A unique suffix guarantees a genuinely fresh channel each time, so
 * `.on()` is always chained before `.subscribe()` on that new channel and
 * cleanup (`removeChannel`) removes exactly this instance.
 */
let channelSeq = 0;
function uniqueTopic(base: string): string {
  channelSeq += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${base}#${channelSeq}-${rand}`;
}

/** Live tail of a single conversation. RLS filters at the server so
 *  another user cannot receive messages for a conversation they can't
 *  read — the filter here is a performance hint, not a security gate. */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (m: SupportMessage) => void,
): Unsubscribe {
  const channel = supabase.channel(uniqueTopic(`support:conv:${conversationId}`))
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onInsert(payload.new as SupportMessage))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** Admin-wide inbox stream (all conversations). Non-admins get filtered
 *  by RLS anyway — subscribing here from a client account is harmless
 *  (they'd only see their own INSERTs). */
export function subscribeToAllMessages(onInsert: (m: SupportMessage) => void): Unsubscribe {
  const channel = supabase.channel(uniqueTopic('support:all'))
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_messages' },
      (payload) => onInsert(payload.new as SupportMessage))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** Live tail of conversation-row changes (new convo, status flip,
 *  bumped last_message_at). Used by the list view. */
export function subscribeToConversations(
  onChange: () => void,
): Unsubscribe {
  const channel = supabase.channel(uniqueTopic('support:conversations'))
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'support_conversations' },
      () => onChange())
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

// ─── Guest flow (no account) ─────────────────────────────────────

export type GuestConversationView = {
  id: string;
  subject: string | null;
  status: ConversationStatus;
  created_at: string;
  email: string;
  name: string | null;
  messages: Array<Pick<SupportMessage, 'id' | 'sender_role' | 'body' | 'created_at' | 'read_at'>>;
};

export { readGuestToken, writeGuestToken } from '@/lib/guest-token';

/** Rejections (rate_limited, captcha_failed, invalid_email…) come back as
 *  `error` on the row rather than as a DB exception — so the attempt still
 *  counts against the rate limit — and are re-thrown here as an Error whose
 *  message is the code (see submitErrorKey). */
export async function guestCreateConversation(input: {
  email: string; name: string; subject: string; body: string;
  captcha?: string | null; hp?: string;
}): Promise<{ conversation_id: string; guest_token: string }> {
  const { data, error } = await supabase.rpc('guest_create_support_conversation', {
    p_email: input.email,
    p_name: input.name,
    p_subject: input.subject,
    p_body: input.body,
    p_captcha: input.captcha ?? null,
    p_hp: input.hp ?? '',
    p_language: siteLanguage(),
  });
  if (error) throw error;
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) throw new Error('empty_response');
  if (row.error) throw new Error(String(row.error));
  return { conversation_id: row.conversation_id as string, guest_token: row.guest_token as string };
}

export async function guestSendMessage(token: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('guest_send_support_message', { p_token: token, p_body: body });
  if (error) throw error;
}

/** Mark staff replies read — only when the guest actually has the
 *  conversation on screen (fetching no longer does it). */
export async function guestMarkRead(token: string): Promise<number> {
  const { data, error } = await supabase.rpc('guest_mark_support_read', { p_token: token });
  if (error) { console.warn('[support] guest mark_read failed:', error.message); return 0; }
  const n = (data as number) ?? 0;
  if (n > 0) announceUnreadChanged();
  return n;
}

export async function guestFetchConversation(token: string): Promise<GuestConversationView | null> {
  const { data, error } = await supabase.rpc('guest_fetch_support_conversation', { p_token: token });
  if (error) { console.warn('[support] guest fetch failed:', error.message); return null; }
  return (data as GuestConversationView) ?? null;
}

// ─── Access mode (admin setting) ─────────────────────────────────

export async function fetchAccessMode(): Promise<SupportAccessMode> {
  const { data, error } = await supabase.from('platform_settings')
    .select('value').eq('key', 'support_access_mode').maybeSingle();
  if (error) { console.warn('[support] access mode fetch failed:', error.message); return 'everyone'; }
  const raw = data?.value;
  const mode = typeof raw === 'string' ? raw : 'everyone';
  return (SUPPORT_ACCESS_MODES.includes(mode as SupportAccessMode) ? mode : 'everyone') as SupportAccessMode;
}

export async function setAccessMode(mode: SupportAccessMode): Promise<void> {
  const { error } = await supabase.rpc('set_support_access_mode', { p_mode: mode });
  if (error) throw error;
}

// ─── Email notification config (admin only) ──────────────────────

export type SupportNotifyConfig = {
  recipient_email: string;
  from_address: string;
  enabled: boolean;
};

export async function fetchNotifyConfig(): Promise<SupportNotifyConfig> {
  const { data, error } = await supabase.rpc('get_support_notification_config');
  if (error) throw error;
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return row ?? { recipient_email: '', from_address: '', enabled: true };
}

export async function saveNotifyConfig(cfg: SupportNotifyConfig): Promise<void> {
  const { error } = await supabase.rpc('set_support_notification_config', {
    p_recipient_email: cfg.recipient_email,
    p_from_address:    cfg.from_address,
    p_enabled:         cfg.enabled,
  });
  if (error) throw error;
}
