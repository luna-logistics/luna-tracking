import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { urlFor } from '@/lib/url/routes';
import type { AccountType } from '@/lib/profile';

/**
 * Two gates in one for the authenticated area:
 *
 *   1. OnboardingGate: redirect any user who hasn't yet picked an
 *      account_type to /onboarding. Otherwise the pro dashboard vs. the
 *      particulier dashboard would race against the initial profile
 *      fetch and flash the wrong shell.
 *
 *   2. AccountTypeGate (optional `expect`): send someone with the wrong
 *      account_type to *their* dashboard root. Prevents a particulier
 *      from opening /entreprise/facturation directly, and vice-versa.
 *
 * Loading is treated as "wait" — never a redirect — so a fresh session
 * that's still hydrating never bounces the user around.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { loading: authLoading, user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const location = useLocation();
  const lang = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (authLoading || (user && profileLoading)) return <>{children}</>;
  if (!user) return <>{children}</>;                             // let ProtectedRoute handle it

  const onboarded = !!profile?.onboarded_at && !!profile?.account_type;
  const onOnboarding = /\/onboarding$/.test(location.pathname);
  if (!onboarded && !onOnboarding) {
    return <Navigate to={urlFor('onboarding', lang)} replace />;
  }
  return <>{children}</>;
}

export function AccountTypeGate({
  expect, children,
}: { expect: AccountType; children: ReactNode }) {
  const { loading: authLoading, user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const lang = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (authLoading || (user && profileLoading)) return <>{children}</>;
  if (!user || !profile?.account_type) return <>{children}</>;   // Onboarding/Protected gates already handle this

  if (profile.account_type !== expect) {
    const target = profile.account_type === 'business'
      ? urlFor('businessDashboard', lang)
      : urlFor('account', lang);
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}
