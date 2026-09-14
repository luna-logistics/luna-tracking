/**
 * Editorial content + opening-hours logic for the redesigned Contact page
 * (from the "Contact Luna" Claude Design handoff + brief-claude-design-luna-contact.md,
 * 2026-09-14). Bilingual, one object per item — same pattern as
 * reexpedition-data.ts: long-form structural copy lives here, not in the i18n
 * JSON, while short chrome strings and all form labels stay in `contact.*`
 * i18n and remain admin-editable.
 *
 * No new Supabase table: values still to be confirmed (WhatsApp number,
 * per-channel delays, chat staffing hours, office drop-off policy) are simply
 * omitted rather than invented or bracketed.
 */

export type Lang = 'fr' | 'en';
type L = { fr: string; en: string };
const pick = (v: L, l: Lang) => (l === 'en' ? v.en : v.fr);

// ─── Hero intent router ─────────────────────────────────────────────────
export type IntentAction =
  | { label: L; kind: 'primary' | 'ghost'; route: string; hash?: string }
  | { label: L; kind: 'primary' | 'ghost'; href: string }
  | { label: L; kind: 'primary' | 'ghost'; subjectId: string };

export type Intent = {
  id: string;
  /** Form subject preselected when an intent action opens the form. */
  subjectId: string;
  label: L;
  body: L[];
  actions: IntentAction[];
};

const INTENTS: Intent[] = [
  {
    id: 'suivi', subjectId: 'envoi',
    label: { fr: 'Je veux savoir où est mon colis', en: 'I want to know where my parcel is' },
    body: [
      { fr: 'Pas besoin de nous écrire : votre numéro de suivi Luna donne la position de votre envoi à tout moment.',
        en: 'No need to write to us: your Luna tracking number shows your shipment’s position at any time.' },
      { fr: 'Votre suivi n’a pas bougé depuis plusieurs jours ? C’est parfois normal — un envoi en attente de départ groupé ou en cours de dédouanement ne génère pas de nouvelle étape tous les jours. Si le blocage dure, écrivez-nous avec votre numéro de suivi.',
        en: 'Your tracking hasn’t moved for several days? That is sometimes normal — a shipment waiting for a grouped departure or going through customs does not generate a new step every day. If the hold lasts, write to us with your tracking number.' },
    ],
    actions: [
      { label: { fr: 'Suivre mon colis', en: 'Track my parcel' }, kind: 'primary', route: 'tracking' },
      { label: { fr: 'Nous écrire', en: 'Write to us' }, kind: 'ghost', subjectId: 'envoi' },
    ],
  },
  {
    id: 'prix', subjectId: 'devis',
    label: { fr: 'Je veux connaître le prix d’un envoi', en: 'I want to know the price of a shipment' },
    body: [
      { fr: 'Le tarif dépend de l’origine, de la destination, du poids et du volume. Le plus rapide est de nous décrire l’envoi : nous revenons avec un plan de transport et un tarif indicatif.',
        en: 'The price depends on origin, destination, weight and volume. The quickest way is to describe the shipment: we come back with a transport plan and an indicative price.' },
    ],
    actions: [
      { label: { fr: 'Demander un devis', en: 'Request a quote' }, kind: 'primary', route: 'forwarding', hash: 'devis' },
    ],
  },
  {
    id: 'probleme', subjectId: 'envoi',
    label: { fr: 'J’ai un problème avec un envoi en cours', en: 'I have a problem with an ongoing shipment' },
    body: [
      { fr: 'Appelez-nous, c’est le plus rapide. Préparez votre numéro de suivi Luna avant d’appeler : sans lui, nous ne pouvons pas ouvrir votre dossier.',
        en: 'Call us, it is the quickest. Have your Luna tracking number ready before calling: without it, we cannot open your file.' },
    ],
    actions: [
      { label: { fr: 'Appeler le bureau', en: 'Call the office' }, kind: 'primary', href: 'tel:+3222419672' },
      { label: { fr: 'Écrire avec ma référence', en: 'Write with my reference' }, kind: 'ghost', subjectId: 'envoi' },
    ],
  },
  {
    id: 'question', subjectId: 'question',
    label: { fr: 'J’ai une question avant de commander', en: 'I have a question before ordering' },
    body: [
      { fr: 'Beaucoup de réponses sont déjà sur le site : ce que nous transportons, comment fonctionne le groupage, qui paie la douane. Si vous ne trouvez pas, écrivez-nous, il n’y a pas de question bête.',
        en: 'Many answers are already on the site: what we carry, how groupage works, who pays customs. If you can’t find it, write to us — there is no silly question.' },
    ],
    actions: [
      { label: { fr: 'Voir les questions fréquentes', en: 'See the FAQ' }, kind: 'primary', route: 'forwarding' },
      { label: { fr: 'Nous écrire', en: 'Write to us' }, kind: 'ghost', subjectId: 'question' },
    ],
  },
  {
    id: 'entreprise', subjectId: 'entreprise',
    label: { fr: 'Je représente une entreprise', en: 'I represent a business' },
    body: [
      { fr: 'Envois réguliers, volumes commerciaux, accès à notre suivi depuis vos propres outils : nous traitons ces demandes séparément.',
        en: 'Regular shipments, commercial volumes, access to our tracking from your own tools: we handle these requests separately.' },
    ],
    actions: [
      { label: { fr: 'Contact professionnel', en: 'Business contact' }, kind: 'primary', subjectId: 'entreprise' },
    ],
  },
  {
    id: 'relance', subjectId: 'autre',
    label: { fr: 'Je vous ai écrit et je n’ai pas eu de réponse', en: 'I wrote to you and got no reply' },
    body: [
      { fr: 'Vérifiez d’abord vos courriers indésirables, puis rappelez-nous en indiquant la date de votre premier message. Nous ne laissons pas un message sans réponse.',
        en: 'First check your spam folder, then call us back giving the date of your first message. We do not leave a message unanswered.' },
    ],
    actions: [
      { label: { fr: 'Appeler le bureau', en: 'Call the office' }, kind: 'primary', href: 'tel:+3222419672' },
    ],
  },
];

