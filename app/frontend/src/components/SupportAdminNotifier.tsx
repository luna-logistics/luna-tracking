import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToAllMessages } from '@/lib/support-chat';

/**
 * Live "you got a new support message" notifier for admins. Mounted
 * once at the app root — no visible chrome. Runs only when the current
 * user is an admin, and only outside /admin/support itself (that page
 * already shows the message in-line and marks it read).
 *
 * Three signals when a client/guest message arrives:
 *   - toast with a "Reply" button that deep-links to /admin/support
 *   - short audio ping (WebAudio, no asset needed)
 *   - a native web Notification when the tab isn't focused
 */
export function SupportAdminNotifier() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const permissionAskedRef = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;

    // Ask for browser notification permission once per admin session. The
    // request needs a prior user gesture on some browsers — Notification.
    // requestPermission on load will just return "default" there and we'll
    // fall back to toast + audio; no error.
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default' &&
      !permissionAskedRef.current
    ) {
      permissionAskedRef.current = true;
      Notification.requestPermission().catch(() => { /* denied is fine */ });
    }

    const unsub = subscribeToAllMessages((m) => {
      if (m.sender_role !== 'client') return;
      // Don't fire while the admin is already looking at the inbox.
      if (window.location.pathname.startsWith('/admin/support')) return;

      // ── Audio ping ─────────────────────────────────────────────
      try {
        const ctx = audioCtxRef.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1320, now + 0.09);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.start(now); osc.stop(now + 0.36);
      } catch { /* audio blocked, fine */ }

      // ── Native OS notification when the tab is in the background ──
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        try {
          const n = new Notification(t('admin_support.notify_toast_title'), {
            body: m.body.slice(0, 140),
            icon: '/favicon-32.png',
            tag: `support-${m.conversation_id}`,
            renotify: false,
          } as NotificationOptions);
          n.onclick = () => {
            window.focus();
            navigate('/admin/support');
            n.close();
          };
        } catch { /* ignore */ }
      }

      // ── Toast (always) ─────────────────────────────────────────
      toast.message(t('admin_support.notify_toast_title'), {
        description: m.body.slice(0, 160),
        action: {
          label: t('admin_support.notify_toast_action'),
          onClick: () => navigate('/admin/support'),
        },
        duration: 8000,
      });
    });

    return unsub;
  }, [isAdmin, navigate, t]);

  return null;
}
