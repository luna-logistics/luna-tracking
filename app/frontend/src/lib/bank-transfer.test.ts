import { describe, expect, it } from 'vitest';
import { formatIban, isBankTransferReady, isValidIban, orderPaymentReference, EMPTY_BANK_DETAILS } from './bank-transfer';

describe('bank-transfer', () => {
  it('validates IBANs with the mod-97 check', () => {
    expect(isValidIban('BE68 5390 0754 7034')).toBe(true);
    expect(isValidIban('be68539007547034')).toBe(true);
    expect(isValidIban('FR14 2004 1010 0505 0001 3M02 606')).toBe(true);
    expect(isValidIban('BE68 5390 0754 7035')).toBe(false);
    expect(isValidIban('1234')).toBe(false);
    expect(isValidIban('')).toBe(true);
  });

  it('formats an IBAN in groups of four', () => {
    expect(formatIban(' be68539007547034 ')).toBe('BE68 5390 0754 7034');
  });

  it('builds a stable payment reference from the order id', () => {
    expect(orderPaymentReference('1a2b3c4d-0000-4000-8000-000000000000')).toBe('LUNA-1A2B3C4D');
  });

  it('needs at least the holder and the IBAN', () => {
    expect(isBankTransferReady(null)).toBe(false);
    expect(isBankTransferReady(EMPTY_BANK_DETAILS)).toBe(false);
    expect(isBankTransferReady({ ...EMPTY_BANK_DETAILS, account_holder: 'Luna', iban: 'BE68 5390 0754 7034' })).toBe(true);
  });
});
