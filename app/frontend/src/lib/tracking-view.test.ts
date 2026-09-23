import { describe, it, expect } from 'vitest';
import { buildTrackingView, formatWhen, routeFor, routeFraction, wallTimeToUtc } from './tracking-view';
import { shipmentFromPublicPayload, type TrackingResult } from './tracking';

// Real shape returned by the FileMaker bridge for 2DDXCPG6PXP8 (2026-09-24).
const legacy: TrackingResult = {
  status: 'ok', source: 'legacy',
  positions: [
    { numeroColis: 'BRU202600001FIH 1/1', libelle: "Remise du colis par l'expéditeur en nos dépots de BRUXELLES le 20-07-2026 à 18:04:23",
      date: '2026-07-20T18:04:23', kind: 'picked_up', originCity: 'BRUXELLES' },
    { numeroColis: 'BRU202600001FIH 1/1', libelle: 'Colis en Transit depuis BRUXELLES vers KINSHASA le 08-08-2026 à 11:12:49',
      date: '2026-08-08T11:12:49', kind: 'in_transit', originCity: 'BRUXELLES', destinationCity: 'KINSHASA' },
    { numeroColis: 'BRU202600001FIH 1/1', libelle: 'Colis livré le 19-08-2026 à 22:56:43', date: '2026-08-19T22:56:43', kind: 'delivered' },
  ],
};

const native = (over: Partial<Parameters<typeof shipmentFromPublicPayload>[0]> = {}): TrackingResult => ({
  status: 'ok', source: 'luna', positions: [],
  shipment: shipmentFromPublicPayload({
    reference: 'SHP-000042', status: 'in_transit', mode: 'sea', carrier_name: 'Maersk', tracking_number: null,
    origin_city: 'Bruxelles', origin_country: 'BE', destination_city: 'Kinshasa', destination_country: 'CD',
    events: [
      { kind: 'created', to_status: 'draft', created_at: '2026-09-02T08:14:00Z' },
      { kind: 'status_change', to_status: 'confirmed', created_at: '2026-09-03T07:02:00Z' },
      { kind: 'status_change', to_status: 'in_transit', created_at: '2026-09-09T04:45:00+00:00' },
    ],
    ...over,
  }),
});

