import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import {
  EMPTY_BANK_DETAILS, fetchBankTransferDetails, formatIban, isBankTransferReady, isValidIban,
  saveBankTransferDetails, type BankTransferDetails,
} from '@/lib/bank-transfer';

/**
 * Admin: the bank account customers wire to when they pick "bank transfer"
 * at the Achat & Envoi checkout. Stored in platform_settings, so a save is
 * live on the checkout immediately. Card payment (Stripe) needs nothing here.
 */
export default function AdminPayments() {
  const { t } = useTranslation();
  const [form, setForm] = useState<BankTransferDetails>(EMPTY_BANK_DETAILS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchBankTransferDetails().then((d) => { setForm(d); setLoading(false); });
  }, []);

  const set = (k: keyof BankTransferDetails) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const ibanInvalid = !isValidIban(form.iban);
  const ready = isBankTransferReady(form);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ibanInvalid) { toast.error(t('admin.payments_iban_invalid')); return; }
    setSaving(true);
    try {
      await saveBankTransferDetails(form);
      setForm((f) => ({ ...f, iban: formatIban(f.iban), bic: f.bic.replace(/\s+/g, '').toUpperCase() }));
      toast.success(t('admin.payments_saved'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[admin-payments] save failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SEO title={t('admin.payments_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.payments_title')}</h1>
      <p className="mt-3 text-slate-600 max-w-2xl">{t('admin.payments_intro')}</p>

      <div className="mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-luna-navy" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-luna-navy">{t('admin.payments_bank_title')}</h2>
            <p className={ready ? 'mt-1 text-sm text-emerald-700' : 'mt-1 text-sm text-amber-700'}>
              {ready ? t('admin.payments_status_ready') : t('admin.payments_status_empty')}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-500">{t('common.loading')}</div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <div>
              <Label htmlFor="account_holder">{t('admin.payments_account_holder')}</Label>
              <Input id="account_holder" value={form.account_holder} onChange={set('account_holder')} className="mt-1.5" autoComplete="off" />
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="iban">{t('admin.payments_iban')}</Label>
                <Input
                  id="iban" value={form.iban} onChange={set('iban')} className="mt-1.5 font-mono" autoComplete="off"
                  placeholder="BE00 0000 0000 0000" aria-invalid={ibanInvalid} aria-describedby={ibanInvalid ? 'iban-error' : undefined}
                />
                {ibanInvalid && <p id="iban-error" className="mt-1 text-xs text-red-600">{t('admin.payments_iban_invalid')}</p>}
              </div>
              <div>
                <Label htmlFor="bic">{t('admin.payments_bic')}</Label>
                <Input id="bic" value={form.bic} onChange={set('bic')} className="mt-1.5 font-mono" autoComplete="off" />
              </div>
            </div>
            <div>
              <Label htmlFor="bank_name">{t('admin.payments_bank_name')}</Label>
              <Input id="bank_name" value={form.bank_name} onChange={set('bank_name')} className="mt-1.5" autoComplete="off" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="note_fr">{t('admin.payments_note_fr')}</Label>
                <Textarea id="note_fr" value={form.note_fr} onChange={set('note_fr')} rows={3} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="note_en">{t('admin.payments_note_en')}</Label>
                <Textarea id="note_en" value={form.note_en} onChange={set('note_en')} rows={3} className="mt-1.5" />
              </div>
            </div>
            <p className="text-xs text-slate-500">{t('admin.payments_note_hint')}</p>
            <div>
              <Button type="submit" variant="navy" disabled={saving || ibanInvalid}>
                {saving ? t('admin.payments_saving') : t('admin.payments_save')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
