/**
 * Post-build llms.txt generator.
 *
 * Built from the SAME registry as the sitemap (src/lib/url/routes.data.mjs) so
 * the two can never drift: every indexable route (both languages, incl. the
 * service pages) is listed, each with its i18n meta-description as a note.
 * Blog posts are pulled from Supabase at build time, exactly like the sitemap,
 * and the whole thing degrades to the static registry if Supabase is
 * unreachable rather than failing the build.
 *
 * Writes dist/llms.txt; public/_headers serves it as text/plain; charset=utf-8.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { ROUTES, urlFor, blogPostUrl } = await import(
  pathToFileURL(resolve(__dirname, '..', 'src/lib/url/routes.data.mjs')).href
);

const DIST = 'dist';
const SITE_URL = 'https://lunatrackinglogistics.com';
const fr = JSON.parse(readFileSync(resolve(__dirname, '..', 'src/locales/fr.json'), 'utf8'));
const en = JSON.parse(readFileSync(resolve(__dirname, '..', 'src/locales/en.json'), 'utf8'));
const LOCALES = { fr, en };

// RouteKey → i18n page key (mirror of ROUTE_I18N in prerender-metas.mjs).
const PAGE_KEYS = {
  home: 'home', tracking: 'tracking', rateCalculator: 'calc', pricing: 'pricing',
  contact: 'contact', about: 'about', blogIndex: 'blog', apiDocs: 'api_docs',
  shopAndShip: 'shop', forwarding: 'forwarding',
  serviceAir: 'svc_air', serviceSea: 'svc_sea', serviceHome: 'svc_home', servicePickup: 'svc_pickup',
  transitaire: 'transitaire', diaspora: 'diaspora',
  legalNotice: 'legal_notice', terms: 'legal_terms', privacy: 'legal_privacy',
};

// The groups, in reading order. Everything indexable is covered.
const GROUPS = [
  { title: 'Pages principales', keys: ['home', 'tracking', 'rateCalculator', 'pricing', 'contact', 'about'] },
  { title: 'Services', keys: ['transitaire', 'diaspora', 'serviceAir', 'serviceSea', 'serviceHome', 'servicePickup', 'shopAndShip', 'forwarding'] },
  { title: 'Ressources', keys: ['blogIndex', 'apiDocs'] },
  { title: 'Informations légales', keys: ['legalNotice', 'terms', 'privacy'] },
];

const meta = (key, lang, field) => {
  const page = LOCALES[lang]?.[PAGE_KEYS[key]];
  return page && typeof page === 'object' ? page[field] : undefined;
};
// Link label = meta_title without the " — Luna Tracking Logistics" tail.
const label = (key, lang) => {
  const mt = meta(key, lang, 'meta_title');
  if (mt) return mt.replace(/\s*[—–-]\s*Luna Tracking Logistics\b.*$/i, '').trim();
  return urlFor(key, lang);
};
const line = (key, lang) => {
  const url = `${SITE_URL}${urlFor(key, lang)}`;
  // Prefer the plain meta-description; if it carries build-time {{figures}}
  // (only /fret-maritime does), use the figure-free variant — never print a raw
  // {{placeholder}}, and drop the note entirely if neither is clean.
  let desc = meta(key, lang, 'meta_description');
  if (desc && /\{\{/.test(desc)) desc = meta(key, lang, 'meta_description_generic');
  if (desc && /\{\{/.test(desc)) desc = undefined;
  return desc ? `- [${label(key, lang)}](${url}): ${desc}` : `- [${label(key, lang)}](${url})`;
};

// ─── Blog posts (same source + graceful degradation as the sitemap) ──────────
async function fetchBlog() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) { console.warn('[llms] Supabase env not set — skipping blog posts.'); return []; }
  try {
    const res = await fetch(`${url}/rest/v1/blog_posts?select=slug_fr,slug_en,title_fr,title_en,excerpt_fr,excerpt_en&published=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.warn(`[llms] blog_posts → ${res.status} — skipping.`); return []; }
    return await res.json();
  } catch (err) {
    console.warn('[llms] blog_posts fetch failed:', err?.message ?? err);
    return [];
  }
}
const blogRows = await fetchBlog();

// ─── Assemble ───────────────────────────────────────────────────────────────
const out = [];
out.push('# Luna Tracking Logistics');
out.push('');
out.push('> Partenaire fret entre la Belgique et la République Démocratique du Congo. Fret aérien et maritime, enlèvement de colis, livraison à domicile au Congo, suivi transparent à chaque étape, et achat-envoi de produits belges vers la RDC.');
out.push('');
out.push("Luna Tracking Logistics est une entreprise de logistique basée à Bruxelles (Ixelles), spécialisée dans le fret Belgique ↔ Congo. L'offre couvre cinq services — fret aérien, fret maritime, livraison à domicile au Congo, enlèvement de colis, suivi en ligne — plus une boutique Shop & Ship qui permet aux particuliers d'expédier des produits belges à leur famille au Congo, et un module de réexpédition internationale.");
out.push('');
out.push('Le site est bilingue français / anglais : chaque page dispose d\'un équivalent sous le préfixe `/en/`.');
out.push('');

for (const group of GROUPS) {
  out.push(`## ${group.title}`, '');
  for (const key of group.keys) {
    if (ROUTES[key]?.indexable) out.push(line(key, 'fr'));
  }
  if (group.title === 'Ressources') {
    out.push(`- [Sitemap XML](${SITE_URL}/sitemap.xml): liste complète des URLs indexables (français et anglais).`);
    if (blogRows.length > 0) {
      out.push('', '### Blog', '');
      for (const row of blogRows) {
        if (!row.slug_fr) continue;
        const url = `${SITE_URL}${blogPostUrl(row.slug_fr, 'fr')}`;
        out.push(row.excerpt_fr ? `- [${row.title_fr}](${url}): ${row.excerpt_fr}` : `- [${row.title_fr}](${url})`);
      }
    }
  }
  out.push('');
}

out.push('## English pages', '');
for (const group of GROUPS) {
  for (const key of group.keys) {
    const def = ROUTES[key];
    if (def?.indexable && def?.bilingual) out.push(`- [${label(key, 'en')}](${SITE_URL}${urlFor(key, 'en')})`);
  }
}
for (const row of blogRows) {
  if (row.slug_en) out.push(`- [${row.title_en}](${SITE_URL}${blogPostUrl(row.slug_en, 'en')})`);
}
out.push('');

writeFileSync(join(DIST, 'llms.txt'), out.join('\n'), 'utf8');
console.log(`[llms] wrote dist/llms.txt (${GROUPS.reduce((n, g) => n + g.keys.length, 0)} static routes + ${blogRows.length} blog posts).`);
