// Type surface for the shared JSON-LD builders (implementation in
// jsonld.data.mjs, which is also imported directly by Node at build time).
// Loose on purpose: these produce Schema.org JSON, consumed only by
// JSON.stringify.

export const SITE_URL: string;
export const SITE_NAME: string;
export const SITE_LOGO: string;

type JsonLd = Record<string, unknown>;
type FaqItem = { q: string; a: string };

export function articleGraph(args: {
  canonical: string;
  lang: string;
  title: string;
  description?: string;
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  homeUrl: string;
  homeLabel: string;
  blogUrl: string;
  blogLabel: string;
  faq?: FaqItem[];
}): JsonLd;

export function customPageGraph(args: {
  canonical: string;
  lang: string;
  title: string;
  description?: string;
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
}): JsonLd;

export function productSchema(args: {
  canonical: string;
  lang: string;
  name: string;
  description?: string;
  sku?: string;
  gtin?: string | null;
  brand?: string | null;
  category?: string;
  weightKg?: number | null;
  price?: number | null;
  inStock?: boolean;
  image?: string | null;
}): JsonLd;

export function brandFromName(name: string | null | undefined): string | null;

export function serviceGraph(args: {
  lang: string;
  canonical: string;
  title: string;
  description?: string;
  homeUrl: string;
  homeLabel: string;
  serviceName: string;
}): JsonLd;

export function aboutGraph(args: {
  lang: string;
  canonical: string;
  title: string;
  description?: string;
  homeUrl: string;
  homeLabel: string;
  aboutLabel: string;
  founders?: { name: string; role?: string; description?: string }[];
}): JsonLd;
