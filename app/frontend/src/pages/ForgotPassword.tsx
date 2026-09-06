import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { toast } from '@/components/ui/sonner';

export default function ForgotPassword() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <>
      <SEO title={t('auth.forgot_title')} noindex />
      <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <Link to={urlFor('home', lang)} className="inline-block mb-6">
            <img src="/brand/logo-luna-navbar2.png" alt={t('brand.name')} className="h-10 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-luna-navy">{t('auth.forgot_title')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('auth.forgot_intro')}</p>

          {sent ? (
            <p className="mt-6 rounded-md bg-luna-cyan/10 border border-luna-cyan/30 px-4 py-3 text-sm text-luna-navy">
              {t('auth.forgot_sent')}
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="email">{t('auth.email_label')}</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
              </div>
              <Button type="submit" variant="navy" className="w-full" disabled={submitting}>
                {submitting ? t('common.loading') : t('auth.forgot_submit')}
              </Button>
            </form>
          )}

          <p className="mt-6 text-sm text-center">
            <Link to={urlFor('login', lang)} className="text-luna-blue hover:underline">
              ← {t('auth.login_link')}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
