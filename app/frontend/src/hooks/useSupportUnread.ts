import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUnreadCount, subscribeToAllMessages } from '@/lib/support-chat';

/** Global unread-messages badge for the current caller. Cheap: one
 *  RPC call on mount, then a single Realtime channel that fires only
 *  on INSERTs. RLS narrows what a client actually receives, so a
 *  regular user never sees another user's messages come through. */
export function useSupportUnread(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }

    let cancelled = false;
    const refresh = () => {
      void fetchUnreadCount().then((n) => { if (!cancelled) setCount(n); });
    };

    refresh();

    // Every INSERT into support_messages we're allowed to see refreshes
    // the counter. We intentionally do NOT increment locally — the RPC
    // already scopes correctly (client vs admin, own vs all) so a full
    // refresh is both simpler and always right.
    const unsub = subscribeToAllMessages(() => refresh());

    // Refresh when the tab comes back to focus (in case we missed a
    // realtime event while the browser tab was sleeping).
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user?.id]);

  return count;
}
