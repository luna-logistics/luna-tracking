/**
 * Incoterms 2020 (ICC). The 11 codes are fixed by the standard, not a business
 * decision; names + plain-language explanations live in i18n (`incoterms.*`).
 * DB CHECK on shipments.incoterm mirrors this list.
 */
export const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'] as const;
export type Incoterm = typeof INCOTERMS[number];

/** Rules that only apply to sea / inland-waterway transport. */
export const SEA_ONLY_INCOTERMS: readonly Incoterm[] = ['FAS', 'FOB', 'CFR', 'CIF'];

/** The site's published Incoterms guide (blog_posts, FR + EN, live). */
export const INCOTERMS_GUIDE_SLUGS = {
  fr: 'incoterms-dap-ddp-frais-transport-international',
  en: 'incoterms-dap-vs-ddp-international-shipping-costs',
} as const;

export function isIncoterm(v: string | null | undefined): v is Incoterm {
  return !!v && (INCOTERMS as readonly string[]).includes(v);
}
