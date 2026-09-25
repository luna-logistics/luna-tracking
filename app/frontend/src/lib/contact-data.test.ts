import { describe, expect, it } from 'vitest';
import { OFFICE_HOURS, brusselsWindow, computeOpeningStatus, officeHoursRows } from './contact-data';

// Brussels is UTC+2 in late September/October (CEST), UTC+1 from November.
const at = (iso: string) => new Date(iso);

describe('office hours (Mon–Fri 10h–18h, Sat 12h–18h, Sun closed)', () => {
  it('groups the week into two rows', () => {
    const rows = officeHoursRows();
    expect(rows).toEqual([
      { from: 1, to: 5, open: 10, close: 18 },
      { from: 6, to: 6, open: 12, close: 18 },
    ]);
    expect(rows.map(brusselsWindow)).toEqual(['10h00 – 18h00', '12h00 – 18h00']);
    expect(OFFICE_HOURS[0]).toBeNull();
  });

  it('weekday: closed at 9:30, open at 10:00, closed from 18:00', () => {
    // Friday 2026-09-25
    expect(computeOpeningStatus(at('2026-09-25T07:30:00Z'))).toMatchObject({ open: false, reopenOffset: 0, reopenHour: 10 });
    expect(computeOpeningStatus(at('2026-09-25T08:00:00Z')).open).toBe(true);
    expect(computeOpeningStatus(at('2026-09-25T15:59:00Z')).open).toBe(true);
    // Friday 18:00 → next opening is Saturday at 12h
    expect(computeOpeningStatus(at('2026-09-25T16:00:00Z'))).toMatchObject({ open: false, reopenOffset: 1, reopenWeekday: 6, reopenHour: 12 });
  });

  it('Saturday: closed before 12h, open 12h–18h', () => {
    expect(computeOpeningStatus(at('2026-09-26T09:00:00Z'))).toMatchObject({ open: false, reopenOffset: 0, reopenHour: 12 });
    expect(computeOpeningStatus(at('2026-09-26T11:30:00Z')).open).toBe(true);
    // Saturday evening → Monday 10h (Sunday closed)
    expect(computeOpeningStatus(at('2026-09-26T17:00:00Z'))).toMatchObject({ open: false, reopenOffset: 2, reopenWeekday: 1, reopenHour: 10 });
  });

  it('Sunday and Belgian public holidays are closed', () => {
    expect(computeOpeningStatus(at('2026-09-27T10:00:00Z'))).toMatchObject({ open: false, reopenOffset: 1, reopenWeekday: 1, reopenHour: 10 });
    // Wednesday 2026-11-11 (Armistice, CET = UTC+1) → Thursday 10h
    expect(computeOpeningStatus(at('2026-11-11T11:00:00Z'))).toMatchObject({ open: false, reopenOffset: 1, reopenWeekday: 4, reopenHour: 10 });
  });
});
