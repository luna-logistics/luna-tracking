import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { urlFor } from '@/lib/url/routes';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

/**
 * Wraps admin routes. Order of decisions:
 *   1. Auth still loading → paint the loading state (never redirect mid-hydration).
 *   2. No session          → send to /connexion, preserve the intended path.
 *   3. Session but admin lookup still in flight → loading state.
 *   4. Session but NOT in admin_users → paint an "access denied" card.
 *      Do NOT silently redirect: a redirect hides why the URL doesn't work.
 *   5. Admin → render children.
 *
 * RLS is the real security boundary; this is UX. A non-admin who bypasses the
 * gate still can't write anything — Postgres refuses.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin, adminLoading } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  if (loading || (user && adminLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-luna-navy" aria-label="Loading" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to={urlFor('login', lang)} state={{ from: location.pathname }} replace />;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-2xl border-2 border-luna-navy/20 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="h-10 w-10 text-luna-navy mx-auto" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-luna-navy">{t('admin_gate.title')}</h1>
          <p className="mt-2 text-sm text-slate-700">{t('admin_gate.body')}</p>
          <Button asChild variant="navy" className="mt-5">
            <Link to={urlFor('home', lang)}>{t('admin_gate.home')}</Link>
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
