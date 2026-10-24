// @vitest-environment jsdom
/**
 * /admin/paiements and the customer-facing transfer block, in the DOM. Only
 * the Supabase-backed read/write is mocked.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@/locales/fr.json';
import { EMPTY_BANK_DETAILS } from '@/lib/bank-transfer';
import { BankTransferInstructions } from '@/components/BankTransferInstructions';

const saveBankTransferDetails = vi.fn(async () => undefined);

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/components/SEO', () => ({ SEO: () => null }));
vi.mock('@/lib/bank-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bank-transfer')>()),
  fetchBankTransferDetails: async () => ({ ...(await importOriginal<typeof import('@/lib/bank-transfer')>()).EMPTY_BANK_DETAILS }),
  saveBankTransferDetails: (d: unknown) => saveBankTransferDetails(d as never),
}));

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'fr', resources: { fr: { translation: fr } }, interpolation: { escapeValue: false } });
});
afterEach(cleanup);

describe('AdminPayments', () => {
  it('blocks an invalid IBAN and saves a valid one', async () => {
    const { default: AdminPayments } = await import('./AdminPayments');
    render(<AdminPayments />);
    const iban = await screen.findByLabelText('IBAN');
    expect(screen.getByText(/Coordonnées incomplètes/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Bénéficiaire (titulaire du compte)'), { target: { value: 'Luna Tracking Logistics' } });
    fireEvent.change(iban, { target: { value: 'BE68 5390 0754 7035' } });
    expect(screen.getByText(/Cet IBAN n'est pas valide/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(iban, { target: { value: 'be68539007547034' } });
    expect(screen.getByText(/Coordonnées complètes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveBankTransferDetails).toHaveBeenCalledTimes(1));
    expect(saveBankTransferDetails).toHaveBeenCalledWith(expect.objectContaining({
      account_holder: 'Luna Tracking Logistics', iban: 'be68539007547034',
    }));
  });
});

describe('BankTransferInstructions', () => {
  const orderId = '1a2b3c4d-0000-4000-8000-000000000000';

  it('says the team will send the details while the account is not filled in', () => {
    render(<BankTransferInstructions details={EMPTY_BANK_DETAILS} orderId={orderId} total={42.5} />);
    expect(screen.getByText(/Notre équipe vous communique nos coordonnées bancaires pour régler 42.50 €/)).toBeTruthy();
    expect(screen.getByText(/LUNA-1A2B3C4D/)).toBeTruthy();
  });

  it('shows amount, reference and account once filled in', () => {
    render(
      <BankTransferInstructions
        details={{ ...EMPTY_BANK_DETAILS, account_holder: 'Luna Tracking Logistics', iban: 'BE68 5390 0754 7034', bic: 'GKCCBEBB', note_fr: 'Merci !' }}
        orderId={orderId} total={42.5}
      />,
    );
    expect(screen.getByText('42.50 €')).toBeTruthy();
    expect(screen.getByText('LUNA-1A2B3C4D')).toBeTruthy();
    expect(screen.getByText('BE68 5390 0754 7034')).toBeTruthy();
    expect(screen.getByText('GKCCBEBB')).toBeTruthy();
    expect(screen.getByText('Merci !')).toBeTruthy();
    expect(screen.queryByText('Banque')).toBeNull();
  });
});
