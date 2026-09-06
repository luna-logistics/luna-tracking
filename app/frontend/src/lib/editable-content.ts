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
      { key: 'pillars_title',    kind: 'text',     i18nKey: 'home.pillars_title',    labelFr: 'Titre bloc "expertises"', labelEn: 'Pillars block title' },
      { key: 'pillars_subtitle', kind: 'text',     i18nKey: 'home.pillars_subtitle', labelFr: 'Sous-titre bloc "expertises"', labelEn: 'Pillars block subtitle' },
      { key: 'pillar_air_title',      kind: 'text',     i18nKey: 'home.pillar_air_title',      labelFr: 'Pilier — Fret aérien (titre)', labelEn: 'Pillar — Air freight (title)' },
      { key: 'pillar_air_body',       kind: 'textarea', i18nKey: 'home.pillar_air_body',       labelFr: 'Pilier — Fret aérien (texte)', labelEn: 'Pillar — Air freight (body)' },
      { key: 'pillar_sea_title',      kind: 'text',     i18nKey: 'home.pillar_sea_title',      labelFr: 'Pilier — Fret maritime (titre)', labelEn: 'Pillar — Sea freight (title)' },
      { key: 'pillar_sea_body',       kind: 'textarea', i18nKey: 'home.pillar_sea_body',       labelFr: 'Pilier — Fret maritime (texte)', labelEn: 'Pillar — Sea freight (body)' },
      { key: 'pillar_ground_title',   kind: 'text',     i18nKey: 'home.pillar_ground_title',   labelFr: 'Pilier — Transport terrestre (titre)', labelEn: 'Pillar — Ground transport (title)' },
      { key: 'pillar_ground_body',    kind: 'textarea', i18nKey: 'home.pillar_ground_body',    labelFr: 'Pilier — Transport terrestre (texte)', labelEn: 'Pillar — Ground transport (body)' },
      { key: 'pillar_tracking_title', kind: 'text',     i18nKey: 'home.pillar_tracking_title', labelFr: 'Pilier — Suivi (titre)', labelEn: 'Pillar — Tracking (title)' },
      { key: 'pillar_tracking_body',  kind: 'textarea', i18nKey: 'home.pillar_tracking_body',  labelFr: 'Pilier — Suivi (texte)', labelEn: 'Pillar — Tracking (body)' },
      { key: 'how_title',        kind: 'text',     i18nKey: 'home.how_title',        labelFr: 'Titre bloc "comment ça marche"', labelEn: 'How-it-works title' },
      { key: 'how_step1_title',  kind: 'text',     i18nKey: 'home.how_step1_title',  labelFr: 'Étape 1 (titre)', labelEn: 'Step 1 (title)' },
      { key: 'how_step1_body',   kind: 'textarea', i18nKey: 'home.how_step1_body',   labelFr: 'Étape 1 (texte)', labelEn: 'Step 1 (body)' },
      { key: 'how_step2_title',  kind: 'text',     i18nKey: 'home.how_step2_title',  labelFr: 'Étape 2 (titre)', labelEn: 'Step 2 (title)' },
      { key: 'how_step2_body',   kind: 'textarea', i18nKey: 'home.how_step2_body',   labelFr: 'Étape 2 (texte)', labelEn: 'Step 2 (body)' },
      { key: 'how_step3_title',  kind: 'text',     i18nKey: 'home.how_step3_title',  labelFr: 'Étape 3 (titre)', labelEn: 'Step 3 (title)' },
      { key: 'how_step3_body',   kind: 'textarea', i18nKey: 'home.how_step3_body',   labelFr: 'Étape 3 (texte)', labelEn: 'Step 3 (body)' },
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
      { key: 'page_title',       kind: 'text',     i18nKey: 'tracking.page_title', labelFr: 'Titre de la page',    labelEn: 'Page title' },
      { key: 'page_intro',       kind: 'textarea', i18nKey: 'tracking.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'password_label',   kind: 'text',     i18nKey: 'tracking.password_label',    labelFr: 'Libellé du champ mot de passe',  labelEn: 'Password field label' },
      { key: 'unavailable_title',kind: 'text',     i18nKey: 'tracking.unavailable_title', labelFr: 'Titre "indisponible"',           labelEn: '"Unavailable" title' },
      { key: 'unavailable_body', kind: 'textarea', i18nKey: 'tracking.unavailable_body',  labelFr: 'Texte "indisponible"',           labelEn: '"Unavailable" body' },
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
      { key: 'page_title',      kind: 'text',     i18nKey: 'contact.page_title', labelFr: 'Titre de la page',  labelEn: 'Page title' },
      { key: 'page_intro',      kind: 'textarea', i18nKey: 'contact.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'email_title',     kind: 'text',     i18nKey: 'contact.email_title',     labelFr: 'Carte email — titre',    labelEn: 'Email card — title' },
      { key: 'address_title',   kind: 'text',     i18nKey: 'contact.address_title',   labelFr: 'Carte adresse — titre',  labelEn: 'Address card — title' },
      { key: 'instagram_title', kind: 'text',     i18nKey: 'contact.instagram_title', labelFr: 'Carte Instagram — titre', labelEn: 'Instagram card — title' },
      { key: 'hours_title',     kind: 'text',     i18nKey: 'contact.hours_title',     labelFr: 'Carte horaires — titre', labelEn: 'Hours card — title' },
      { key: 'hours_body',      kind: 'textarea', i18nKey: 'contact.hours_body',      labelFr: 'Horaires (texte)',      labelEn: 'Hours (body)' },
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
      { key: 'page_title',         kind: 'text',     i18nKey: 'forwarding.page_title', labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'intro',              kind: 'textarea', i18nKey: 'forwarding.intro',      labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'how_title',          kind: 'text',     i18nKey: 'forwarding.how_title',          labelFr: 'Titre bloc "comment ça marche"', labelEn: 'How-it-works title' },
      { key: 'how_step1_title',    kind: 'text',     i18nKey: 'forwarding.how_step1_title',    labelFr: 'Étape 1 (titre)',    labelEn: 'Step 1 (title)' },
      { key: 'how_step1_body',     kind: 'textarea', i18nKey: 'forwarding.how_step1_body',     labelFr: 'Étape 1 (texte)',    labelEn: 'Step 1 (body)' },
      { key: 'how_step2_title',    kind: 'text',     i18nKey: 'forwarding.how_step2_title',    labelFr: 'Étape 2 (titre)',    labelEn: 'Step 2 (title)' },
      { key: 'how_step2_body',     kind: 'textarea', i18nKey: 'forwarding.how_step2_body',     labelFr: 'Étape 2 (texte)',    labelEn: 'Step 2 (body)' },
      { key: 'how_step3_title',    kind: 'text',     i18nKey: 'forwarding.how_step3_title',    labelFr: 'Étape 3 (titre)',    labelEn: 'Step 3 (title)' },
      { key: 'how_step3_body',     kind: 'textarea', i18nKey: 'forwarding.how_step3_body',     labelFr: 'Étape 3 (texte)',    labelEn: 'Step 3 (body)' },
      { key: 'examples_title',     kind: 'text',     i18nKey: 'forwarding.examples_title',     labelFr: 'Titre bloc "exemples"', labelEn: 'Examples block title' },
      { key: 'example_us_title',   kind: 'text',     i18nKey: 'forwarding.example_us_title',   labelFr: 'Exemple US (titre)', labelEn: 'US example (title)' },
      { key: 'example_us_body',    kind: 'textarea', i18nKey: 'forwarding.example_us_body',    labelFr: 'Exemple US (texte)', labelEn: 'US example (body)' },
      { key: 'example_cn_title',   kind: 'text',     i18nKey: 'forwarding.example_cn_title',   labelFr: 'Exemple Chine (titre)', labelEn: 'China example (title)' },
      { key: 'example_cn_body',    kind: 'textarea', i18nKey: 'forwarding.example_cn_body',    labelFr: 'Exemple Chine (texte)', labelEn: 'China example (body)' },
      { key: 'form_title',         kind: 'text',     i18nKey: 'forwarding.form_title',         labelFr: 'Titre du formulaire',    labelEn: 'Form title' },
      { key: 'form_intro',         kind: 'textarea', i18nKey: 'forwarding.form_intro',         labelFr: 'Intro du formulaire',    labelEn: 'Form intro' },
      metaTitle('forwarding.meta_title'),
      metaDescription('forwarding.meta_description'),
    ],
    images: [
      { key: 'forwarding_og', labelFr: 'Image de partage', labelEn: 'Share image',
        hintFr: '1200×630 px recommandé.', hintEn: '1200×630 px recommended.' },
    ],
  },
  {
    key: 'blog', labelFr: 'Blog (index)', labelEn: 'Blog (index)',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'blog.page_title', labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'blog.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'empty',      kind: 'textarea', i18nKey: 'blog.empty',      labelFr: 'Texte "aucun article"', labelEn: '"No articles" text' },
      metaTitle('blog.meta_title'),
      metaDescription('blog.meta_description'),
    ],
    images: [],
  },
];

/** Look up a page's declaration by its key. */
export function getEditablePage(key: string): EditablePage | undefined {
  return EDITABLE_PAGES.find((p) => p.key === key);
}
