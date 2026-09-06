import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { fetchProfile } from '@/lib/profile';
import { SEO } from '@/components/SEO';

/**
 * Landing page for the token fragment Supabase appends to the URL after
 * an OAuth flow, magic-link click, or email-confirmation click:
 *   /auth/callback#access_token=…&refresh_token=…&type=signup
 *
 * `supabase-js` is configured with detectSessionInUrl:true, so it
 * establishes the session automatically on any page load — we still
 * wait a beat for that to finish, then route based on the profile:
 *
 *   * no session       → back to /login
 *   * not onboarded    → /bienvenue (OnboardingGate would do the same
 *                        from anywhere, but doing it here avoids a
 *                        flash of the wrong dashboard)
 *   * business account → /entreprise
 *   * individual       → /compte
 */
export default function AuthCallback() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 250));
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        navigate(urlFor('login', lang), { replace: true });
        return;
      }
      const profile = await fetchProfile(data.session.user.id);
      if (cancelled) return;
      if (!profile?.onboarded_at || !profile?.account_type) {
        navigate(urlFor('onboarding', lang), { replace: true });
        return;
      }
      navigate(
        profile.account_type === 'business'
          ? urlFor('businessDashboard', lang)
          : urlFor('account', lang),
        { replace: true },
      );
    })();
    return () => { cancelled = true; };
  }, [navigate, lang]);

  return (
    <>
      <SEO title={t('common.loading')} noindex />
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-luna-navy" aria-label={t('common.loading')} />
      </div>
    </>
  );
}
