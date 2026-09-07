import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Package, FileText, Users, Receipt,
  Wallet, BarChart3, Files, MapPin, UserCog, Settings, Key, Webhook,
  LogOut, ExternalLink, ChevronDown, Shield,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { urlFor } from '@/lib/url/routes';
import { cn } from '@/lib/utils';
import type { BusinessAction } from '@/lib/business-permissions';

/**
 * Sidebar shell for the business area. Same pattern as AdminShell —
 * sidebar on desktop, horizontal scroll on mobile. Every nav entry can
 * declare a permission (BusinessAction); the entry is hidden when the
 * current member's role does not carry it, so a viewer never even sees
 * the "Facturation" tab.
 *
 * When the user has NO business yet (fresh business account), redirects
 * to /entreprise/nouvelle so they create one before anything renders.
 */
export function BusinessShell() {
  const { t, i18n } = useTranslation();
  const { signOut, user, isAdmin } = useAuth();
  const location = useLocation();
  const { current, businesses, loading, can } = useBusiness();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  if (!loading && businesses.length === 0 && !location.pathname.endsWith('/nouvelle') && !location.pathname.endsWith('/new')) {
    return <Navigate to={lang === 'en' ? '/business/new' : '/entreprise/nouvelle'} replace />;
  }

  const items = ([
    { to: urlFor('businessDashboard', lang), label: t('business_nav.dashboard'),  icon: LayoutDashboard, permission: 'always' },
    { to: urlFor('businessShipments', lang), label: t('business_nav.shipments'),  icon: Package,         permission: 'shipments.read' },
    { to: urlFor('businessQuotes',    lang), label: t('business_nav.quotes'),     icon: FileText,        permission: 'quotes.read' },
    { to: urlFor('businessClients',   lang), label: t('business_nav.clients'),    icon: Users,           permission: 'clients.read' },
    { to: urlFor('businessInvoicing', lang), label: t('business_nav.invoicing'),  icon: Receipt,         permission: 'invoices.read' },
    { to: urlFor('businessExpenses',  lang), label: t('business_nav.expenses'),   icon: Wallet,          permission: 'expenses.read' },
    { to: urlFor('businessReports',   lang), label: t('business_nav.reports'),    icon: BarChart3,       permission: 'reports.read' },
    { to: urlFor('businessDocuments', lang), label: t('business_nav.documents'),  icon: Files,           permission: 'always' },
    { to: urlFor('businessAddresses', lang), label: t('business_nav.addresses'),  icon: MapPin,          permission: 'always' },
    { to: urlFor('businessTeam',      lang), label: t('business_nav.team'),       icon: UserCog,         permission: 'members.read' },
    { to: urlFor('businessSettings',  lang), label: t('business_nav.settings'),   icon: Settings,        permission: 'business.update' },
    { to: urlFor('businessApiKeys',   lang), label: t('business_nav.api_keys'),   icon: Key,             permission: 'business.update' },
    { to: urlFor('businessWebhooks',  lang), label: t('business_nav.webhooks'),   icon: Webhook,         permission: 'business.update' },
  ] as const).filter((it) => it.permission === 'always' || can(it.permission as BusinessAction));

  return (
    <div className="business-shell min-h-screen bg-background flex">
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-luna-navy-deep text-white">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="text-xs font-semibold uppercase tracking-wide text-luna-cyan-light">
            {t('business_shell.header')}
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
            <span className="text-sm text-white truncate">{current?.name ?? t('business_shell.no_business')}</span>
            {businesses.length > 1 && <ChevronDown className="h-3.5 w-3.5 text-white/50 shrink-0" />}
          </div>
          <div className="mt-2 text-xs text-white/50 truncate">{user?.email}</div>
        </div>

        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          <nav className="space-y-0.5" aria-label={t('business_shell.header')}>
            {items.map((it) => {
              const active = location.pathname === it.to;
              const Icon = it.icon;
              return (
                <Link
                  key={it.to} to={it.to}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                    active ? 'bg-luna-cyan text-luna-navy font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-3 pt-3 border-t border-white/10 space-y-0.5">
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-luna-cyan-light hover:bg-white/10 hover:text-white"
              >
                <Shield className="h-4 w-4" />
                {t('business_shell.admin_console')}
              </Link>
            )}
            <Link
              to={urlFor('home', lang)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              {t('admin.back_to_site')}
            </Link>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              {t('nav.logout')}
            </button>
            <div className="rounded-md bg-white/5 p-2 flex items-center justify-between mt-2">
              <span className="text-xs text-white/60">{t('admin.language')}</span>
              <LanguageSwitcher variant="dark" />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top-bar + horizontal nav */}
      <div className="flex-1 min-w-0">
        <div className="lg:hidden bg-luna-navy-deep text-white px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold truncate">{current?.name ?? t('business_shell.header')}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="dark" />
            {isAdmin && (
              <Link to="/admin" className="text-xs text-luna-cyan-light hover:text-white inline-flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Admin
              </Link>
            )}
            <Link to={urlFor('home', lang)} className="text-xs text-white/80 hover:text-white inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              {t('admin.back_to_site_short')}
            </Link>
            <button onClick={() => signOut()} className="text-xs text-white/80">
              {t('nav.logout')}
            </button>
          </div>
        </div>
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex gap-3 overflow-x-auto">
          {items.map((it) => {
            const active = location.pathname === it.to;
            return (
              <Link
                key={it.to} to={it.to}
                className={cn(
                  'text-sm whitespace-nowrap rounded-md px-3 py-1',
                  active ? 'bg-luna-navy text-white' : 'text-luna-navy hover:bg-luna-navy/10',
                )}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