// ─── Quick answers (before writing) ─────────────────────────────────────
export type QuickAnswer = { q: L; a: L; link: L; route: string; hash?: string };
const QUICK_ANSWERS: QuickAnswer[] = [
  { q: { fr: 'Où est mon colis ?', en: 'Where is my parcel?' },
    a: { fr: 'Entrez votre numéro de suivi sur la page Suivi.', en: 'Enter your tracking number on the Tracking page.' },
    link: { fr: 'Suivre un envoi', en: 'Track a shipment' }, route: 'tracking' },
  { q: { fr: 'Combien ça coûte ?', en: 'How much does it cost?' },
    a: { fr: 'Le tarif dépend du poids, du volume et du mode de transport. Le devis est gratuit et sans engagement.',
         en: 'The price depends on weight, volume and transport mode. The quote is free and without commitment.' },
    link: { fr: 'Demander un devis', en: 'Request a quote' }, route: 'forwarding', hash: 'devis' },
  { q: { fr: 'Combien de temps ça prend ?', en: 'How long does it take?' },
    a: { fr: 'Cela dépend du corridor et du mode choisi : l’aérien se compte en jours, le maritime en semaines.',
         en: 'It depends on the corridor and the chosen mode: air is counted in days, sea in weeks.' },
    link: { fr: 'Aérien ou maritime ?', en: 'Air or sea?' }, route: 'forwarding' },
  { q: { fr: 'Qui paie la douane ?', en: 'Who pays customs?' },
    a: { fr: 'Les droits et taxes à l’arrivée sont calculés par l’administration congolaise selon la nature et la valeur des marchandises.',
         en: 'Duties and taxes on arrival are calculated by the Congolese administration according to the nature and value of the goods.' },
    link: { fr: 'Ce qu’il faut savoir sur la douane', en: 'What to know about customs' }, route: 'forwarding' },
];

// ─── Channels ───────────────────────────────────────────────────────────
// WhatsApp is intentionally absent until a professional number is confirmed.
export type Channel = {
  id: string;
  name: L;
  value: L;
  href?: string;
  external?: boolean;
  use: L;
  delay: L;
};
const CHANNELS: Channel[] = [
  {
    id: 'phone', name: { fr: 'Téléphone', en: 'Phone' },
    value: { fr: '+32 2 241 96 72', en: '+32 2 241 96 72' }, href: 'tel:+3222419672',
    use: { fr: 'Un envoi en cours, une urgence', en: 'An ongoing shipment, an emergency' },
    delay: { fr: 'Immédiat aux heures d’ouverture', en: 'Immediate during opening hours' },
  },
  {
    id: 'email', name: { fr: 'E-mail', en: 'Email' },
    value: { fr: 'info@lunatrackinglogistics.com', en: 'info@lunatrackinglogistics.com' },
    href: 'mailto:info@lunatrackinglogistics.com',
    use: { fr: 'Tout ce qui demande une pièce jointe ou une trace écrite', en: 'Anything needing an attachment or a written record' },
    delay: { fr: '', en: '' },
  },
  {
    id: 'chat', name: { fr: 'Chat du site', en: 'Website chat' },
    value: { fr: 'Bulle en bas à droite', en: 'Bubble at the bottom right' },
    use: { fr: 'Une question rapide pendant votre visite', en: 'A quick question while you browse' },
    delay: { fr: '', en: '' },
  },
  {
    id: 'instagram', name: { fr: 'Instagram', en: 'Instagram' },
    value: { fr: '@Luna_TrackingLogistics', en: '@Luna_TrackingLogistics' },
    href: 'https://www.instagram.com/Luna_TrackingLogistics/', external: true,
    use: { fr: 'Suivre nos actualités et nos départs', en: 'Follow our news and departures' },
    delay: { fr: 'Ce n’est pas un canal de support', en: 'Not a support channel' },
  },
];

