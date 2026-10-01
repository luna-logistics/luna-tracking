import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/PasswordInput';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { toast } from '@/components/ui/sonner';

const MIN_LENGTH = 8; // same minimum as the signup form

/**
 * Step 2 of "mot de passe oublié": the visitor arrives from the e-mailed link
 * (Supabase has already opened a short-lived recovery session from it) and
 * chooses a new password. Without a session the link is expired or was already
 * used, so we say so and offer a fresh one — never the dashboard.
 */
export default function ResetPassword() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    // getSession() waits for supabase-js to finish reading the link's token.
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setHasSession(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      if (s) setHasSession(true);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) { setError(t('auth.reset_too_short', { min: MIN_LENGTH })); return; }
    if (password !== confirm) { setError(t('auth.reset_mismatch')); return; }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (err) { setError(t('auth.reset_error', { message: err.message })); return; }
    toast.success(t('auth.reset_done'));
    // /auth/callback routes by role and profile (admin, onboarding, dashboard).
    navigate('/auth/callback', { replace: true });
  };

  return (
    <>
      <SEO title={t('auth.reset_title')} noindex />
      <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <Link to={urlFor('home', lang)} className="inline-block mb-6">
            <img src="/brand/logo-luna-navbar2.png" alt={t('brand.name')} className="h-10 w-auto" />
          </Link>

          {!ready ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-luna-navy" aria-label={t('common.loading')} />
            </div>
          ) : hasSession ? (
            <>
              <h1 className="text-2xl font-bold text-luna-navy">{t('auth.reset_title')}</h1>
              <p className="mt-2 text-sm text-slate-600">{t('auth.reset_intro')}</p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="new-password">{t('auth.reset_password_label')}</Label>
                  <div className="mt-1.5">
                    <PasswordInput id="new-password" autoComplete="new-password" minLength={MIN_LENGTH} required autoFocus
                      value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t('auth.reset_hint', { min: MIN_LENGTH })}</p>
                </div>
                <div>
                  <Label htmlFor="confirm-password">{t('auth.reset_confirm_label')}</Label>
                  <div className="mt-1.5">
                    <PasswordInput id="confirm-password" autoComplete="new-password" minLength={MIN_LENGTH} required
                      value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
                  {submitting ? t('common.loading') : t('auth.reset_submit')}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-luna-navy">{t('auth.reset_expired_title')}</h1>
              <p className="mt-2 text-sm text-slate-600">{t('auth.reset_expired_body')}</p>
              <Button asChild variant="navy" className="mt-6 w-full">
                <Link to={urlFor('forgotPassword', lang)}>{t('auth.reset_expired_cta')}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
