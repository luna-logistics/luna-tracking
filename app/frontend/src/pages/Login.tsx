import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { toast } from '@/components/ui/sonner';
import { SocialAuthButtons } from '@/components/SocialAuthButtons';

export default function Login() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? urlFor('account', lang);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <>
      <SEO title={t('auth.login_title')} noindex />
      <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <Link to={urlFor('home', lang)} className="inline-block mb-6">
            <img src="/brand/logo-luna-navbar2.png" alt={t('brand.name')} className="h-10 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-luna-navy">{t('auth.login_title')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('auth.login_intro')}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">{t('auth.email_label')}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">{t('auth.password_label')}</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
              <div className="mt-1 text-right">
                <Link to={urlFor('forgotPassword', lang)} className="text-xs text-luna-blue hover:underline">
                  {t('auth.forgot_password')}
                </Link>
              </div>
            </div>
            <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
              {submitting ? t('common.loading') : t('auth.login_submit')}
            </Button>
          </form>

          <SocialAuthButtons />

          <p className="mt-6 text-sm text-center text-slate-600">
            {t('auth.no_account')}{' '}
            <Link to={urlFor('signup', lang)} className="text-luna-blue hover:underline font-medium">
              {t('auth.signup_link')}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
