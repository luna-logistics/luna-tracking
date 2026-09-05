import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, FileText, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { urlFor } from '@/lib/url/routes';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';

/**
 * Authenticated client area shell — same Navbar/Footer as public pages, with
 * a sub-nav for the account sections. Kept simple: no dedicated dark sidebar,
 * so a signed-in user's chrome still reads as the main site.
 */
export function AccountShell() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const location = useLocation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  const items = [
    { to: urlFor('account', lang), label: t('account.sidebar_shipments'), icon: Package },
    { to: urlFor('accountOrders', lang), label: t('account.sidebar_orders'), icon: Clock },
    { to: urlFor('accountInvoices', lang), label: t('account.sidebar_invoices'), icon: FileText },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          {items.map((it) => {
            const active = location.pathname === it.to;
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
                  active
                    ? 'bg-luna-navy text-white font-medium'
                    : 'text-luna-navy hover:bg-luna-navy/10'
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-luna-navy"
            >
              <LogOut className="h-4 w-4" />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </div>
      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
