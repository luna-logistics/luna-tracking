import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Mail, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  fetchBusinessMembers, fetchInvitations, inviteMember, cancelInvitation,
  updateMemberRole, removeMember,
  INVITABLE_ROLES, BUSINESS_ROLES,
  type BusinessMember, type BusinessInvitation, type BusinessRole, type InvitableRole,
} from '@/lib/businesses';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Team page. Lists current members + pending invitations. An owner or
 * admin can invite by email, change roles, and remove members. The
 * owner row can only be touched by the owner themselves (leave / role
 * changes) — enforced by both the frontend gates and RLS.
 */
export default function BusinessTeam() {
  const { t } = useTranslation();
  const { current, role, can, refresh: refreshBiz } = useBusiness();
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [invites, setInvites] = useState<BusinessInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!current) return;
    setLoading(true);
    const [m, i] = await Promise.all([fetchBusinessMembers(current.id), fetchInvitations(current.id)]);
    setMembers(m); setInvites(i);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current?.id]);

  if (!current) return null;

  const canInvite = can('members.invite');
  const canManage = can('members.update_role');
  const canRemove = can('members.remove');

  return (
    <>
      <SEO title={t('business_team.meta_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('business_team.title')}</h1>
      <p className="mt-2 text-slate-600 max-w-2xl">{t('business_team.intro')}</p>

      {canInvite && (
        <InviteForm businessId={current.id} onInvited={async () => { await reload(); }} />
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-luna-navy mb-3">{t('business_team.members_title')}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-luna-navy">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">{t('business_team.col_user')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_team.col_role')}</th>
                <th className="text-left px-4 py-3 font-semibold">{t('business_team.col_joined')}</th>
                <th className="text-right px-4 py-3 font-semibold">{t('business_team.col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>}
              {!loading && members.map((m) => (
                <MemberRow key={m.id}
                  member={m}
                  currentRole={role}
                  canManage={canManage && m.role !== 'owner'}
                  canRemove={canRemove && m.role !== 'owner'}
                  onChanged={reload}
                  onBusinessChanged={refreshBiz}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {invites.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-luna-navy mb-3">{t('business_team.invites_title')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-luna-navy">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t('business_team.col_email')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('business_team.col_role')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('business_team.col_sent')}</th>
                  <th className="text-right px-4 py-3 font-semibold">{t('business_team.col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invites.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-luna-navy"><Mail className="h-3.5 w-3.5" />{inv.email}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t(`business_team.role_${inv.role}`)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canInvite && (
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={async () => {
                          try { await cancelInvitation(inv.id); await reload(); }
                          catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('business_team.cancel_invite')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function InviteForm({ businessId, onInvited }: { businessId: string; onInvited: () => Promise<void> }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('viewer');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-6 rounded-2xl border-2 border-luna-blue/30 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setBusy(true);
        try {
          await inviteMember(businessId, email, role);
          toast.success(t('business_team.invite_sent'));
          setEmail(''); setRole('viewer');
          await onInvited();
        } catch (err) {
          toast.error(errorMessage(err, t('common.error_generic')));
        } finally { setBusy(false); }
      }}
    >
      <Label className="text-luna-navy">{t('business_team.invite_title')}</Label>
      <p className="mt-1 text-xs text-slate-500">{t('business_team.invite_hint')}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input type="email" required placeholder="collaborateur@exemple.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={(v) => setRole(v as InvitableRole)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{t(`business_team.role_${r}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" variant="navy" disabled={busy || !email.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {t('business_team.invite_submit')}
        </Button>
      </div>
    </form>
  );
}

function MemberRow({
  member, currentRole, canManage, canRemove, onChanged, onBusinessChanged,
}: {
  member: BusinessMember;
  currentRole: BusinessRole | null;
  canManage: boolean;
  canRemove: boolean;
  onChanged: () => Promise<void>;
  onBusinessChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  return (
    <tr>
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{member.user_id.slice(0, 8)}…</td>
      <td className="px-4 py-3">
        {canManage ? (
          <Select value={member.role} onValueChange={async (v) => {
            setBusy(true);
            try { await updateMemberRole(member.id, v as BusinessRole); await onChanged(); await onBusinessChanged(); }
            catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
            finally { setBusy(false); }
          }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUSINESS_ROLES.filter((r) => r !== 'owner').map((r) => (
                <SelectItem key={r} value={r}>{t(`business_team.role_${r}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
            member.role === 'owner' ? 'bg-luna-cyan/20 text-luna-navy' : 'bg-slate-100 text-slate-700',
          )}>{t(`business_team.role_${member.role}`)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{new Date(member.joined_at).toLocaleDateString()}</td>
      <td className="px-4 py-3 text-right">
        {canRemove && (
          <Button size="sm" variant="ghost" disabled={busy} className="text-red-600 hover:bg-red-50" onClick={async () => {
            if (!confirm(t('business_team.remove_confirm'))) return;
            setBusy(true);
            try { await removeMember(member.id); await onChanged(); }
            catch (err) { toast.error(errorMessage(err, t('common.error_generic'))); }
            finally { setBusy(false); }
          }}>
            <Trash2 className="h-3.5 w-3.5" />
            {t('business_team.remove')}
          </Button>
        )}
        {member.role === 'owner' && currentRole === 'owner' && (
          <span className="text-xs text-slate-500 italic">{t('business_team.you_are_owner')}</span>
        )}
      </td>
    </tr>
  );
}
