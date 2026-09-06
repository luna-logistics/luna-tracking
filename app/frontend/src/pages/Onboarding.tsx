import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Building2, ArrowRight, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { setAccountType, type AccountType } from '@/lib/profile';
import { urlFor } from '@/lib/url/routes';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * First-run experience. Fresh signup lands here; two big cards, one
 * click writes the choice to profiles.account_type and routes to the
 * corresponding dashboard root. Meant to be legible in FR + EN with
 * zero friction — no forms, no fields, just a pick.
 */
export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh } = useProfile();
  const [busy, setBusy] = useState<AccountType | null>(null);

  const pick = async (type: AccountType) => {
    if (!user) return;
    setBusy(type);
    try {
      await setAccountType(user.id, type);
      await refresh();
      navigate(type === 'business' ? urlFor('businessDashboard', lang) : urlFor('account', lang), { replace: true });
    } catch (err) {
      console.error('[onboarding] setAccountType failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
      setBusy(null);
    }
  };

  return (
    <>
      <SEO title={t('onboarding.meta_title')} noindex />
      <section className="min-h-[80vh] py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-luna-navy">{t('onboarding.title')}</h1>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto">{t('onboarding.subtitle')}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card
              icon={User}
              title={t('onboarding.individual_title')}
              body={t('onboarding.individual_body')}
              cta={t('onboarding.individual_cta')}
              onPick={() => pick('individual')}
              busy={busy === 'individual'}
              disabled={busy !== null}
            />
            <Card
              icon={Building2}
              title={t('onboarding.business_title')}
              body={t('onboarding.business_body')}
              cta={t('onboarding.business_cta')}
              onPick={() => pick('business')}
              busy={busy === 'business'}
              disabled={busy !== null}
              featured
            />
          </div>

          <p className="mt-8 text-xs text-center text-slate-500">
            {t('onboarding.change_later')}
          </p>
        </div>
      </section>
    </>
  );
}

function Card({
  icon: Icon, title, body, cta, onPick, busy, disabled, featured,
}: {
  icon: typeof User;
  title: string;
  body: string;
  cta: string;
  onPick: () => void;
  busy: boolean;
  disabled: boolean;
  featured?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cn(
        'group text-left w-full rounded-2xl border-2 p-8 transition-all',
        'hover:border-luna-cyan hover:shadow-lg hover:-translate-y-0.5',
        featured
          ? 'border-luna-blue/60 bg-luna-navy/[0.02]'
          : 'border-slate-200 bg-white',
        disabled && !busy && 'opacity-50 cursor-not-allowed',
      )}
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-luna-cyan/20 text-luna-navy mb-4">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-bold text-luna-navy">{title}</h2>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
      <div className="mt-6 inline-flex items-center gap-2">
        <Button asChild variant={featured ? 'navy' : 'outline'} size="lg" className="pointer-events-none">
          <span>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : cta}
            {!busy && <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />}
          </span>
        </Button>
      </div>
    </button>
  );
}