// ─── Anti-fraud / trust bullets ─────────────────────────────────────────
const TRUST: L[] = [
  { fr: 'Nos seuls canaux officiels sont ceux listés sur cette page.',
    en: 'Our only official channels are the ones listed on this page.' },
  { fr: 'Notre adresse e-mail se termine toujours par le domaine officiel de Luna. Toute autre terminaison n’est pas nous.',
    en: 'Our email address always ends with Luna’s official domain. Any other ending is not us.' },
  { fr: 'Nous ne demandons jamais de paiement vers un compte personnel.',
    en: 'We never ask for payment to a personal account.' },
  { fr: 'En cas de doute sur un message, un appel ou un paiement : appelez le bureau avant de faire quoi que ce soit. Un appel de vérification ne coûte rien, une erreur de paiement coûte cher.',
    en: 'If in doubt about a message, a call or a payment: call the office before doing anything. A verification call costs nothing, a payment mistake costs a lot.' },
];

// ─── Form subjects + declared location ──────────────────────────────────
export type Subject = { id: string; label: L; needsRef: boolean; hint: L };
const SUBJECTS: Subject[] = [
  { id: 'envoi', label: { fr: 'Envoi en cours', en: 'Ongoing shipment' }, needsRef: true,
    hint: { fr: 'Décrivez ce qui vous inquiète, avec les dates. Indiquez votre numéro de suivi ci-dessus.',
            en: 'Describe what worries you, with dates. Enter your tracking number above.' } },
  { id: 'devis', label: { fr: 'Demande de devis', en: 'Quote request' }, needsRef: false,
    hint: { fr: 'Où se trouve la marchandise, où doit-elle aller, de quoi s’agit-il et quelle quantité environ ?',
            en: 'Where are the goods, where should they go, what is it and roughly how much?' } },
  { id: 'question', label: { fr: 'Question avant commande', en: 'Pre-order question' }, needsRef: false,
    hint: { fr: 'Posez votre question telle qu’elle vous vient — il n’y a pas de question bête.',
            en: 'Ask your question as it comes — there is no silly question.' } },
  { id: 'reclamation', label: { fr: 'Réclamation', en: 'Complaint' }, needsRef: true,
    hint: { fr: 'Décrivez ce qui s’est passé, avec les dates. Si le colis est abîmé, joignez des photos par e-mail.',
            en: 'Describe what happened, with dates. If the parcel is damaged, attach photos by email.' } },
  { id: 'entreprise', label: { fr: 'Entreprise et partenariat', en: 'Business and partnership' }, needsRef: false,
    hint: { fr: 'Votre activité, les volumes concernés et ce que vous attendez de nous.',
            en: 'Your business, the volumes involved and what you expect from us.' } },
  { id: 'autre', label: { fr: 'Autre', en: 'Other' }, needsRef: false,
    hint: { fr: 'Dites-nous en quelques lignes de quoi il s’agit.', en: 'Tell us in a few lines what it is about.' } },
];

const PLACES: L[] = [
  { fr: 'Belgique / Europe', en: 'Belgium / Europe' },
  { fr: 'Congo (RDC)', en: 'Congo (DRC)' },
  { fr: 'Ailleurs', en: 'Elsewhere' },
];

// ─── Opening hours (computed, timezone-correct) ─────────────────────────
export const OFFICE_TZ = 'Europe/Brussels';
export const KINSHASA_TZ = 'Africa/Kinshasa';
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 18;
/** ISO-ish weekday indices, 0 = Sunday … 6 = Saturday. Mon–Fri. */
export const WORKDAYS = [1, 2, 3, 4, 5];
/** Belgian public holidays 2026 — office closed. */
export const CLOSED_DATES = new Set([
  '2026-01-01', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25',
  '2026-07-21', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25',
]);

const EN_US_WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Numeric weekday (0–6) of `date` in `tz`, via a fixed en-US format (never a
 *  localized string match, which would silently misfire in the EN build). */
export function weekdayIndexInTz(date: Date, tz: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  return EN_US_WEEKDAY[name] ?? 0;
}

/** Hour on a 0–23 clock in `tz` (midnight = 0, never 24). */
export function hourInTz(date: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).find((p) => p.type === 'hour')?.value ?? '0';
  return Number(h) % 24;
}

