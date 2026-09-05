import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { urlFor } from '@/lib/url/routes';
import { useTranslation } from 'react-i18next';

/**
 * Gates a route on a signed-in session. While auth is still resolving (first
 * boot), paints a plain loading state — NEVER a redirect, or an in-flight
 * hydration would kick a signed-in user out to /connexion. Once resolved:
 *  - no user → redirect to the language-appropriate /connexion, preserving
 *    the intended path in state so the login page can send them back.
 *  - user → render children.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { i18n } = useTranslation();
  const location = useLocation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-luna-navy" aria-label="Loading" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to={urlFor('login', lang)} state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
