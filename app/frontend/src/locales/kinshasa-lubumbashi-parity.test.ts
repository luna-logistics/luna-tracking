import { describe, it, expect } from 'vitest';
import fr from './fr.json';
import en from './en.json';

/**
 * OWNER RULE (SEO): every user-visible string that names Kinshasa must also name
 * Lubumbashi — Kinshasa is never removed, Lubumbashi is added next to it. This
 * guard fails the build if a copy string names one city without the other, so a
 * future Kinshasa-only sentence cannot ship silently.
 *
 * The allowlist holds the only strings allowed to name Kinshasa alone. Each entry
 * is a real fact about the Kinshasa office, a corridor/option label that has an
 * explicit Lubumbashi sibling shown next to it, or an illustrative example — never
 * a service-coverage claim. Add to it only with a written reason.
 */
const ALLOWLIST: Record<string, string> = {
  // Real second office in Kinshasa — no Lubumbashi office exists; inventing one is forbidden.
  'footer.address_kinshasa': 'Kinshasa office address (real fact)',
  'contact.office_kin_title': 'Kinshasa office heading (real fact)',
  'contact.office_kin_address': 'Kinshasa office address (real fact)',
  'transitaire.who_offices': 'names the real Kinshasa office',
  // Single-corridor labels shown right next to their Lubumbashi sibling.
  'admin_pricing.corridor_kinshasa': 'corridor label; sibling admin_pricing.corridor_lubumbashi',
  'calc.dest_kinshasa': 'dropdown option; sibling calc.dest_lubumbashi',
  'svc_air.dest_kinshasa': 'route line; sibling svc_air.dest_lubumbashi on the same section',
  // Illustrative form placeholders / example scenario — not a coverage statement.
  'business_create.field_name_placeholder': 'example placeholder in a form, not coverage',
  'business_client_detail.address_label_placeholder': 'example placeholder in a form, not coverage',
  'forwarding.example_us_title': 'illustrative single-route forwarding example (US → Kinshasa)',
};

const has = (s: string, city: string) => s.toLowerCase().includes(city);

/** Every string value with its "page.key…" path. */
function stringEntries(obj: unknown, path: string, out: [string, string][]) {
  if (typeof obj === 'string') { if (path) out.push([path, obj]); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => stringEntries(v, `${path}[${i}]`, out)); return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) stringEntries(v, path ? `${path}.${k}` : k, out);
  }
}

describe.each([['fr', fr], ['en', en]] as const)('%s copy names Lubumbashi wherever it names Kinshasa', (_lang, dict) => {
  const entries: [string, string][] = [];
  stringEntries(dict, '', entries);

  it('no string names Kinshasa without Lubumbashi (outside the allowlist)', () => {
    const offenders = entries
      .filter(([path, value]) => has(value, 'kinshasa') && !has(value, 'lubumbashi') && !(path in ALLOWLIST))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('every allowlisted path still exists and still names Kinshasa alone (no stale entries)', () => {
    const byPath = new Map(entries);
    const stale = Object.keys(ALLOWLIST).filter((path) => {
      const v = byPath.get(path);
      return v === undefined || !has(v, 'kinshasa') || has(v, 'lubumbashi');
    });
    expect(stale).toEqual([]);
  });
});
