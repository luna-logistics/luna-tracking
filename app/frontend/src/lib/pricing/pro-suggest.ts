/**
 * Pro-dashboard "Suggérer un tarif": price a quote with the SAME engine and the
 * SAME active `pricing_config` row as the public /calculateur — no second copy of
 * any rate. Pure (no I/O) so it is unit-tested next to the engine.
 *
 * A quote only knows totals (weight, volume) and free-text cities, so this maps
 * them onto the engine:
 *   • air  → both air products of the grid (express + cargo); sea → sea;
 *     road → no grid exists → "sur devis".
 *   • corridor: BE → CD, with the city blank or Brussels / Kinshasa. Any other
 *     country pair or named city → "sur devis" (the grid covers one corridor).
 *   • volumetric weight derived from the total volume (engine opt-in).
 *   • the sous-douane admin fee (config.customsAdminFeeCents) is added only when
 *     the quote is flagged "under customs"; the dossier fee is in every price.
 */
import { computeQuote, type BreakdownLine, type Mode, type ModeResult, type PricingConfig, type QuoteReason } from './engine';

export type QuoteMode = 'air' | 'sea' | 'road';

export interface ProQuoteInput {
  mode: QuoteMode;
  originCountry: string | null;
  destinationCountry: string | null;
  originCity: string | null;
  destinationCity: string | null;
  weightKg: number | null;
  volumeM3: number | null;
  underCustoms: boolean;
}

export type ProLine =
  | BreakdownLine
  | { key: 'customs_admin'; cents: number };

export type ProOption =
  | { mode: Mode; kind: 'price'; totalCents: number; lines: ProLine[]; chargeableBasis: 'actual' | 'volumetric' | 'volume' }
  | { mode: Mode; kind: 'quote'; reason: QuoteReason }
  | { mode: Mode; kind: 'empty' };

export type ProSuggestion =
  | { kind: 'options'; options: ProOption[] }
  | { kind: 'no_grid_for_mode'; mode: QuoteMode };

const BRUSSELS = /^(bruxelles|brussels|brussel|bxl)$/i;
const KINSHASA = /^kinshasa$/i;

/** City → engine corridor token. Blank = the corridor city of that country. */
function cityToken(country: string | null, city: string | null, expectCountry: string, match: RegExp, token: string): string {
  if ((country ?? '').toUpperCase() !== expectCountry) return 'other';
  const c = (city ?? '').trim();
  if (!c || match.test(c)) return token;
  return c.toLowerCase();
}

export function suggestFromGrid(q: ProQuoteInput, config: PricingConfig): ProSuggestion {
  if (q.mode === 'road') return { kind: 'no_grid_for_mode', mode: 'road' };

  const origin = cityToken(q.originCountry, q.originCity, 'BE', BRUSSELS, config.corridor.origin);
  const destination = cityToken(q.destinationCountry, q.destinationCity, 'CD', KINSHASA, config.corridor.destination);

  const res = computeQuote({
    weightKg: q.weightKg,
    volumeM3: q.volumeM3,
    parcels: 1,
    origin,
    destination,
    volumetricFromVolume: true,
  }, config);

  const modes: Mode[] = q.mode === 'air' ? ['express', 'cargo'] : ['sea'];
  const customs = q.underCustoms && config.customsAdminFeeCents ? config.customsAdminFeeCents : 0;

  const options = modes.map((m): ProOption => {
    const r: ModeResult = res[m];
    if (r.kind !== 'price') return r;
    const lines: ProLine[] = [...r.lines];
    if (customs > 0) lines.push({ key: 'customs_admin', cents: customs });
    return { mode: m, kind: 'price', totalCents: r.totalCents + customs, lines, chargeableBasis: r.chargeableBasis };
  });
  return { kind: 'options', options };
}
