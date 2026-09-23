import { describe, it, expect } from 'vitest';
import { buildTrackingView, brusselsParts, routeFraction } from './tracking-view';
import type { TrackingResult } from './tracking';

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

describe('tracking view', () => {
  it('legacy: delivered, dated steps, corridor, no invented mode/carrier', () => {
    const v = buildTrackingView(legacy, '2ddxcpg6pxp8')!;
    expect(v.status).toBe('delivered');
    expect(v.number).toBe('2DDXCPG6PXP8');
    expect(v.parcel).toBe('BRU202600001FIH 1/1');
    expect(v.times).toEqual({ pickup: '2026-07-20T18:04:23', in_transit: '2026-08-08T11:12:49', delivered: '2026-08-19T22:56:43' });
    expect([v.mode, v.carrier, v.corridor, v.from, v.to]).toEqual([null, null, 'be-cd', 'Bruxelles', 'Kinshasa']);
    expect(v.updatedAt).toBe('2026-08-19T22:56:43');
  });

  it('legacy: several parcels never show more progress than the slowest', () => {
    const r: TrackingResult = { ...legacy, positions: [...(legacy.status === 'ok' ? legacy.positions : []),
      { numeroColis: 'BRU202600001FIH 2/2', libelle: 'x', date: '2026-08-08T11:12:49', kind: 'in_transit' }] } as TrackingResult;
    expect(buildTrackingView(r, 'X')!.status).toBe('in_transit');
  });

  it('legacy: unreadable libelles → null (page keeps the plain list)', () => {
    const r: TrackingResult = { status: 'ok', source: 'legacy', positions: [{ numeroColis: 'A', libelle: 'Autre chose', kind: 'note' }] };
    expect(buildTrackingView(r, 'A')).toBeNull();
    const old: TrackingResult = { status: 'ok', source: 'legacy', positions: [{ numeroColis: 'A', libelle: 'Colis livré le 01-01-2026' }] };
    expect(buildTrackingView(old, 'A')).toBeNull();
  });

  it('native: status, mode, carrier, first time per step, corridor both ways', () => {
    const r: TrackingResult = {
      status: 'ok', source: 'luna', positions: [],
      shipment: {
        status: 'in_transit', mode: 'sea', carrier_name: 'Maersk', origin_city: 'Bruxelles', origin_country: 'BE',
        destination_city: 'Kinshasa', destination_country: 'CD',
        events: [
          { kind: 'created', to_status: null, created_at: '2026-09-02T08:14:00Z' },
          { kind: 'status_change', to_status: 'confirmed', created_at: '2026-09-03T07:02:00Z' },
          { kind: 'status_change', to_status: 'in_transit', created_at: '2026-09-09T04:45:00Z' },
        ],
      },
    };
    const v = buildTrackingView(r, 'uuid')!;
    expect([v.status, v.mode, v.carrier, v.corridor, v.timesAreUtc]).toEqual(['in_transit', 'sea', 'Maersk', 'be-cd', true]);
    expect(v.times.confirmed).toBe('2026-09-03T07:02:00Z');
    expect(buildTrackingView({ ...r, shipment: { ...r.shipment!, origin_country: 'CD', origin_city: 'Kinshasa', destination_country: 'BE', destination_city: 'Liège' } }, 'u')!.corridor).toBe('cd-be');
    expect(buildTrackingView({ ...r, shipment: { ...r.shipment!, destination_city: 'Lubumbashi' } }, 'u')!.corridor).toBeNull();
    expect(buildTrackingView({ ...r, shipment: { ...r.shipment!, status: 'weird' } }, 'u')).toBeNull();
  });

  it('native (shared link): reference as number, carrier ref, ETA only while undelivered', () => {
    const base: TrackingResult = {
      status: 'ok', source: 'luna', positions: [],
      shipment: {
        status: 'in_transit', mode: 'air', carrier_name: null, origin_city: null, origin_country: 'BE',
        destination_city: null, destination_country: 'CD', events: [],
        reference: 'LTL-2026-0042', tracking_number: 'SN123', estimated_delivery: '2026-10-02',
      },
    };
    const v = buildTrackingView(base, 'token-uuid')!;
    expect([v.number, v.carrierRef, v.eta, v.corridor]).toEqual(['LTL-2026-0042', 'SN123', '2026-10-02', 'be-cd']);
    expect(buildTrackingView({ ...base, shipment: { ...base.shipment!, status: 'delivered' } }, 't')!.eta).toBeNull();
  });

  it('dates: UTC instants shown in Brussels time, legacy strings as-is', () => {
    expect(brusselsParts('2026-09-09T04:45:00Z', true)).toEqual({ y: 2026, mo: 9, d: 9, hh: '06', mi: '45' });
    expect(brusselsParts('2026-08-19T22:56:43', false)).toEqual({ y: 2026, mo: 8, d: 19, hh: '22', mi: '56' });
  });

  it('route position per status (design table)', () => {
    expect(routeFraction('in_transit', 'sea', 0.974)).toBe(0.46);
    expect(routeFraction('customs', 'sea', 0.974)).toBe(0.974);
    expect(routeFraction('delivered', null, 0.974)).toBe(1);
  });
});
