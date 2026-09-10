import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Message composer. Enter sends, Shift+Enter inserts a newline. Cap
 * mirrors the server-side CHECK (5000 chars) so the user hits the
 * limit before the server rejects it.
 */
export function ChatMessageInput({
  onSend, disabled = false, placeholder,
}: {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    try {
      await onSend(trimmed);
      setBody('');
    } finally { setBusy(false); }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex gap-2 items-end">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? t('support_chat.input_placeholder')}
          disabled={disabled || busy}
          rows={2}
          maxLength={5000}
          className="flex-1 resize-none"
        />
        <Button
          type="button"
          variant="navy"
          size="lg"
          onClick={() => void submit()}
          disabled={disabled || busy || !body.trim()}
          className="h-[3.75rem]"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          <span className="hidden sm:inline">{t('support_chat.send')}</span>
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-slate-400 text-right">
        {t('support_chat.enter_hint')}
      </p>
    </div>
  );
}
