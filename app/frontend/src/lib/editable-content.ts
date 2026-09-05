/**
 * Registry of every admin-editable field on the public site.
 *
 * Each page declares the fields it exposes as overridable (headings,
 * intros, meta title/description, image slots, ...). The admin panel
 * `/admin/contenus` reads this file to render its form; the public pages
 * read the same declarations via `useContent(page, field, defaultValue)`
 * and `useImage(imageKey, defaultUrl)` — an override wins, otherwise the
 * baked-in i18n default renders.
 *
 * Rules for declaring a new editable field:
 *   1. Add it here (page + fieldKey + kind + label).
 *   2. In the corresponding page component, call useContent() / useImage()
 *      with the SAME (pageKey, fieldKey) so the admin's override reaches
 *      the DOM.
 *   3. Leave the i18n default in place — it stays the fallback on any
 *      environment where the DB row is missing.
 */

export type EditableFieldKind = 'text' | 'textarea';

export type EditableField = {
  key: string;
  kind: EditableFieldKind;
  labelFr: string;
  labelEn: string;
  /** Optional hint under the input (e.g. character limit reminder). */
  hintFr?: string;
  hintEn?: string;
  /** i18n key of the DEFAULT text shown when no admin override exists.
   *  The admin editor pre-fills its input with this so the current site
   *  text is visible and editable from the start. */
  i18nKey: string;
};

export type EditableImage = {
  key: string;
  labelFr: string;
  labelEn: string;
  hintFr?: string;
  hintEn?: string;
};

export type EditablePage = {
  key: string;
  labelFr: string;
  labelEn: string;
  fields: EditableField[];
  images: EditableImage[];
};

// Common SEO fields — same shape across every page, only i18nKey changes.
const metaTitle = (i18nKey: string): EditableField => ({
  key: 'meta_title', kind: 'text', i18nKey,
  labelFr: 'Titre SEO (balise <title>)', labelEn: 'SEO title (<title>)',
  hintFr: 'Idéalement 50-60 caractères. Apparaît dans l\'onglet du navigateur et dans les résultats Google.',
  hintEn: 'Ideally 50-60 characters. Shown in the browser tab and Google search results.',
});

const metaDescription = (i18nKey: string): EditableField => ({
  key: 'meta_description', kind: 'textarea', i18nKey,
  labelFr: 'Description SEO (meta description)', labelEn: 'SEO description (meta description)',
  hintFr: '120-160 caractères. Le résumé sous le titre dans Google.',
  hintEn: '120-160 characters. The summary shown under the title in Google.',
});

export const EDITABLE_PAGES: EditablePage[] = [
  {
    key: 'home', labelFr: 'Accueil', labelEn: 'Home',
    fields: [
      { key: 'hero_title',    kind: 'text',     i18nKey: 'home.hero_title',
        labelFr: 'Titre principal (hero)',     labelEn: 'Main title (hero)' },
      { key: 'hero_subtitle', kind: 'textarea', i18nKey: 'home.hero_subtitle',
        labelFr: 'Sous-titre (hero)',          labelEn: 'Subtitle (hero)' },
      metaTitle('home.meta_title'),
      metaDescription('home.meta_description'),
      { key: 'og_image_alt',  kind: 'text',     i18nKey: 'brand.name',
        labelFr: 'Texte alternatif de l\'image de partage', labelEn: 'Share image alt text',
        hintFr: 'Décrit l\'image ; utilisé par les lecteurs d\'écran et si l\'image ne charge pas.',
        hintEn: 'Describes the image; used by screen readers and if the image fails to load.' },
    ],
    images: [
      { key: 'home_og', labelFr: 'Image de partage (réseaux sociaux)', labelEn: 'Share image (social networks)',
        hintFr: 'Idéalement 1200×630 px, JPG ou PNG. Utilisée par Facebook, WhatsApp, LinkedIn, etc.',
        hintEn: 'Ideally 1200×630 px, JPG or PNG. Used by Facebook, WhatsApp, LinkedIn, etc.' },
    ],
  },
  {
    key: 'tracking', labelFr: 'Suivi de colis', labelEn: 'Tracking',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'tracking.page_title', labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'tracking.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      metaTitle('tracking.meta_title'),
      metaDescription('tracking.meta_description'),
    ],
    images: [],
  },
  {
    key: 'pricing', labelFr: 'Tarifs & devis', labelEn: 'Pricing & quote',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'pricing.page_title', labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'pricing.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      metaTitle('pricing.meta_title'),
      metaDescription('pricing.meta_description'),
    ],
    images: [],
  },
  {
    key: 'contact', labelFr: 'Contact', labelEn: 'Contact',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'contact.page_title', labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'contact.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'hours_body', kind: 'textarea', i18nKey: 'contact.hours_body', labelFr: 'Horaires (bloc)',    labelEn: 'Opening hours (block)' },
      metaTitle('contact.meta_title'),
      metaDescription('contact.meta_description'),
    ],
    images: [],
  },
  {
    key: 'shop-and-ship', labelFr: 'Achat & Envoi', labelEn: 'Shop & Ship',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'shop.page_title', labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'shop.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      metaTitle('shop.meta_title'),
      metaDescription('shop.meta_description'),
    ],
    images: [
      { key: 'shop_og', labelFr: 'Image de partage', labelEn: 'Share image',
        hintFr: '1200×630 px recommandé.', hintEn: '1200×630 px recommended.' },
    ],
  },
  {
    key: 'forwarding', labelFr: 'Réexpédition internationale', labelEn: 'International forwarding',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'forwarding.page_title', labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'intro',      kind: 'textarea', i18nKey: 'forwarding.intro',      labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      metaTitle('forwarding.meta_title'),
      metaDescription('forwarding.meta_description'),
    ],
    images: [
      { key: 'forwarding_og', labelFr: 'Image de partage', labelEn: 'Share image',
        hintFr: '1200×630 px recommandé.', hintEn: '1200×630 px recommended.' },
    ],
  },
];

/** Look up a page's declaration by its key. */
export function getEditablePage(key: string): EditablePage | undefined {
  return EDITABLE_PAGES.find((p) => p.key === key);
}