describe('tracking view', () => {
  it('legacy: delivered, Brussels wall times → UTC instants, route to Kinshasa, no invented mode/carrier', () => {
    const v = buildTrackingView(legacy, '2ddxcpg6pxp8')!;
    expect(v.status).toBe('delivered');
    expect(v.number).toBe('2DDXCPG6PXP8');
    expect(v.parcel).toBe('BRU202600001FIH 1/1');
    // August = CEST (UTC+2)
    expect(v.times).toEqual({ pickup: '2026-07-20T16:04:23.000Z', in_transit: '2026-08-08T09:12:49.000Z', delivered: '2026-08-19T20:56:43.000Z' });
    expect([v.mode, v.carrier, v.fromCity, v.toCity]).toEqual([null, null, 'Bruxelles', 'Kinshasa']);
    expect(v.route).toEqual({ dest: 'fih', reverse: false });
  });

  it('legacy: Goma is Goma — from the libelle, or the parcel label when the libelle names no city', () => {
    const goma: TrackingResult = { status: 'ok', source: 'legacy', positions: [
      { numeroColis: 'BRU202600007GOM 1/1', libelle: 'Colis en Transit depuis BRUXELLES vers GOMA le 01-09-2026 à 10:00:00',
        date: '2026-09-01T10:00:00', kind: 'in_transit', originCity: 'BRUXELLES', destinationCity: 'GOMA' },
    ] };
    const v = buildTrackingView(goma, 'X')!;
    expect([v.toCity, v.route]).toEqual(['Goma', { dest: 'gom', reverse: false }]);
    const onlyPickup: TrackingResult = { status: 'ok', source: 'legacy', positions: [
      { numeroColis: 'BRU202600007GOM 1/1', libelle: 'Remise…', date: '2026-09-01T10:00:00', kind: 'picked_up' },
    ] };
    expect(buildTrackingView(onlyPickup, 'X')!.toCity).toBe('Goma');
  });

  it('legacy: an unrecorded destination is never defaulted to Kinshasa (no map, no city)', () => {
    const r: TrackingResult = { status: 'ok', source: 'legacy', positions: [
      { numeroColis: 'COLIS-1', libelle: 'Remise…', date: '2026-09-01T10:00:00', kind: 'picked_up', originCity: 'BRUXELLES' },
    ] };
    const v = buildTrackingView(r, 'X')!;
    expect([v.toCity, v.to, v.route]).toEqual([null, null, null]);
  });

  it('legacy: several parcels never show more progress than the slowest', () => {
    const r = { ...legacy, positions: [...(legacy.status === 'ok' ? legacy.positions : []),
      { numeroColis: 'BRU202600001FIH 2/2', libelle: 'x', date: '2026-08-08T11:12:49', kind: 'in_transit' as const }] } as TrackingResult;
    expect(buildTrackingView(r, 'X')!.status).toBe('in_transit');
  });

  it('legacy: unreadable libelles → null (page keeps the plain list)', () => {
    const r: TrackingResult = { status: 'ok', source: 'legacy', positions: [{ numeroColis: 'A', libelle: 'Autre chose', kind: 'note' }] };
    expect(buildTrackingView(r, 'A')).toBeNull();
    const old: TrackingResult = { status: 'ok', source: 'legacy', positions: [{ numeroColis: 'A', libelle: 'Colis livré le 01-01-2026' }] };
    expect(buildTrackingView(old, 'A')).toBeNull();
  });

  it('native: reference, mode, carrier, first time per step, route per real destination', () => {
    const v = buildTrackingView(native(), 'token-uuid')!;
    expect([v.number, v.status, v.mode, v.carrier]).toEqual(['SHP-000042', 'in_transit', 'sea', 'Maersk']);
    expect(v.times.confirmed).toBe('2026-09-03T07:02:00.000Z');
    expect(v.route).toEqual({ dest: 'fih', reverse: false });
    expect(buildTrackingView(native({ mode: 'air', destination_city: 'Goma' }), 't')!.route).toEqual({ dest: 'gom', reverse: false });
    // Sea never goes to Goma on this map → no map rather than a wrong one.
    expect(buildTrackingView(native({ mode: 'sea', destination_city: 'Goma' }), 't')!.route).toBeNull();
    expect(buildTrackingView(native({ destination_city: 'Lubumbashi' }), 't')!.route).toBeNull();
    expect(buildTrackingView(native({ mode: 'air', origin_country: 'CD', origin_city: 'Goma', destination_country: 'BE', destination_city: 'Bruxelles' }), 't')!.route)
      .toEqual({ dest: 'gom', reverse: true });
    expect(buildTrackingView(native({ status: 'weird' }), 't')).toBeNull();
  });

  it('no estimated delivery reaches the view from any entry point', () => {
    const s = shipmentFromPublicPayload({ status: 'in_transit', estimated_delivery: '2026-10-02' } as Parameters<typeof shipmentFromPublicPayload>[0]);
    expect('estimated_delivery' in s).toBe(false);
  });

  it('routeFor: sea only to Kinshasa, Goma is air; unknown pairs → null', () => {
    expect(routeFor('sea', 'Anvers', 'Kinshasa')).toEqual({ dest: 'fih', reverse: false });
    expect(routeFor(null, 'Bruxelles', 'Goma')).toEqual({ dest: 'gom', reverse: false });
    expect(routeFor('air', 'Paris', 'Kinshasa')).toBeNull();
    expect(routeFor('air', 'Bruxelles', null)).toBeNull();
  });

  it('times: wall clock → instant, then shown in the VIEWER zone', () => {
    expect(wallTimeToUtc('2026-08-19T22:56:43', 'Europe/Brussels')).toBe('2026-08-19T20:56:43.000Z');
    expect(wallTimeToUtc('2026-01-10T12:00:00', 'Europe/Brussels')).toBe('2026-01-10T11:00:00.000Z'); // winter, UTC+1
    const iso = '2026-08-19T20:56:43.000Z';
    expect(formatWhen(iso, 'fr', ' à ', 'Europe/Brussels')).toBe('mer. 19 août à 22:56');
    expect(formatWhen(iso, 'fr', ' à ', 'Africa/Kinshasa')).toBe('mer. 19 août à 21:56');
    expect(formatWhen(iso, 'en', ', ', 'America/New_York')).toBe('Wed 19 Aug, 16:56');
  });

  it('route position per status (design table)', () => {
    expect(routeFraction('in_transit', 'sea', 0.974)).toBe(0.46);
    expect(routeFraction('customs', 'sea', 0.974)).toBe(0.974);
    expect(routeFraction('delivered', null, 0.974)).toBe(1);
  });
});
