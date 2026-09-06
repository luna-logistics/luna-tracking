import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Save, Info } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import {
  ADMIN_PERMISSIONS, hasPermission,
  fetchAdminsWithEmail, addAdminByEmail, updateAdminPermissions, removeAdmin,
  type AdminRow, type AdminPermission, type PermissionsMap,
} from '@/lib/admin-permissions';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/**
 * List every admin, edit their per-section permissions in place, invite
 * a new collaborator by email, or revoke.
 *
 * Invite flow: the person must have created their own account at
 * /inscription first (Supabase-side signup). Then their email resolves
 * to a user_id via the SECURITY DEFINER RPC and we insert an
 * admin_users row with the checked permissions.
 */
export default function AdminCollaborators() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newPerms, setNewPerms] = useState<PermissionsMap>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setRows(await fetchAdminsWithEmail());
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const onInvite = async () => {
    if (!email.trim()) return;
    setPendingId('__new__');
    const res = await addAdminByEmail(email, newPerms);
    setPendingId(null);
    if (res.ok !== true) {
      if (res.reason === 'no_user') {
        toast.error(t('admin_collaborators.no_such_user'));
      } else {
        toast.error(res.detail ?? t('common.error_generic'));
      }
      return;
    }
    setEmail(''); setNewPerms({});
    toast.success(t('admin_collaborators.added'));
    await reload();
  };

  const onSaveRow = async (row: AdminRow, next: PermissionsMap) => {
    setPendingId(row.id);
    try { await updateAdminPermissions(row.id, next); toast.success(t('admin_collaborators.updated')); await reload(); }
    catch (err) { toast.error(err instanceof Error ? err.message : t('common.error_generic')); }
    finally { setPendingId(null); }
  };

  const onRemove = async (row: AdminRow) => {
    if (row.user_id === user?.id) { toast.error(t('admin_collaborators.cannot_remove_self')); return; }
    if (!confirm(t('admin_collaborators.remove_confirm', { email: row.email }))) return;
    try { await removeAdmin(row.id); toast.success(t('admin_collaborators.removed')); await reload(); }
    catch (err) { toast.error(err instanceof Error ? err.message : t('common.error_generic')); }
  };

  return (
    <>
      <SEO title={t('admin_collaborators.title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin_collaborators.title')}</h1>
      <p className="mt-2 text-slate-600 max-w-3xl">{t('admin_collaborators.intro')}</p>

      <div className="mt-5 rounded-2xl border-2 border-luna-blue/20 bg-luna-cyan/5 p-4 max-w-3xl flex gap-3">
        <Info className="h-5 w-5 text-luna-navy shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-slate-700">{t('admin_collaborators.signup_first_hint')}</p>
      </div>

      {/* Invite form */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-luna-navy">{t('admin_collaborators.invite_title')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="invite-email">{t('admin_collaborators.invite_email')}</Label>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="collaborateur@example.com" className="mt-1.5" />
          </div>
          <Button variant="navy" disabled={pendingId === '__new__' || !email.trim()} onClick={onInvite}>
            <UserPlus className="h-4 w-4" />
            {pendingId === '__new__' ? t('admin_collaborators.adding') : t('admin_collaborators.add')}
          </Button>
        </div>
        <PermissionsMatrix perms={newPerms} onChange={setNewPerms} className="mt-4" />
      </div>

      {/* Existing admins */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-luna-navy mb-3">{t('admin_collaborators.list_title')}</h2>
        {loading ? (
          <div className="py-10 text-center text-slate-500">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-slate-500">
            {t('admin_collaborators.empty')}
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <AdminRowEditor
                key={r.id}
                row={r}
                pending={pendingId === r.id}
                onSave={(perms) => onSaveRow(r, perms)}
                onRemove={() => onRemove(r)}
                isSelf={r.user_id === user?.id}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function AdminRowEditor({
  row, pending, onSave, onRemove, isSelf,
}: {
  row: AdminRow; pending: boolean;
  onSave: (p: PermissionsMap) => void; onRemove: () => void; isSelf: boolean;
}) {
  const { t } = useTranslation();
  const [perms, setPerms] = useState<PermissionsMap>(row.permissions);
  useEffect(() => { setPerms(row.permissions); }, [row.permissions]);
  const dirty = JSON.stringify(perms) !== JSON.stringify(row.permissions);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-luna-navy">{row.email || row.user_id}</div>
          <div className="text-xs text-slate-500">
            {t('admin_collaborators.added_on', { date: new Date(row.created_at).toLocaleDateString('fr-BE') })}
            {isSelf && <span className="ml-2 rounded-full bg-luna-cyan/20 text-luna-navy px-2 py-0.5 font-semibold">{t('admin_collaborators.you')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={dirty ? 'navy' : 'outline'} disabled={!dirty || pending} onClick={() => onSave(perms)}>
            <Save className="h-3.5 w-3.5" />
            {pending ? t('admin_collaborators.saving') : t('admin_collaborators.save')}
          </Button>
          {!isSelf && (
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
              {t('admin_collaborators.remove')}
            </Button>
          )}
        </div>
      </div>
      <PermissionsMatrix perms={perms} onChange={setPerms} className="mt-4" />
    </div>
  );
}

function PermissionsMatrix({
  perms, onChange, className,
}: { perms: PermissionsMap; onChange: (p: PermissionsMap) => void; className?: string }) {
  const { t } = useTranslation();
  const allChecked = perms.all === true;
  const toggle = (section: AdminPermission) => {
    // If 'all' is currently on, expanding to individual toggles means
    // switching to explicit-section mode with all currently-checked ones set.
    if (allChecked) {
      const explicit = Object.fromEntries(ADMIN_PERMISSIONS.map((s) => [s, s !== section])) as PermissionsMap;
      onChange(explicit);
      return;
    }
    onChange({ ...perms, all: false, [section]: !perms[section] });
  };
  const toggleAll = () => {
    if (allChecked) onChange({});
    else onChange({ all: true });
  };

  return (
    <div className={cn('rounded-md border border-slate-200 bg-slate-50/60 p-3', className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('admin_collaborators.permissions')}
        </span>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-luna-navy cursor-pointer">
          <input
            type="checkbox" checked={allChecked} onChange={toggleAll}
            className="h-4 w-4 rounded border-slate-300 text-luna-navy focus:ring-luna-navy"
          />
          {t('admin_collaborators.select_all')}
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {ADMIN_PERMISSIONS.map((s) => {
          const checked = hasPermission(perms, s);
          return (
            <label key={s} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer rounded-md px-2 py-1 hover:bg-white">
              <input
                type="checkbox" checked={checked} onChange={() => toggle(s)}
                className="h-4 w-4 rounded border-slate-300 text-luna-navy focus:ring-luna-navy"
              />
              {t(`admin_collaborators.perm_${s}`)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
