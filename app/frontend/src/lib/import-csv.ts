/**
 * Reading an import CSV reliably, whatever touched it on the way.
 *
 * The Eloshon Scraper writes a clean file (UTF-8 + BOM, comma separated,
 * columns = the admin import's). Problems come from what happens after:
 * opened and re-saved in Excel (French locale) the file can come back in
 * Windows-1252, with ";" separators, or with every line that contained
 * quotes wrapped in quotes a second time. Papaparse then GUESSES the
 * separator from the whole sample — on Delhaize names ("Eristoff | Vodka |
 * Blanc") it picked "|", the file collapsed into one column and every row
 * showed "name_fr required".
 *
 * Here the separator is taken from the HEADER line only (column names never
 * contain "|"), wrapped lines are decoded one by one, and a file-level
 * diagnostic says in plain words when the columns still don't match.
 * Pure functions (papaparse only) — unit-tested in import-csv.test.ts.
 */
import Papa from 'papaparse';
import type { ImportProfile } from './import-profile';
import { headerSignature } from './import-profile';
export { parseDecimal } from './import-profile';
import type { Store } from './products';

export type CsvDelimiter = ',' | ';' | '\t' | '|';
const DELIMITERS: CsvDelimiter[] = [',', ';', '\t', '|'];

/** Bytes → text: UTF-8 when valid, else Windows-1252 (Excel's "CSV" save). */
export function decodeCsvBytes(buf: ArrayBuffer | Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let text: string;
  let encoding: 'utf-8' | 'windows-1252' = 'utf-8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
    encoding = 'windows-1252';
  }
  return { text: text.replace(/^\uFEFF/, ''), encoding };
}

/** Count a character outside double-quoted sections. */
function countOutsideQuotes(line: string, ch: string): number {
  let n = 0, inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
    else if (c === ch && !inQ) n++;
  }
  return n;
}

/** Separator of the header line ("," when nothing better is found). A header
 *  wrapped in quotes as one field is looked at from the inside. */
export function detectDelimiter(text: string): CsvDelimiter {
  let first = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const t = first.trim();
  if (t.startsWith('"') && t.endsWith('"') && DELIMITERS.every((d) => countOutsideQuotes(t, d) === 0)) {
    first = t.slice(1, -1).replace(/""/g, '"');
  }
  let best: CsvDelimiter = ',', bestN = 0;
  for (const d of DELIMITERS) {
    const n = countOutsideQuotes(first, d);
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

const normHeader = (h: string) => h.replace(/^\uFEFF/, '').trim().toLowerCase();

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: CsvDelimiter;
  /** Lines that were quoted a second time and decoded again. */
  unwrapped: number;
};

const parseLine = (line: string, delimiter: CsvDelimiter) =>
  ((Papa.parse<string[]>(line, { header: false, delimiter }).data[0] ?? []) as string[]);

/** A row that collapsed into its first column: the first cell holds the
 *  separator, every other cell is empty, and decoding it again gives back a
 *  real row (most of the columns). */
function unwrapRow(cells: string[], width: number, delimiter: CsvDelimiter): string[] | null {
  if (width < 2 || !(cells[0] ?? '').includes(delimiter) || cells.slice(1).some((c) => (c ?? '').trim())) return null;
  const inner = parseLine(cells[0], delimiter);
  return inner.length >= Math.max(3, Math.ceil(width * 0.6)) ? inner : null;
}

/** Parse an import CSV (text already decoded). */
export function parseImportCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const res = Papa.parse<string[]>(clean, { header: false, delimiter, skipEmptyLines: 'greedy' });
  const lines = res.data as string[][];
  if (lines.length === 0) return { headers: [], rows: [], delimiter, unwrapped: 0 };
  let headerCells = lines[0];
  // Whole header wrapped as one field → decode it like the rows.
  if (headerCells.length === 1 && headerCells[0].includes(delimiter)) headerCells = parseLine(headerCells[0], delimiter);
  const headers = headerCells.map(normHeader);
  let unwrapped = 0;
  const rows = lines.slice(1).map((cells) => {
    const inner = unwrapRow(cells, headers.length, delimiter);
    if (inner) unwrapped++;
    const src = inner ?? cells;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) row[h] = src[i] ?? ''; });
    return row;
  });
  return { headers: headers.filter(Boolean), rows, delimiter, unwrapped };
}

/** Columns without which no row can be imported. */
export const REQUIRED_COLUMNS = ['name_fr', 'price'] as const;
const ELOSHON_COLUMNS = ['slug_fr', 'name_fr', 'price', 'store_slug', 'source_url', 'source_product_id'];

/** Which tool produced the file (for profile auto-detection). */
export function detectSourceFormat(headers: string[]): 'eloshon' | 'unknown' {
  const set = new Set(headers.map(normHeader));
  return ELOSHON_COLUMNS.every((c) => set.has(c)) ? 'eloshon' : 'unknown';
}

export type FileDiagnostic = {
  /** Required columns that the file doesn't have. */
  missing: string[];
  /** The file was read as a single column (wrong separator / broken quoting). */
  singleColumn: boolean;
};

export function diagnoseFile(headers: string[]): FileDiagnostic | null {
  const set = new Set(headers);
  const missing = REQUIRED_COLUMNS.filter((c) => !set.has(c));
  if (missing.length === 0) return null;
  return { missing, singleColumn: headers.length <= 1 };
}

/** Prices written in cents (1599 for 15,99 €): every price is a whole number
 *  and most are ≥ 100. Only a hint for the admin — never applied silently. */
export function looksLikeCents(prices: Array<string | undefined>): boolean {
  const vals = prices.map((p) => (p ?? '').trim()).filter(Boolean);
  if (vals.length < 3 || !vals.every((v) => /^\d+$/.test(v))) return false;
  return vals.filter((v) => Number(v) >= 100).length >= vals.length * 0.8;
}

const foldStore = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** store_slug as written by a scraper ("Delhaize", "LIDL", "electro-depot")
 *  → the Luna store: exact slug, else same slug/name ignoring case & accents. */
export function resolveStore(value: string | null | undefined, stores: Pick<Store, 'id' | 'slug' | 'name'>[]): Pick<Store, 'id' | 'slug' | 'name'> | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const exact = stores.find((s) => s.slug === v);
  if (exact) return exact;
  const f = foldStore(v);
  return stores.find((s) => foldStore(s.slug) === f || foldStore(s.name) === f) ?? null;
}

/** Saved profile for this file: same column set first; else, for an Eloshon
 *  export (whose columns grow between scraper versions), the Eloshon profile
 *  of the file's store, else an Eloshon profile tied to no store. */
export function pickProfile(
  headers: string[],
  fileStoreId: string | null,
  profiles: ImportProfile[],
): { profile: ImportProfile; how: 'columns' | 'format' } | null {
  const sig = headerSignature(headers);
  const exact = profiles.find((p) => p.header_signature === sig);
  if (exact) return { profile: exact, how: 'columns' };
  if (detectSourceFormat(headers) !== 'eloshon') return null;
  const eloshon = profiles.filter((p) => detectSourceFormat(p.header_signature.split('|')) === 'eloshon');
  const byStore = fileStoreId ? eloshon.find((p) => p.store_id === fileStoreId) : undefined;
  const found = byStore ?? eloshon.find((p) => !p.store_id);
  return found ? { profile: found, how: 'format' } : null;
}
