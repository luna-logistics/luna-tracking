import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Instagram, Phone, Building2 } from 'lucide-react';
import { WaveDivider } from '@/components/WaveDivider';
import { urlFor } from '@/lib/url/routes';
import { useContent } from '@/contexts/SiteContentContext';
import { mapsUrl, telUrl } from '@/lib/contact-links';

/**
 * Dark navy footer — uses the on-navy logo variant. Wave divider on top
 * softens the transition from the last content section (which usually sits
 * on the light off-white ground). Contact block: agency address (flyer),
 * e-mail on the .com domain (the .be domain does not exist), optional
 * phone/WhatsApp filled by the admin. Bottom row carries the mandatory
 * Belgian mentions: company number + links to the three legal pages.
 */
export function Footer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const year = new Date().getFullYear();
  const email   = t('footer.email');
  const address = t('footer.address');
  const phone   = useContent('contact', 'phone', t('contact.phone')).trim();
  const companyName     = useContent('legal', 'company_name',      t('legal_identity.company_name'));
  const companyNumber   = useContent('legal', 'company_number',    t('legal_identity.company_number'));
  const vatNumber       = useContent('legal', 'vat_number',        t('legal_identity.vat_number'));
  const registeredOffice = useContent('legal', 'registered_office', t('legal_identity.registered_office'));

  const legalLinks = [
    { to: urlFor('about', lang),       label: t('nav.about') },
    { to: urlFor('legalNotice', lang), label: t('nav.legal_notice') },
    { to: urlFor('terms', lang),       label: t('nav.terms') },
    { to: urlFor('privacy', lang),     label: t('nav.privacy') },
  ];

  return (
    <footer className="mt-auto">
      {/* Wave transitions the off-white body ground INTO the navy footer */}
      <WaveDivider side="bottom" color="text-luna-ink" />
      <div className="bg-luna-ink text-[#B9C9E0]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-3">
          <div>
            {/* The horizontal logo is authored for a WHITE ground (dark-blue
                wordmark). On the navy footer its text would disappear —
                wrap it in a white pill so the contrast holds without
                needing a second color-flipped export. */}
            <div className="inline-flex rounded-xl bg-white p-3 shadow-sm mb-4">
              <img
                src="/brand/luna-logo-stacked.png"
                alt={t('brand.name')}
                className="w-[116px] h-auto block"
                width={116}
                height={140}
              />
            </div>
            <p className="text-sm text-white/80 leading-relaxed">{t('footer.about_body')}</p>
            <Link to={urlFor('about', lang)} className="mt-3 inline-block text-sm font-medium text-luna-aqua hover:text-white">
              {t('nav.about')} →
            </Link>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-luna-aqua mb-3">
              {t('footer.services_title')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link to={urlFor('tracking', lang)} className="text-white/80 hover:text-white">{t('nav.tracking')}</Link></li>
              <li><Link to={urlFor('shopAndShip', lang)} className="text-white/80 hover:text-white">{t('nav.shop_and_ship')}</Link></li>
              <li><Link to={urlFor('forwarding', lang)} className="text-white/80 hover:text-white">{t('nav.forwarding')}</Link></li>
              <li><Link to={urlFor('blogIndex', lang)} className="text-white/80 hover:text-white">{t('nav.blog')}</Link></li>
              <li><Link to={urlFor('pricing', lang)} className="text-white/80 hover:text-white">{t('nav.pricing')}</Link></li>
              <li><Link to={urlFor('rateCalculator', lang)} className="text-white/80 hover:text-white">{t('nav.calculator')}</Link></li>
              <li><Link to={urlFor('apiDocs', lang)} className="text-white/80 hover:text-white">{t('nav.api_docs')}</Link></li>
              <li><Link to={urlFor('contact', lang)} className="text-white/80 hover:text-white">{t('nav.contact')}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-luna-aqua mb-3">
              {t('footer.contact_title')}
            </h3>
            <ul className="space-y-2 text-sm text-white/85">
              {phone && (
                <li className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 shrink-0 text-luna-sky" aria-hidden="true" />
                  <a href={telUrl(phone)} className="hover:text-white">{phone}</a>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-luna-sky" aria-hidden="true" />
                <a href={`mailto:${email}`} className="hover:text-white break-all">
                  {email}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-luna-sky" aria-hidden="true" />
                <a href={mapsUrl(address)} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  {address}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Instagram className="h-4 w-4 mt-0.5 shrink-0 text-luna-sky" aria-hidden="true" />
                <a
                  href="https://www.instagram.com/Luna_TrackingLogistics/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  {t('footer.instagram_handle')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-luna-ink2">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-xs text-white/60 space-y-3">
            {/* Mandatory Belgian mentions (Code de droit économique XII.6):
                legal name, company number, VAT, registered office. */}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-luna-sky/70" aria-hidden="true" />
              <span className="text-white/75 font-medium">{companyName}</span>
              {companyNumber && (
                <span>· {t('footer.company_number_label')} {companyNumber}</span>
              )}
              {vatNumber && <span>· {t('footer.vat_label')} {vatNumber}</span>}
              {registeredOffice && (
                <span>· {t('footer.registered_office_label')} : {registeredOffice}</span>
              )}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span>{t('footer.legal', { year })}</span>
              <nav aria-label={t('footer.legal_title')} className="flex flex-wrap gap-x-4 gap-y-1">
                {legalLinks.map((l) => (
                  <Link key={l.to} to={l.to} className="hover:text-white underline-offset-2 hover:underline">
                    {l.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
