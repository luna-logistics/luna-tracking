import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The section keys an admin can be granted. Keep in sync with the
 * sidebar in AdminShell and any per-page gate that calls useAdminCan().
 * `admins` = the collaborators page itself (who can invite / revoke).
 */
export const ADMIN_PERMISSIONS = [
  'destinations',
  'products',
  'orders',
  'forwarding',
  'auth_providers',
  'content',
  'blog',
  'pages',
  'support',
  'admins',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Shape stored in admin_users.permissions: either { all: true } or a
 *  subset { section: true, ... } — both are honored by hasPermission(). */
export type PermissionsMap = { all?: boolean } & { [K in AdminPermission]?: boolean };

export function hasPermission(perms: PermissionsMap | null | undefined, section: AdminPermission): boolean {
  if (!perms) return false;
  if (perms.all === true) return true;
  return perms[section] === true;
}

export type AdminRow = {
  id: string;
  user_id: string;
  email: string;
  permissions: PermissionsMap;
  created_at: string;
};

export async function fetchAdminsWithEmail(): Promise<AdminRow[]> {
  // Read the allowlist; admin.users needs a join. Supabase doesn't allow
  // direct auth.users read from anon/authenticated, so we use an RPC or
  // the auth helper. Simpler: two round-trips (get admins, then batch-
  // fetch matching users via /auth/v1/admin — not available client-side).
  //
  // Pragmatic path: read admin_users rows, then fetch emails via the
  // admin RPC below (defined in migration).
  const { data: rows, error } = await supabase
    .from('admin_users')
    .select('id, user_id, permissions, created_at')
    .order('created_at');
  if (error) { console.warn('[admins] fetch failed:', error.message); return []; }

  // Emails need an RPC because auth.users is not exposed via PostgREST.
  const { data: emails } = await supabase.rpc('admin_emails');
  const map = new Map<string, string>((emails ?? []).map((e: { user_id: string; email: string }) => [e.user_id, e.email]));

  return (rows ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    permissions: (r.permissions ?? {}) as PermissionsMap,
    created_at: r.created_at,
    email: map.get(r.user_id) ?? '',
  }));
}

/** Grant admin rights to an existing signed-up user by email. */
export async function addAdminByEmail(email: string, permissions: PermissionsMap): Promise<{ ok: true } | { ok: false; reason: 'no_user' | 'other'; detail?: string }> {
  const { data: userId, error: rpcErr } = await supabase.rpc('user_id_for_email', { p_email: email.trim().toLowerCase() });
  if (rpcErr) return { ok: false, reason: 'other', detail: rpcErr.message };
  if (!userId) return { ok: false, reason: 'no_user' };
  const { error } = await supabase
    .from('admin_users')
    .upsert({ user_id: userId, permissions }, { onConflict: 'user_id' });
  if (error) return { ok: false, reason: 'other', detail: error.message };
  return { ok: true };
}

export async function updateAdminPermissions(id: string, permissions: PermissionsMap) {
  const { error } = await supabase.from('admin_users').update({ permissions }).eq('id', id);
  if (error) throw error;
}

export async function removeAdmin(id: string) {
  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) throw error;
}

/** Read the current signed-in admin's permissions once per session boot.
 *  Returns a can(section) function; permissions object is cached in state. */
export function useAdminCan(): (section: AdminPermission) => boolean {
  const { user, isAdmin } = useAuth();
  const [perms, setPerms] = useState<PermissionsMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isAdmin || !user) { setPerms(null); return; }
    supabase.from('admin_users').select('permissions').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      setPerms((data?.permissions ?? { all: true }) as PermissionsMap);
    });
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  return (section: AdminPermission) => hasPermission(perms, section);
}
