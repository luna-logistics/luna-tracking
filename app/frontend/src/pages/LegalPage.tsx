import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Ed } from '@/components/Ed';
import { useContent } from '@/contexts/SiteContentContext';
import { useEditMode } from '@/contexts/EditModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLegalIdentity, LEGAL_UPDATED } from '@/hooks/useLegalIdentity';

/**
 * Legal pages — mentions légales, conditions générales, confidentialité.
 *
 * One component, three `kind`s. Text ships in i18n (`legal_<kind>.*`)
 * and every heading / body is admin-editable in place (`<Ed>`) under the
 * page key `legal_<kind>`, so the founders can amend a clause without a
 * deploy. Company identity (BCE, VAT, seat, publisher) is shared across
 * the three pages + the footer via the `legal` content page.
 */

export type LegalKind = 'notice' | 'terms' | 'privacy';

const MAX_SECTIONS = 12;

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const group = `legal_${kind}`;
  const page = group;
  const { editMode } = useEditMode();
  const { isAdmin } = useAuth();
  const showMissing = editMode && isAdmin;

  const metaTitle       = useContent(page, 'meta_title',       t(`${group}.meta_title`));
  const metaDescription = useContent(page, 'meta_description', t(`${group}.meta_description`));
  const pageTitle       = useContent(page, 'page_title',       t(`${group}.page_title`));
  const pageIntro       = useContent(page, 'page_intro',       t(`${group}.page_intro`));
  const id = useLegalIdentity();

  const sections: number[] = [];
  for (let i = 1; i <= MAX_SECTIONS; i++) {
    if (i18n.exists(`${group}.s${i}_title`)) sections.push(i);
  }

  const updated = new Date(LEGAL_UPDATED).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-BE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const identityRows: { key: string; label: string; value: string }[] = [
    { key: 'company_name',      label: t('legal_common.company_name'),      value: id.companyName },
    { key: 'legal_form',        label: t('legal_common.legal_form'),        value: id.legalForm },
    { key: 'company_number',    label: t('legal_common.company_number'),    value: id.companyNumber },
    { key: 'vat_number',        label: t('legal_common.vat_number'),        value: id.vatNumber },
    { key: 'registered_office', label: t('legal_common.registered_office'), value: id.registeredOffice },
    { key: 'agency',            label: t('legal_common.agency'),            value: id.agency },
    { key: 'email',             label: t('legal_common.email'),             value: id.email },
    { key: 'phone',             label: t('legal_common.phone'),             value: id.phone },
    { key: 'publisher',         label: t('legal_common.publisher'),         value: id.publisher },
  ];

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Ed page={page} field="page_title" as="h1" className="text-3xl font-bold text-luna-navy block">
            {pageTitle}
          </Ed>
          <p className="mt-2 text-xs text-slate-500">{t('legal_common.last_updated', { date: updated })}</p>
          <Ed page={page} field="page_intro" as="p" multiline className="mt-4 text-slate-600 block">
            {pageIntro}
          </Ed>

          {/* Company identity — shared block, edited once in /admin/contenus. */}
          <div className="mt-8 rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-luna-navy">{t('legal_common.identity_title')}</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr] text-sm">
              {identityRows.map((r) => {
                if (!r.value && !showMissing) return null;
                return (
                  <div key={r.key} className="contents">
                    <dt className="text-slate-500">{r.label}</dt>
                    <dd className="text-luna-navy font-medium break-words">
                      {r.key === 'email' ? (
                        <a href={`mailto:${r.value}`} className="text-luna-blue hover:underline">{r.value}</a>
                      ) : r.value || (
                        <span className="text-amber-700 font-normal italic">{t('legal_common.missing_hint')}</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <div className="mt-10 space-y-8">
            {sections.map((i) => (
              <section key={i}>
                <Ed page={page} field={`s${i}_title`} as="h2" className="text-xl font-semibold text-luna-navy block">
                  {t(`${group}.s${i}_title`)}
                </Ed>
                <Ed page={page} field={`s${i}_body`} as="div" multiline markdown className="mt-2 text-[15px] text-slate-700 leading-relaxed block">
                  {t(`${group}.s${i}_body`)}
                </Ed>
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
