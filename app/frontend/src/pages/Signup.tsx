import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { toast } from '@/components/ui/sonner';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';
import { errorMessage } from '@/lib/errors';

/**
 * Signup with two possible outcomes:
 *
 * 1. Supabase project has "Confirm email" ON (default). signUp() returns
 *    { session: null, user }. We can NOT log the user in yet — they
 *    must click the verification link in their inbox first. We show a
 *    dedicated "check your inbox" screen instead of dumping them on
 *    /login with a vague toast.
 *
 * 2. Confirm-email OFF. signUp() returns { session, user } — the user
 *    is already logged in. We route to /bienvenue so OnboardingGate can
 *    ask them to pick their account type.
 *
 * Either way, `emailRedirectTo` sends the confirmation link back to
 * /auth/callback (allowlisted in the Supabase URL Configuration).
 * AuthCallback then picks up the session and routes based on onboarding
 * state.
 */
export default function Signup() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { emailRedirectTo: redirectTo },
    });
    setSubmitting(false);
    if (error) { toast.error(errorMessage(error, t('common.error_generic'))); return; }
    if (data.session) {
      // Auto-confirmed → straight to onboarding.
      navigate(urlFor('onboarding', lang), { replace: true });
      return;
    }
    // Email confirmation required — surface a clear next-step screen
    // instead of bouncing to /login.
    setSentTo(email);
  };

  if (sentTo) {
    return (
      <>
        <SEO title={t('auth.signup_check_inbox_title')} noindex />
        <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
            <Link to={urlFor('home', lang)} className="inline-block mb-6">
              <img src="/brand/logo-luna-navbar2.png" alt={t('brand.name')} className="h-10 w-auto" />
            </Link>
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-luna-cyan/20 text-luna-navy mb-4">
              <MailCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-luna-navy">{t('auth.signup_check_inbox_title')}</h1>
            <p className="mt-3 text-slate-600">
              {t('auth.signup_check_inbox_body')}
            </p>
            <p className="mt-2 font-mono text-sm text-luna-navy break-all">{sentTo}</p>
            <p className="mt-4 text-xs text-slate-500">
              {t('auth.signup_check_inbox_hint')}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button asChild variant="navy" className="w-full">
                <Link to={urlFor('login', lang)}>{t('auth.signup_back_to_login')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title={t('auth.signup_title')} noindex />
      <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <Link to={urlFor('home', lang)} className="inline-block mb-6">
            <img src="/brand/logo-luna-navbar2.png" alt={t('brand.name')} className="h-10 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-luna-navy">{t('auth.signup_title')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('auth.signup_intro')}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">{t('auth.email_label')}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">{t('auth.password_label')}</Label>
              <Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
            </div>
            <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
              {submitting ? t('common.loading') : t('auth.signup_submit')}
            </Button>
          </form>

          <SocialAuthButtons />

          <p className="mt-6 text-sm text-center text-slate-600">
            {t('auth.have_account')}{' '}
            <Link to={urlFor('login', lang)} className="text-luna-blue hover:underline font-medium">
              {t('auth.login_link')}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
