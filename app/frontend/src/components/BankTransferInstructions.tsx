import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import { isBankTransferReady, orderPaymentReference, type BankTransferDetails } from '@/lib/bank-transfer';
import { cn } from '@/lib/utils';

/**
 * What a customer who chose "bank transfer" needs to pay an Achat & Envoi
 * order: amount, reference and Luna's account. When the admin has not filled
 * the account in yet (/admin/paiements), says Luna will send the details.
 */
export function BankTransferInstructions({
  details, orderId, total, className,
}: {
  details: BankTransferDetails | null;
  orderId: string;
  total: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const reference = orderPaymentReference(orderId);
  const amount = `${Number(total).toFixed(2)} €`;

  if (!isBankTransferReady(details)) {
    return (
      <div className={cn('rounded-lg border border-[#DCE5F0] bg-[#F5F8FC] p-4 text-left text-sm text-luna-ink', className)}>
        <p>{t('shop.transfer_details_pending', { amount, reference })}</p>
      </div>
    );
  }

  const note = lang === 'en' ? details.note_en : details.note_fr;
  const rows: Array<[string, string, boolean?]> = [
    [t('shop.transfer_amount'), amount],
    [t('shop.transfer_reference'), reference, true],
    [t('shop.transfer_holder'), details.account_holder],
    [t('shop.transfer_iban'), details.iban, true],
    ...(details.bic ? [[t('shop.transfer_bic'), details.bic, true] as [string, string, boolean]] : []),
    ...(details.bank_name ? [[t('shop.transfer_bank'), details.bank_name] as [string, string]] : []),
  ];

  return (
    <div className={cn('rounded-lg border border-[#DCE5F0] bg-[#F5F8FC] p-4 text-left text-sm text-luna-ink', className)}>
      <div className="flex items-center gap-2 font-semibold">
        <Landmark className="h-4 w-4" aria-hidden="true" /> {t('shop.transfer_title')}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="contents">
            <dt className="text-luna-body">{label}</dt>
            <dd className={cn('font-semibold break-all', mono && 'font-mono')}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-luna-body">{t('shop.transfer_reference_hint')}</p>
      {note && <p className="mt-2 whitespace-pre-line text-xs text-luna-body">{note}</p>}
    </div>
  );
}
