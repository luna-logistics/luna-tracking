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
  /** When true, the admin panel renders a hero-background editor for this
   *  page (image + focal point + zoom + overlay). The image_key convention
   *  is `<page.key>_hero`. */
  hasHero?: boolean;
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
    key: 'home', labelFr: 'Accueil', labelEn: 'Home', hasHero: true,
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
      { key: 'pillar_home_title',     kind: 'text',     i18nKey: 'home.pillar_home_title',     labelFr: 'Pilier — Livraison à domicile (titre)', labelEn: 'Pillar — Home delivery (title)' },
      { key: 'pillar_home_body',      kind: 'textarea', i18nKey: 'home.pillar_home_body',      labelFr: 'Pilier — Livraison à domicile (texte)', labelEn: 'Pillar — Home delivery (body)' },
      { key: 'pillar_pickup_title',   kind: 'text',     i18nKey: 'home.pillar_pickup_title',   labelFr: 'Pilier — Enlèvement (titre)', labelEn: 'Pillar — Pickup (title)' },
      { key: 'pillar_pickup_body',    kind: 'textarea', i18nKey: 'home.pillar_pickup_body',    labelFr: 'Pilier — Enlèvement (texte)', labelEn: 'Pillar — Pickup (body)' },
      { key: 'cta_text',              kind: 'textarea', i18nKey: 'home.cta_text',              labelFr: 'Bandeau CTA (texte)', labelEn: 'CTA band (text)' },
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
      { key: 'password_label',   kind: 'text',     i18nKey: 'tracking.password_label',    labelFr: 'Libellé du champ numéro de suivi', labelEn: 'Tracking-number field label' },
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
      { key: 'phone',           kind: 'text',     i18nKey: 'contact.phone',
        labelFr: 'Téléphone / WhatsApp', labelEn: 'Phone / WhatsApp',
        hintFr: 'Format international, ex. +32 470 12 34 56. Affiché sur la page Contact, le pied de page et les mentions légales ; le bouton WhatsApp utilise ce même numéro. Laissez vide pour ne rien afficher.',
        hintEn: 'International format, e.g. +32 470 12 34 56. Shown on the Contact page, the footer and the legal notice; the WhatsApp button uses the same number. Leave empty to hide.' },
      { key: 'whatsapp',        kind: 'text',     i18nKey: 'contact.whatsapp',
        labelFr: 'Numéro WhatsApp', labelEn: 'WhatsApp number',
        hintFr: 'Uniquement si un numéro WhatsApp existe (le fixe 02 n\'en a pas). Format international. Vide = pas de bouton WhatsApp.',
        hintEn: 'Only if a WhatsApp number exists (the 02 landline has none). International format. Empty = no WhatsApp button.' },
      { key: 'address_note',    kind: 'text',     i18nKey: 'contact.address_note', labelFr: 'Adresse — note (sous l\'adresse)', labelEn: 'Address — note (under the address)' },
      metaTitle('contact.meta_title'),
      metaDescription('contact.meta_description'),
    ],
    images: [],
  },
  {
    key: 'shop-and-ship', labelFr: 'Achat & Envoi', labelEn: 'Shop & Ship', hasHero: true,
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'shop.page_title', labelFr: 'Titre principal (hero)', labelEn: 'Main title (hero)' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'shop.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'hero_note',  kind: 'textarea', i18nKey: 'shop.hero_note',  labelFr: 'Note sous l\'intro (hero)', labelEn: 'Note under the intro (hero)' },
      { key: 'products_title',    kind: 'text', i18nKey: 'shop.products_title',    labelFr: 'Titre bloc produits',     labelEn: 'Products block title' },
      { key: 'products_subtitle', kind: 'text', i18nKey: 'shop.products_subtitle', labelFr: 'Sous-titre bloc produits', labelEn: 'Products block subtitle' },
      { key: 'how_title',  kind: 'text',     i18nKey: 'shop.how_title',  labelFr: 'Titre "comment ça marche"', labelEn: 'How-it-works title' },
      { key: 'step1_title', kind: 'text',     i18nKey: 'shop.step1_title', labelFr: 'Étape 1 (titre)', labelEn: 'Step 1 (title)' },
      { key: 'step1_body',  kind: 'textarea', i18nKey: 'shop.step1_body',  labelFr: 'Étape 1 (texte)', labelEn: 'Step 1 (body)' },
      { key: 'step2_title', kind: 'text',     i18nKey: 'shop.step2_title', labelFr: 'Étape 2 (titre)', labelEn: 'Step 2 (title)' },
      { key: 'step2_body',  kind: 'textarea', i18nKey: 'shop.step2_body',  labelFr: 'Étape 2 (texte)', labelEn: 'Step 2 (body)' },
      { key: 'step3_title', kind: 'text',     i18nKey: 'shop.step3_title', labelFr: 'Étape 3 (titre)', labelEn: 'Step 3 (title)' },
      { key: 'step3_body',  kind: 'textarea', i18nKey: 'shop.step3_body',  labelFr: 'Étape 3 (texte)', labelEn: 'Step 3 (body)' },
      metaTitle('shop.meta_title'),
      metaDescription('shop.meta_description'),
    ],
    images: [
      { key: 'shop_og', labelFr: 'Image de partage', labelEn: 'Share image',
        hintFr: '1200×630 px recommandé.', hintEn: '1200×630 px recommended.' },
    ],
  },
  {
    key: 'forwarding', labelFr: 'Réexpédition internationale', labelEn: 'International forwarding', hasHero: true,
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
    key: 'blog', labelFr: 'Blog (index)', labelEn: 'Blog (index)', hasHero: true,
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'blog.page_title', labelFr: 'Titre de la page',   labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'blog.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'empty',      kind: 'textarea', i18nKey: 'blog.empty',      labelFr: 'Texte "aucun article"', labelEn: '"No articles" text' },
      metaTitle('blog.meta_title'),
      metaDescription('blog.meta_description'),
    ],
    images: [],
  },
  {
    key: 'legal', labelFr: 'Informations légales (identité)', labelEn: 'Legal information (identity)',
    fields: [
      { key: 'company_name',      kind: 'text', i18nKey: 'legal_identity.company_name',      labelFr: 'Dénomination',              labelEn: 'Company name' },
      { key: 'legal_form',        kind: 'text', i18nKey: 'legal_identity.legal_form',        labelFr: 'Forme juridique',           labelEn: 'Legal form' },
      { key: 'company_number',    kind: 'text', i18nKey: 'legal_identity.company_number',    labelFr: 'Numéro d\'entreprise (BCE)', labelEn: 'Company number (BCE)',
        hintFr: 'Format 0123.456.789. Affiché dans le pied de page et sur les pages légales.', hintEn: 'Format 0123.456.789. Shown in the footer and on the legal pages.' },
      { key: 'vat_number',        kind: 'text', i18nKey: 'legal_identity.vat_number',        labelFr: 'Numéro de TVA',             labelEn: 'VAT number' },
      { key: 'registered_office', kind: 'text', i18nKey: 'legal_identity.registered_office', labelFr: 'Siège social',              labelEn: 'Registered office' },
      { key: 'publisher',         kind: 'text', i18nKey: 'legal_identity.publisher',         labelFr: 'Responsable de la publication', labelEn: 'Publisher',
        hintFr: 'Nom de la personne responsable du contenu du site (facultatif).', hintEn: 'Name of the person responsible for the site content (optional).' },
    ],
    images: [],
  },
  {
    key: 'about', labelFr: 'À propos', labelEn: 'About us', hasHero: true,
    fields: [
      { key: 'page_title',    kind: 'text',     i18nKey: 'about.page_title',    labelFr: 'Titre de la page',     labelEn: 'Page title' },
      { key: 'page_intro',    kind: 'textarea', i18nKey: 'about.page_intro',    labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 'story_title',   kind: 'text',     i18nKey: 'about.story_title',   labelFr: 'Titre "la société"',   labelEn: '"The company" title' },
      { key: 'story_body',    kind: 'textarea', i18nKey: 'about.story_body',    labelFr: 'Texte "la société"',   labelEn: '"The company" body' },
      { key: 'values_title',  kind: 'text',     i18nKey: 'about.values_title',  labelFr: 'Titre "nos valeurs"',  labelEn: '"Our values" title' },
      { key: 'value1_title',  kind: 'text',     i18nKey: 'about.value1_title',  labelFr: 'Valeur 1 (titre)',     labelEn: 'Value 1 (title)' },
      { key: 'value1_body',   kind: 'textarea', i18nKey: 'about.value1_body',   labelFr: 'Valeur 1 (texte)',     labelEn: 'Value 1 (body)' },
      { key: 'value2_title',  kind: 'text',     i18nKey: 'about.value2_title',  labelFr: 'Valeur 2 (titre)',     labelEn: 'Value 2 (title)' },
      { key: 'value2_body',   kind: 'textarea', i18nKey: 'about.value2_body',   labelFr: 'Valeur 2 (texte)',     labelEn: 'Value 2 (body)' },
      { key: 'value3_title',  kind: 'text',     i18nKey: 'about.value3_title',  labelFr: 'Valeur 3 (titre)',     labelEn: 'Value 3 (title)' },
      { key: 'value3_body',   kind: 'textarea', i18nKey: 'about.value3_body',   labelFr: 'Valeur 3 (texte)',     labelEn: 'Value 3 (body)' },
      { key: 'value4_title',  kind: 'text',     i18nKey: 'about.value4_title',  labelFr: 'Valeur 4 (titre)',     labelEn: 'Value 4 (title)' },
      { key: 'value4_body',   kind: 'textarea', i18nKey: 'about.value4_body',   labelFr: 'Valeur 4 (texte)',     labelEn: 'Value 4 (body)' },
      { key: 'company_title', kind: 'text',     i18nKey: 'about.company_title', labelFr: 'Titre "l\'entreprise"', labelEn: '"The company" card title' },
      metaTitle('about.meta_title'),
      metaDescription('about.meta_description'),
    ],
    images: [],
  },
  {
    key: 'legal_notice', labelFr: 'Mentions légales', labelEn: 'Legal notice',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'legal_notice.page_title', labelFr: 'Titre de la page',     labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'legal_notice.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 's1_title', kind: 'text',     i18nKey: 'legal_notice.s1_title', labelFr: 'Section 1 (titre)', labelEn: 'Section 1 (title)' },
      { key: 's1_body',  kind: 'textarea', i18nKey: 'legal_notice.s1_body',  labelFr: 'Section 1 (texte)', labelEn: 'Section 1 (body)' },
      { key: 's2_title', kind: 'text',     i18nKey: 'legal_notice.s2_title', labelFr: 'Section 2 (titre)', labelEn: 'Section 2 (title)' },
      { key: 's2_body',  kind: 'textarea', i18nKey: 'legal_notice.s2_body',  labelFr: 'Section 2 (texte)', labelEn: 'Section 2 (body)' },
      { key: 's3_title', kind: 'text',     i18nKey: 'legal_notice.s3_title', labelFr: 'Section 3 (titre)', labelEn: 'Section 3 (title)' },
      { key: 's3_body',  kind: 'textarea', i18nKey: 'legal_notice.s3_body',  labelFr: 'Section 3 (texte)', labelEn: 'Section 3 (body)' },
      { key: 's4_title', kind: 'text',     i18nKey: 'legal_notice.s4_title', labelFr: 'Section 4 (titre)', labelEn: 'Section 4 (title)' },
      { key: 's4_body',  kind: 'textarea', i18nKey: 'legal_notice.s4_body',  labelFr: 'Section 4 (texte)', labelEn: 'Section 4 (body)' },
      { key: 's5_title', kind: 'text',     i18nKey: 'legal_notice.s5_title', labelFr: 'Section 5 (titre)', labelEn: 'Section 5 (title)' },
      { key: 's5_body',  kind: 'textarea', i18nKey: 'legal_notice.s5_body',  labelFr: 'Section 5 (texte)', labelEn: 'Section 5 (body)' },
      metaTitle('legal_notice.meta_title'),
      metaDescription('legal_notice.meta_description'),
    ],
    images: [],
  },
  {
    key: 'legal_terms', labelFr: 'Conditions générales de transport', labelEn: 'General terms of transport',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'legal_terms.page_title', labelFr: 'Titre de la page',     labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'legal_terms.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 's1_title', kind: 'text',     i18nKey: 'legal_terms.s1_title', labelFr: 'Section 1 (titre)', labelEn: 'Section 1 (title)' },
      { key: 's1_body',  kind: 'textarea', i18nKey: 'legal_terms.s1_body',  labelFr: 'Section 1 (texte)', labelEn: 'Section 1 (body)' },
      { key: 's2_title', kind: 'text',     i18nKey: 'legal_terms.s2_title', labelFr: 'Section 2 (titre)', labelEn: 'Section 2 (title)' },
      { key: 's2_body',  kind: 'textarea', i18nKey: 'legal_terms.s2_body',  labelFr: 'Section 2 (texte)', labelEn: 'Section 2 (body)' },
      { key: 's3_title', kind: 'text',     i18nKey: 'legal_terms.s3_title', labelFr: 'Section 3 (titre)', labelEn: 'Section 3 (title)' },
      { key: 's3_body',  kind: 'textarea', i18nKey: 'legal_terms.s3_body',  labelFr: 'Section 3 (texte)', labelEn: 'Section 3 (body)' },
      { key: 's4_title', kind: 'text',     i18nKey: 'legal_terms.s4_title', labelFr: 'Section 4 (titre)', labelEn: 'Section 4 (title)' },
      { key: 's4_body',  kind: 'textarea', i18nKey: 'legal_terms.s4_body',  labelFr: 'Section 4 (texte)', labelEn: 'Section 4 (body)' },
      { key: 's5_title', kind: 'text',     i18nKey: 'legal_terms.s5_title', labelFr: 'Section 5 (titre)', labelEn: 'Section 5 (title)' },
      { key: 's5_body',  kind: 'textarea', i18nKey: 'legal_terms.s5_body',  labelFr: 'Section 5 (texte)', labelEn: 'Section 5 (body)' },
      { key: 's6_title', kind: 'text',     i18nKey: 'legal_terms.s6_title', labelFr: 'Section 6 (titre)', labelEn: 'Section 6 (title)' },
      { key: 's6_body',  kind: 'textarea', i18nKey: 'legal_terms.s6_body',  labelFr: 'Section 6 (texte)', labelEn: 'Section 6 (body)' },
      { key: 's7_title', kind: 'text',     i18nKey: 'legal_terms.s7_title', labelFr: 'Section 7 (titre)', labelEn: 'Section 7 (title)' },
      { key: 's7_body',  kind: 'textarea', i18nKey: 'legal_terms.s7_body',  labelFr: 'Section 7 (texte)', labelEn: 'Section 7 (body)' },
      { key: 's8_title', kind: 'text',     i18nKey: 'legal_terms.s8_title', labelFr: 'Section 8 (titre)', labelEn: 'Section 8 (title)' },
      { key: 's8_body',  kind: 'textarea', i18nKey: 'legal_terms.s8_body',  labelFr: 'Section 8 (texte)', labelEn: 'Section 8 (body)' },
      metaTitle('legal_terms.meta_title'),
      metaDescription('legal_terms.meta_description'),
    ],
    images: [],
  },
  {
    key: 'legal_privacy', labelFr: 'Politique de confidentialité', labelEn: 'Privacy policy',
    fields: [
      { key: 'page_title', kind: 'text',     i18nKey: 'legal_privacy.page_title', labelFr: 'Titre de la page',     labelEn: 'Page title' },
      { key: 'page_intro', kind: 'textarea', i18nKey: 'legal_privacy.page_intro', labelFr: 'Texte d\'introduction', labelEn: 'Intro text' },
      { key: 's1_title', kind: 'text',     i18nKey: 'legal_privacy.s1_title', labelFr: 'Section 1 (titre)', labelEn: 'Section 1 (title)' },
      { key: 's1_body',  kind: 'textarea', i18nKey: 'legal_privacy.s1_body',  labelFr: 'Section 1 (texte)', labelEn: 'Section 1 (body)' },
      { key: 's2_title', kind: 'text',     i18nKey: 'legal_privacy.s2_title', labelFr: 'Section 2 (titre)', labelEn: 'Section 2 (title)' },
      { key: 's2_body',  kind: 'textarea', i18nKey: 'legal_privacy.s2_body',  labelFr: 'Section 2 (texte)', labelEn: 'Section 2 (body)' },
      { key: 's3_title', kind: 'text',     i18nKey: 'legal_privacy.s3_title', labelFr: 'Section 3 (titre)', labelEn: 'Section 3 (title)' },
      { key: 's3_body',  kind: 'textarea', i18nKey: 'legal_privacy.s3_body',  labelFr: 'Section 3 (texte)', labelEn: 'Section 3 (body)' },
      { key: 's4_title', kind: 'text',     i18nKey: 'legal_privacy.s4_title', labelFr: 'Section 4 (titre)', labelEn: 'Section 4 (title)' },
      { key: 's4_body',  kind: 'textarea', i18nKey: 'legal_privacy.s4_body',  labelFr: 'Section 4 (texte)', labelEn: 'Section 4 (body)' },
      { key: 's5_title', kind: 'text',     i18nKey: 'legal_privacy.s5_title', labelFr: 'Section 5 (titre)', labelEn: 'Section 5 (title)' },
      { key: 's5_body',  kind: 'textarea', i18nKey: 'legal_privacy.s5_body',  labelFr: 'Section 5 (texte)', labelEn: 'Section 5 (body)' },
      { key: 's6_title', kind: 'text',     i18nKey: 'legal_privacy.s6_title', labelFr: 'Section 6 (titre)', labelEn: 'Section 6 (title)' },
      { key: 's6_body',  kind: 'textarea', i18nKey: 'legal_privacy.s6_body',  labelFr: 'Section 6 (texte)', labelEn: 'Section 6 (body)' },
      { key: 's7_title', kind: 'text',     i18nKey: 'legal_privacy.s7_title', labelFr: 'Section 7 (titre)', labelEn: 'Section 7 (title)' },
      { key: 's7_body',  kind: 'textarea', i18nKey: 'legal_privacy.s7_body',  labelFr: 'Section 7 (texte)', labelEn: 'Section 7 (body)' },
      { key: 's8_title', kind: 'text',     i18nKey: 'legal_privacy.s8_title', labelFr: 'Section 8 (titre)', labelEn: 'Section 8 (title)' },
      { key: 's8_body',  kind: 'textarea', i18nKey: 'legal_privacy.s8_body',  labelFr: 'Section 8 (texte)', labelEn: 'Section 8 (body)' },
      metaTitle('legal_privacy.meta_title'),
      metaDescription('legal_privacy.meta_description'),
    ],
    images: [],
  },
];

/** Look up a page's declaration by its key. */
export function getEditablePage(key: string): EditablePage | undefined {
  return EDITABLE_PAGES.find((p) => p.key === key);
}
