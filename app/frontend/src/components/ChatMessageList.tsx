import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportMessage } from '@/lib/support-chat';
import { cn } from '@/lib/utils';

/**
 * Renders a scrolling list of chat bubbles. Auto-sticks to the bottom
 * on new messages unless the user has scrolled up (respect: don't yank
 * them out of the history they're reading).
 */
export function ChatMessageList({
  messages, viewerRole,
}: {
  messages: SupportMessage[];
  viewerRole: 'client' | 'admin';
}) {
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId === lastMessageIdRef.current) return;
    lastMessageIdRef.current = lastId;
    // Only auto-scroll if the user is near the bottom (within 100px).
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 text-center text-sm text-slate-500">
        {t('support_chat.empty_messages')}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((m) => {
        const mine = m.sender_role === viewerRole;
        return (
          <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2 shadow-sm',
              mine
                ? 'bg-luna-navy text-white rounded-br-sm'
                : 'bg-slate-100 text-luna-navy rounded-bl-sm',
            )}>
              <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
              <p className={cn(
                'mt-1 text-[10px]',
                mine ? 'text-white/60 text-right' : 'text-slate-500',
              )}>
                {m.sender_role === 'admin' && !mine && (
                  <span className="mr-1 rounded-full bg-luna-cyan/20 text-luna-navy px-1.5 py-0.5 uppercase tracking-wide font-semibold">
                    {t('support_chat.role_admin')}
                  </span>
                )}
                {fmtTime(m.created_at)}
                {mine && m.read_at && (
                  <span className="ml-1">· {t('support_chat.read')}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