/** Calendar date of `date` in `tz` as YYYY-MM-DD. */
export function ymdInTz(date: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function isWorkingYmd(ymd: string, weekday: number): boolean {
  return WORKDAYS.includes(weekday) && !CLOSED_DATES.has(ymd);
}

function addDays(ymd: string, n: number): { ymd: string; weekday: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  const out = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  return { ymd: out, weekday: dt.getUTCDay() };
}

export type OpeningStatus = {
  open: boolean;
  /** Days until reopen: 0 = today, 1 = tomorrow, ≥2 = a named weekday. */
  reopenOffset: number;
  reopenWeekday: number;
  reopenHour: number;
};

/** Live open/closed status at `now`, in the office timezone. When closed,
 *  walks forward to the next real working day (so Friday evening → Monday). */
export function computeOpeningStatus(now: Date): OpeningStatus {
  const ymd = ymdInTz(now, OFFICE_TZ);
  const weekday = weekdayIndexInTz(now, OFFICE_TZ);
  const hour = hourInTz(now, OFFICE_TZ);
  const workingToday = isWorkingYmd(ymd, weekday);

  if (workingToday && hour >= OPEN_HOUR && hour < CLOSE_HOUR) {
    return { open: true, reopenOffset: 0, reopenWeekday: weekday, reopenHour: OPEN_HOUR };
  }
  if (workingToday && hour < OPEN_HOUR) {
    return { open: false, reopenOffset: 0, reopenWeekday: weekday, reopenHour: OPEN_HOUR };
  }
  for (let i = 1; i <= 14; i++) {
    const next = addDays(ymd, i);
    if (isWorkingYmd(next.ymd, next.weekday)) {
      return { open: false, reopenOffset: i, reopenWeekday: next.weekday, reopenHour: OPEN_HOUR };
    }
  }
  return { open: false, reopenOffset: -1, reopenWeekday: weekday, reopenHour: OPEN_HOUR };
}

/** `9h00`, `18h00`, `0h00` — never `24h`. */
export function formatHour(hour: number): string {
  return `${((hour % 24) + 24) % 24}h00`;
}

/** Office window in Brussels, e.g. "9h00 – 18h00". */
export function brusselsWindow(): string {
  return `${formatHour(OPEN_HOUR)} – ${formatHour(CLOSE_HOUR)}`;
}

/** Same window shifted into Kinshasa local time, from the live offset diff
 *  (Kinshasa is UTC+1 year-round; Brussels shifts twice a year). */
export function kinshasaWindow(now: Date): string {
  const asUtc = (tz: string) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? '0');
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  };
  const diffH = Math.round((asUtc(KINSHASA_TZ) - asUtc(OFFICE_TZ)) / 3600000);
  return `${formatHour(OPEN_HOUR + diffH)} – ${formatHour(CLOSE_HOUR + diffH)}`;
}

/** Localized weekday name (0 = Sunday), via Intl, without touching real dates. */
export function weekdayName(index: number, lang: Lang): string {
  const ref = new Date(Date.UTC(2024, 0, 7)); // a Sunday
  ref.setUTCDate(7 + (((index % 7) + 7) % 7));
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(ref);
}

// ─── Public bilingual view for the page ─────────────────────────────────
export function contactData(lang: Lang) {
  return {
    intents: INTENTS.map((i) => ({
      id: i.id,
      subjectId: i.subjectId,
      label: pick(i.label, lang),
      body: i.body.map((b) => pick(b, lang)),
      actions: i.actions.map((a) => ({
        label: pick(a.label, lang),
        kind: a.kind,
        route: 'route' in a ? a.route : undefined,
        hash: 'route' in a ? a.hash : undefined,
        href: 'href' in a ? a.href : undefined,
        subjectId: 'subjectId' in a ? a.subjectId : undefined,
      })),
    })),
    quickAnswers: QUICK_ANSWERS.map((q) => ({
      q: pick(q.q, lang), a: pick(q.a, lang), link: pick(q.link, lang), route: q.route, hash: q.hash,
    })),
    channels: CHANNELS.map((c) => ({
      id: c.id, name: pick(c.name, lang), value: pick(c.value, lang),
      href: c.href, external: c.external, use: pick(c.use, lang), delay: pick(c.delay, lang),
    })),
    trust: TRUST.map((t) => pick(t, lang)),
    subjects: SUBJECTS.map((s) => ({ id: s.id, label: pick(s.label, lang), needsRef: s.needsRef, hint: pick(s.hint, lang) })),
    places: PLACES.map((p) => pick(p, lang)),
  };
}

export type ContactData = ReturnType<typeof contactData>;
