import { supabase } from '@/lib/supabase';

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
    .insert({ user_id: user.id, subject: subject?.trim() || null })
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
  return (data as number) ?? 0;
}

// ─── Unread badge (global) ───────────────────────────────────────

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('support_unread_count');
  if (error) { console.warn('[support] unread failed:', error.message); return 0; }
  return (data as number) ?? 0;
}

// ─── Realtime subscribers ────────────────────────────────────────

type Unsubscribe = () => void;

/** Live tail of a single conversation. RLS filters at the server so
 *  another user cannot receive messages for a conversation they can't
 *  read — the filter here is a performance hint, not a security gate. */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (m: SupportMessage) => void,
): Unsubscribe {
  const channel = supabase.channel(`support:conv:${conversationId}`)
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
  const channel = supabase.channel('support:all')
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
  const channel = supabase.channel('support:conversations')
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

const GUEST_KEY = 'luna.support.guest_token';
export function readGuestToken(): string | null {
  try { return localStorage.getItem(GUEST_KEY); } catch { return null; }
}
export function writeGuestToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(GUEST_KEY, token);
    else localStorage.removeItem(GUEST_KEY);
  } catch { /* private-mode / no storage: silently ignore */ }
}

export async function guestCreateConversation(input: {
  email: string; name: string; subject: string; body: string;
}): Promise<{ conversation_id: string; guest_token: string }> {
  const { data, error } = await supabase.rpc('guest_create_support_conversation', {
    p_email: input.email,
    p_name: input.name,
    p_subject: input.subject,
    p_body: input.body,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) throw new Error('empty_response');
  return { conversation_id: row.conversation_id as string, guest_token: row.guest_token as string };
}

export async function guestSendMessage(token: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('guest_send_support_message', { p_token: token, p_body: body });
  if (error) throw error;
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
