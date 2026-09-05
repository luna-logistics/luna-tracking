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

const META_TITLE: EditableField = {
  key: 'meta_title', kind: 'text',
  labelFr: 'Titre SEO (balise <title>)', labelEn: 'SEO title (<title>)',
  hintFr: 'Idéalement 50-60 caractères. Apparaît dans l\'onglet du navigateur et dans les résultats Google.',
  hintEn: 'Ideally 50-60 characters. Shown in the browser tab and Google search results.',
};

const META_DESCRIPTION: EditableField = {
  key: 'meta_description', kind: 'textarea',
  labelFr: 'Description SEO (meta description)', labelEn: 'SEO description (meta description)',
  hintFr: '120-160 caractères. Le résumé sous le titre dans Google.',
  hintEn: '120-160 characters. The summary shown under the title in Google.',
};

const OG_IMAGE_ALT: EditableField = {
  key: 'og_image_alt', kind: 'text',
  labelFr: 'Texte alternatif de l\'image de partage', labelEn: 'Share image alt text',
  hintFr: 'Décrit l\'image ; utilisé par les lecteurs d\'écran et si l\'image ne charge pas.',
  hintEn: 'Describes the image; used by screen readers and if the image fails to load.',
};

export const EDITABLE_PAGES: EditablePage[] = [
  {
    key: 'home', labelFr: 'Accueil', labelEn: 'Home',
    fields: [
      { key: 'hero_title',    kind: 'text',     labelFr: 'Titre principal (hero)',     labelEn: 'Main title (hero)' },
      { key: 'hero_subtitle', kind: 'textarea', labelFr: 'Sous-titre (hero)',          labelEn: 'Subtitle (hero)' },
      META_TITLE, META_DESCRIPTION, OG_IMAGE_ALT,
    ],
    images: [
      { key: 'home_og',    labelFr: 'Image de partage (réseaux sociaux)', labelEn: 'Share image (social networks)',
        hintFr: 'Idéalement 1200×630 px, JPG ou PNG. Utilisée par Facebook, WhatsApp, LinkedIn, etc.',
        hintEn: 'Ideally 1200×630 px, JPG or PNG. Used by Facebook, WhatsApp, LinkedIn, etc.' },
    ],
  },
  {
    key: 'tracking', labelFr: 'Suivi de colis', labelEn: 'Tracking',
    fields: [
      { key: 'page_title', kind: 'text',     labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      META_TITLE, META_DESCRIPTION,
    ],
    images: [],
  },
  {
    key: 'pricing', labelFr: 'Tarifs & devis', labelEn: 'Pricing & quote',
    fields: [
      { key: 'page_title', kind: 'text',     labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      META_TITLE, META_DESCRIPTION,
    ],
    images: [],
  },
  {
    key: 'contact', labelFr: 'Contact', labelEn: 'Contact',
    fields: [
      { key: 'page_title', kind: 'text',     labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'hours_body', kind: 'textarea', labelFr: 'Horaires (bloc)',    labelEn: 'Opening hours (block)' },
      META_TITLE, META_DESCRIPTION,
    ],
    images: [],
  },
  {
    key: 'shop-and-ship', labelFr: 'Achat & Envoi', labelEn: 'Shop & Ship',
    fields: [
      { key: 'page_title', kind: 'text',     labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      META_TITLE, META_DESCRIPTION,
    ],
    images: [
      { key: 'shop_og', labelFr: 'Image de partage', labelEn: 'Share image',
        hintFr: '1200×630 px recommandé.', hintEn: '1200×630 px recommended.' },
    ],
  },
  {
    key: 'forwarding', labelFr: 'Réexpédition internationale', labelEn: 'International forwarding',
    fields: [
      { key: 'page_title', kind: 'text',     labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'intro',      kind: 'textarea', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      META_TITLE, META_DESCRIPTION,
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
