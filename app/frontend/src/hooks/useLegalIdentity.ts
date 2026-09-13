import { useTranslation } from 'react-i18next';
import { useContent } from '@/contexts/SiteContentContext';

/**
 * Company identity shared by the legal pages, the About page and the
 * footer. Defaults ship in i18n (`legal_identity.*`); the admin can
 * override each value in /admin/contenus -> Informations legales.
 */

/** Bump when the shipped text changes materially. */
export const LEGAL_UPDATED = '2026-09-13';

export function useLegalIdentity() {
  const { t } = useTranslation();
  return {
    companyName:      useContent('legal', 'company_name',      t('legal_identity.company_name')),
    legalForm:        useContent('legal', 'legal_form',        t('legal_identity.legal_form')),
    companyNumber:    useContent('legal', 'company_number',    t('legal_identity.company_number')),
    vatNumber:        useContent('legal', 'vat_number',        t('legal_identity.vat_number')),
    registeredOffice: useContent('legal', 'registered_office', t('legal_identity.registered_office')),
    publisher:        useContent('legal', 'publisher',         t('legal_identity.publisher')),
    agency:           t('footer.address'),
    email:            t('footer.email'),
    phone:            useContent('contact', 'phone', t('contact.phone')),
  };
}

