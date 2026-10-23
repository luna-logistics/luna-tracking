import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';

/** IT / data owner: receives the deletion requests (not the customer-contact addresses). */
const DELETION_EMAIL = 'it.andy@lunatrackinglogistics.com';

/**
 * Data deletion instructions — the URL Meta asks for ("User data deletion")
 * when an app offers Facebook Login. Copy is inline FR/EN: the page has to
 * keep working on its own, whatever the locale files hold.
 */

const COPY = {
  fr: {
    metaTitle: 'Suppression de vos données | Luna Tracking Logistics',
    metaDescription: 'Comment demander la suppression de votre compte et de vos données personnelles chez Luna Tracking Logistics, y compris si vous vous êtes connecté avec Facebook.',
    title: 'Suppression de vos données',
    intro: 'Vous pouvez à tout moment demander la suppression de votre compte Luna Tracking Logistics et des données personnelles associées, que vous ayez créé votre compte avec une adresse e-mail, Google ou Facebook.',
    stepsTitle: 'Comment faire',
    steps: [
      'Envoyez un e-mail à l’adresse ci-dessous, depuis l’adresse e-mail de votre compte.',
      'Indiquez « Suppression de mes données » dans l’objet du message.',
      'Nous vérifions que la demande vient bien de vous, puis nous supprimons votre compte et vos données sous 30 jours. Nous vous envoyons une confirmation.',
    ],
    deletedTitle: 'Ce que nous supprimons',
    deleted: 'Votre profil (nom, adresse e-mail, téléphone), vos adresses enregistrées, ainsi que les informations reçues de Facebook ou de Google lors de la connexion.',
    keptTitle: 'Ce que nous devons conserver',
    kept: 'Certaines données doivent être gardées pour respecter la loi, par exemple les factures et les documents de transport. Elles sont conservées uniquement pendant la durée légale, puis supprimées.',
    facebookTitle: 'Retirer Luna de votre compte Facebook',
    facebook: 'Vous pouvez aussi retirer l’accès de Luna depuis Facebook : Paramètres, puis « Applications et sites web », puis supprimez Luna. Cela ne supprime pas votre compte Luna : pour cela, envoyez-nous l’e-mail décrit plus haut.',
    emailTitle: 'Adresse de contact',
    subject: 'Suppression de mes données',
  },
  en: {
    metaTitle: 'Delete your data | Luna Tracking Logistics',
    metaDescription: 'How to ask for your Luna Tracking Logistics account and personal data to be deleted, including if you signed in with Facebook.',
    title: 'Delete your data',
    intro: 'You can ask at any time for your Luna Tracking Logistics account and the personal data linked to it to be deleted, whether you signed up with an e-mail address, Google or Facebook.',
    stepsTitle: 'How to do it',
    steps: [
      'Send an e-mail to the address below, from the e-mail address of your account.',
      'Write “Delete my data” in the subject line.',
      'We check that the request comes from you, then delete your account and your data within 30 days. We send you a confirmation.',
    ],
    deletedTitle: 'What we delete',
    deleted: 'Your profile (name, e-mail address, phone number), your saved addresses, and the information received from Facebook or Google when you signed in.',
    keptTitle: 'What we must keep',
    kept: 'Some data has to be kept to comply with the law, for example invoices and transport documents. It is kept only for the legal period, then deleted.',
    facebookTitle: 'Remove Luna from your Facebook account',
    facebook: 'You can also remove Luna’s access from Facebook: Settings, then “Apps and websites”, then remove Luna. This does not delete your Luna account: to do that, send us the e-mail described above.',
    emailTitle: 'Contact address',
    subject: 'Delete my data',
  },
} as const;

export default function DataDeletion() {
  const { i18n } = useTranslation();
  const c = COPY[i18n.language === 'en' ? 'en' : 'fr'];

  return (
    <>
      <SEO title={c.metaTitle} description={c.metaDescription} noindex />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-luna-navy">{c.title}</h1>
          <p className="mt-4 text-slate-600">{c.intro}</p>

          <div className="mt-10 space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-luna-navy">{c.stepsTitle}</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-[15px] text-slate-700 leading-relaxed">
                {c.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </section>

            <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-luna-navy">{c.emailTitle}</h2>
              <div className="mt-3 text-sm font-medium">
                <a href={`mailto:${DELETION_EMAIL}?subject=${encodeURIComponent(c.subject)}`} className="text-luna-blue hover:underline">{DELETION_EMAIL}</a>
              </div>
            </div>

            <section>
              <h2 className="text-xl font-semibold text-luna-navy">{c.deletedTitle}</h2>
              <p className="mt-2 text-[15px] text-slate-700 leading-relaxed">{c.deleted}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-luna-navy">{c.keptTitle}</h2>
              <p className="mt-2 text-[15px] text-slate-700 leading-relaxed">{c.kept}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-luna-navy">{c.facebookTitle}</h2>
              <p className="mt-2 text-[15px] text-slate-700 leading-relaxed">{c.facebook}</p>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
