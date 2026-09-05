import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { urlFor } from '@/lib/url/routes';
import { SEO } from '@/components/SEO';

/**
 * OAuth / magic-link callback. Supabase-js parses the URL fragment and
 * establishes the session automatically (detectSessionInUrl:true on the
 * client), so this page just polls once, then redirects.
 */
export default function AuthCallback() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Small delay to let supabase-js finish reading the URL fragment.
      await new Promise((r) => setTimeout(r, 200));
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      navigate(data.session ? urlFor('account', lang) : urlFor('login', lang), { replace: true });
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
