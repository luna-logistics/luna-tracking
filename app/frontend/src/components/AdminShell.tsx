import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, MapPin, Package, ShoppingCart, Boxes,
  KeyRound, FileText, Newspaper, UserCog, LogOut, ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { urlFor } from '@/lib/url/routes';
import { useAdminCan } from '@/lib/admin-permissions';
import type { AdminPermission } from '@/lib/admin-permissions';
import { cn } from '@/lib/utils';

/**
 * Admin sidebar shell. Filters entries by the current admin's per-section
 * permissions; a section the user can't touch simply doesn't appear.
 * Dashboard (/admin) is always visible so a permission-less collaborator
 * still has a landing page.
 */
export function AdminShell() {
  const { t, i18n } = useTranslation();
  const { signOut, user } = useAuth();
  const location = useLocation();
  const can = useAdminCan();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  const items: Array<{ to: string; label: string; icon: typeof LayoutDashboard; permission: AdminPermission | 'always' }> = ([
    { to: '/admin',                        label: t('admin.sidebar_dashboard'),       icon: LayoutDashboard, permission: 'always' },
    { to: '/admin/destinations',           label: t('admin.sidebar_cities'),          icon: MapPin,          permission: 'destinations' },
    { to: '/admin/produits',               label: t('admin.sidebar_products'),        icon: Package,         permission: 'products' },
    { to: '/admin/commandes',              label: t('admin.sidebar_orders'),          icon: ShoppingCart,    permission: 'orders' },
    { to: '/admin/demandes-reexpedition',  label: t('admin.sidebar_forwarding'),      icon: Boxes,           permission: 'forwarding' },
    { to: '/admin/auth-sociale',           label: t('admin.sidebar_auth_providers'),  icon: KeyRound,        permission: 'auth_providers' },
    { to: '/admin/contenus',               label: t('admin.sidebar_content'),         icon: FileText,        permission: 'content' },
    { to: '/admin/blog',                   label: t('admin.sidebar_blog'),            icon: Newspaper,       permission: 'blog' },
    { to: '/admin/collaborateurs',         label: t('admin.sidebar_collaborators'),   icon: UserCog,         permission: 'admins' },
  ] as const).filter((it) => it.permission === 'always' || can(it.permission as AdminPermission)) as Array<{ to: string; label: string; icon: typeof LayoutDashboard; permission: AdminPermission | 'always' }>;

  return (
    <div className="admin-shell min-h-screen bg-background flex">
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-luna-navy-deep text-white">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="text-sm font-semibold uppercase tracking-wide text-luna-cyan-light">
            {t('nav.admin')}
          </div>
          <div className="text-xs text-white/60 mt-1 truncate">{user?.email}</div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const active = location.pathname === it.to;
            const Icon = it.icon;
            return (
              <Link
                key={it.to} to={it.to}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                  active ? 'bg-luna-cyan text-luna-navy font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10 space-y-2">
          <Link
            to={urlFor('home', lang)}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
            {t('admin.back_to_site')}
          </Link>
          <div className="rounded-md bg-white/5 p-2 flex items-center justify-between">
            <span className="text-xs text-white/60">{t('admin.language')}</span>
            <LanguageSwitcher variant="dark" />
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Mobile chrome — same three actions surfaced */}
      <div className="flex-1 min-w-0">
        <div className="md:hidden bg-luna-navy-deep text-white px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t('nav.admin')}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="dark" />
            <Link to={urlFor('home', lang)} className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              {t('admin.back_to_site_short')}
            </Link>
            <button onClick={() => signOut()} className="text-xs text-white/80">
              {t('nav.logout')}
            </button>
          </div>
        </div>
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex gap-3 overflow-x-auto">
          {items.map((it) => {
            const active = location.pathname === it.to;
            return (
              <Link
                key={it.to} to={it.to}
                className={cn(
                  'text-sm whitespace-nowrap rounded-md px-3 py-1',
                  active ? 'bg-luna-navy text-white' : 'text-luna-navy hover:bg-luna-navy/10'
                )}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
        <main className="p-4 sm:p-8 max-w-5xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
