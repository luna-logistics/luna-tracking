import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Instagram } from 'lucide-react';
import { WaveDivider } from '@/components/WaveDivider';
import { urlFor } from '@/lib/url/routes';

/**
 * Dark navy footer — uses the on-navy logo variant. Wave divider on top
 * softens the transition from the last content section (which usually sits
 * on the light off-white ground). Contact block reproduces the details from
 * the brand flyer verbatim.
 */
export function Footer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto">
      {/* Wave transitions the off-white body ground INTO the navy footer */}
      <WaveDivider side="bottom" color="text-luna-navy-deep" />
      <div className="bg-luna-navy-deep text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-3">
          <div>
            <img
              src="/brand/logo-on-navy.jpeg"
              alt={t('brand.name')}
              className="h-12 w-auto mb-4"
              width={180}
              height={48}
            />
            <p className="text-sm text-white/80 leading-relaxed">{t('footer.about_body')}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-luna-cyan-light mb-3">
              {t('footer.services_title')}
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link to={urlFor('tracking', lang)} className="text-white/80 hover:text-white">{t('nav.tracking')}</Link></li>
              <li><Link to={urlFor('pricing', lang)} className="text-white/80 hover:text-white">{t('nav.pricing')}</Link></li>
              <li><Link to={urlFor('contact', lang)} className="text-white/80 hover:text-white">{t('nav.contact')}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-luna-cyan-light mb-3">
              {t('footer.contact_title')}
            </h3>
            <ul className="space-y-2 text-sm text-white/85">
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-luna-cyan" aria-hidden="true" />
                <a href="mailto:info@lunatrackinglogistics.be" className="hover:text-white">
                  {t('footer.email')}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-luna-cyan" aria-hidden="true" />
                <span>{t('footer.address')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Instagram className="h-4 w-4 mt-0.5 shrink-0 text-luna-cyan" aria-hidden="true" />
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
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 text-xs text-white/60">
            {t('footer.legal', { year })}
          </div>
        </div>
      </div>
    </footer>
  );
}
