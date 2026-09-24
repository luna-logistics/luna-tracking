import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrackingMap, type MapData } from './TrackingMap';
import type { TrackingView } from '@/lib/tracking-view';

const data = JSON.parse(readFileSync(path.resolve(__dirname, '../../assets/suivi-map.json'), 'utf8')) as MapData;
const labels = { bru: 'Bruxelles', anr: 'Anvers', be: 'BELGIQUE', cd: 'RD CONGO', matadi: 'Matadi' };
const draw = (view: Parameters<typeof TrackingMap>[0]['view'], variant: 'desktop' | 'mobile' = 'desktop') =>
  renderToStaticMarkup(<TrackingMap data={data} view={view} variant={variant} lang="fr" labels={labels} />);
const result = (mode: 'air' | 'sea', dest: 'fih' | 'gom' = 'fih'): Pick<TrackingView, 'mode' | 'status' | 'reachedBeforeCancel' | 'route'> =>
  ({ mode, status: 'in_transit', reachedBeforeCancel: null, route: { dest, reverse: false } });
const count = (html: string, s: string) => html.split(s).length - 1;

describe('TrackingMap routes', () => {
  it('preview (no search) shows every service: air to Kinshasa + Goma (plane) and sea via Matadi (ship)', () => {
    for (const variant of ['desktop', 'mobile'] as const) {
      const html = draw('preview', variant);
      expect(count(html, 'lucide-plane')).toBe(1);
      expect(count(html, 'lucide-ship')).toBe(1);
      for (const name of ['Bruxelles', 'Anvers', 'Kinshasa', 'Goma', 'Matadi']) expect(html).toContain(`>${name}<`);
      expect(count(html, 'stroke-dasharray="2 8"')).toBe(3); // Kinshasa air, Goma air, sea
    }
  });

  it('a sea result shows only its own route: ship, Anvers → Matadi → Kinshasa, no plane, no Goma', () => {
    const html = draw(result('sea'));
    expect(count(html, 'lucide-ship')).toBe(1);
    expect(html).not.toContain('lucide-plane');
    expect(html).toContain('>Anvers<');
    expect(html).toContain('>Matadi<');
    expect(html).not.toContain('>Bruxelles<');
    expect(html).not.toContain('>Goma<');
  });

  it('an air result shows only its own route: plane, Bruxelles, no ship, no Matadi, no Anvers', () => {
    for (const dest of ['fih', 'gom'] as const) {
      const html = draw(result('air', dest));
      expect(count(html, 'lucide-plane')).toBe(1);
      expect(html).not.toContain('lucide-ship');
      expect(html).toContain('>Bruxelles<');
      expect(html).not.toContain('>Matadi<');
      expect(html).not.toContain('>Anvers<');
      expect(html).toContain(dest === 'gom' ? '>Goma<' : '>Kinshasa<');
    }
  });

  it('the sea line starts at the port of Antwerp, not in Brussels', () => {
    const html = draw(result('sea'));
    const [ax, ay] = data.cities.anr;
    // The dashed remainder (from the marker) ends at Kinshasa; the travelled part starts at Antwerp.
    expect(html).toContain(`d="M${ax.toFixed(1)} ${ay.toFixed(1)}L`);
  });
});
