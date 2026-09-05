import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { toast } from '@/components/ui/sonner';

export default function Signup() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('auth.forgot_sent'));
    navigate(urlFor('login', lang), { replace: true });
  };

  return (
    <>
      <SEO title={t('auth.signup_title')} noindex />
      <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <Link to={urlFor('home', lang)} className="inline-block mb-6">
            <img src="/brand/logo-on-white.jpeg" alt={t('brand.name')} className="h-10 w-auto" />
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
