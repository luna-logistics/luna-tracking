import { useTranslation } from 'react-i18next';
import { Mail, MapPin, Instagram, Clock, Phone, MessageCircle, ExternalLink } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { IconCircle } from '@/components/IconCircle';
import { useContent } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';
import { Block } from '@/components/Block';
import { mapsUrl, whatsappUrl, telUrl } from '@/lib/contact-links';

export default function Contact() {
  const { t } = useTranslation();
  const metaTitle       = useContent('contact', 'meta_title',       t('contact.meta_title'));
  const metaDescription = useContent('contact', 'meta_description', t('contact.meta_description'));
  const pageTitle       = useContent('contact', 'page_title',       t('contact.page_title'));
  const pageIntro       = useContent('contact', 'page_intro',       t('contact.page_intro'));
  const hoursBody       = useContent('contact', 'hours_body',       t('contact.hours_body'));
  const emailTitle      = useContent('contact', 'email_title',      t('contact.email_title'));
  const addressTitle    = useContent('contact', 'address_title',    t('contact.address_title'));
  const instagramTitle  = useContent('contact', 'instagram_title',  t('contact.instagram_title'));
  const hoursTitle      = useContent('contact', 'hours_title',      t('contact.hours_title'));
  const phoneTitle      = useContent('contact', 'phone_title',      t('contact.phone_title'));
  // Admin fills the number in /admin/contenus → Contact. Empty = card hidden.
  const phone           = useContent('contact', 'phone',            t('contact.phone')).trim();
  const whatsapp        = useContent('contact', 'whatsapp',         t('contact.whatsapp')).trim();
  const addressNote     = useContent('contact', 'address_note',     t('contact.address_note'));
  const email           = t('footer.email');
  const address         = t('footer.address');

  const blocks = [
    ...(phone ? [{
      key: 'phone', icon: Phone, titleKey: 'phone_title', title: phoneTitle,
      body: (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href={telUrl(phone)} className="text-luna-blue hover:underline font-medium">{phone}</a>
          {whatsapp && (
            <a href={whatsappUrl(whatsapp)} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {t('contact.phone_whatsapp_cta')}
            </a>
          )}
        </div>
      ),
    }] : []),
    { key: 'email',     icon: Mail,      titleKey: 'email_title',     title: emailTitle,
      body: (
        <a href={`mailto:${email}`} className="text-luna-blue hover:underline break-all">
          {email}
        </a>
      ) },
    { key: 'address',   icon: MapPin,    titleKey: 'address_title',   title: addressTitle,
      body: (
        <div>
          <span>{address}</span>
          {addressNote && <Ed page="contact" field="address_note" as="p" className="text-xs text-slate-500 mt-0.5 block">{addressNote}</Ed>}
          <a href={mapsUrl(address)} target="_blank" rel="noopener noreferrer"
             className="mt-1 inline-flex items-center gap-1 text-luna-blue hover:underline text-xs font-medium">
            {t('contact.address_maps_cta')}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      ) },
    { key: 'instagram', icon: Instagram, titleKey: 'instagram_title', title: instagramTitle,
      body: (
        <a href="https://www.instagram.com/Luna_TrackingLogistics/"
           target="_blank" rel="noopener noreferrer"
           className="text-luna-blue hover:underline">
          {t('footer.instagram_handle')}
        </a>
      ) },
    { key: 'hours',     icon: Clock,     titleKey: 'hours_title',     title: hoursTitle,
      body: <Ed page="contact" field="hours_body" multiline className="text-slate-700">{hoursBody}</Ed> },
  ];

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Ed page="contact" field="page_title" as="h1" className="text-3xl font-bold text-luna-navy block">
            {pageTitle}
          </Ed>
          <Ed page="contact" field="page_intro" as="div" multiline markdown className="mt-3 text-slate-600 max-w-2xl block">
            {pageIntro}
          </Ed>

          <Block name="contact-cards" className="mt-10 grid gap-6 sm:grid-cols-2">
            {blocks.map((b) => (
              <Block key={b.key} name={`contact-card-${b.key}`}>
                <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm h-full">
                  <IconCircle icon={b.icon} variant="onLight" label={b.title} />
                  <Ed page="contact" field={b.titleKey} as="h2" className="mt-4 text-lg font-semibold text-luna-navy block">
                    {b.title}
                  </Ed>
                  <div className="mt-2 text-sm">{b.body}</div>
                </div>
              </Block>
            ))}
          </Block>
        </div>
      </section>
    </>
  );
}
