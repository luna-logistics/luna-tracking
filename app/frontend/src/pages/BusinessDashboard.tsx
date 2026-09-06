import { useTranslation } from 'react-i18next';
import { Building2, Sparkles } from 'lucide-react';
import { SEO } from '@/components/SEO';

/**
 * Placeholder pro dashboard. Phase 0 delivers the routing + gating so
 * a business account lands here after onboarding. Phases 2–8 will fill
 * this shell with the real KPIs, quick actions, and modules (CRM,
 * quotes, invoices, expenses, reports, ...).
 */
export default function BusinessDashboard() {
  const { t } = useTranslation();
  return (
    <>
      <SEO title={t('business_dashboard.meta_title')} noindex />
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-luna-cyan/20 text-luna-navy mb-4">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold text-luna-navy">{t('business_dashboard.welcome_title')}</h1>
          <p className="mt-3 text-slate-600">{t('business_dashboard.welcome_body')}</p>

          <div className="mt-8 rounded-2xl border-2 border-luna-blue/30 bg-white p-8 text-left shadow-sm">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-luna-blue mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-luna-navy">{t('business_dashboard.coming_title')}</h2>
                <ul className="mt-3 space-y-2 text-sm text-slate-700 list-disc list-inside">
                  <li>{t('business_dashboard.coming_kpi')}</li>
                  <li>{t('business_dashboard.coming_shipments')}</li>
                  <li>{t('business_dashboard.coming_clients')}</li>
                  <li>{t('business_dashboard.coming_quotes')}</li>
                  <li>{t('business_dashboard.coming_invoices')}</li>
                  <li>{t('business_dashboard.coming_expenses')}</li>
                  <li>{t('business_dashboard.coming_reports')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
