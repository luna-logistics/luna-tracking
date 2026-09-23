/** Guest support access, kept dependency-free so main.tsx can use it before
 *  mount without pulling the Supabase client into the entry chunk. */

const GUEST_KEY = 'luna.support.guest_token';
/** sessionStorage flag the chat bubble restores its open state from. */
export const BUBBLE_OPEN_KEY = 'luna.support.bubble_open';

export function readGuestToken(): string | null {
  try { return localStorage.getItem(GUEST_KEY); } catch { return null; }
}
export function writeGuestToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(GUEST_KEY, token);
    else localStorage.removeItem(GUEST_KEY);
  } catch { /* private-mode / no storage: silently ignore */ }
}

/** "You have a reply" e-mails send guests to `/#conversation=<guest_token>`.
 *  Store the token where the chat bubble reads it, ask the bubble to open on
 *  that conversation, and strip the hash before analytics (or a copied URL)
 *  can carry the token anywhere. The hash never reaches the server. */
export function captureGuestLinkFromHash(): void {
  const m = /^#conversation=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    .exec(window.location.hash);
  if (!m) return;
  writeGuestToken(m[1].toLowerCase());
  try { sessionStorage.setItem(BUBBLE_OPEN_KEY, '1'); } catch { /* ignore */ }
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
}
