import { useTranslation } from 'react-i18next';
import { Sparkles, type LucideIcon } from 'lucide-react';
import { SEO } from '@/components/SEO';

/**
 * Shared shell for every business module we haven't fully built yet
 * (Expéditions, Devis, Clients, Facturation, Dépenses, Rapports,
 * Documents, Adresses). Ships the sidebar entry + dedicated page so the
 * URLs work and the navigation is coherent; the real content lands in
 * phases 3–8.
 */
export function BusinessPlaceholder({
  icon: Icon, titleKey, bodyKey,
}: {
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SEO title={t(titleKey)} noindex />
      <h1 className="text-2xl font-bold text-luna-navy flex items-center gap-2">
        <Icon className="h-6 w-6" /> {t(titleKey)}
      </h1>
      <div className="mt-6 rounded-2xl border-2 border-dashed border-luna-blue/30 bg-white p-8 text-center max-w-2xl">
        <Sparkles className="h-6 w-6 text-luna-blue mx-auto" aria-hidden="true" />
        <p className="mt-3 text-slate-700">{t(bodyKey)}</p>
        <p className="mt-2 text-xs text-slate-500">{t('business_placeholder.coming_soon')}</p>
      </div>
    </>
  );
}
