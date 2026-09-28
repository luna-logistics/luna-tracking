import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PricingChange } from '@/lib/pricing/diff';
import { describePricingPath, formatPricingValue } from './labels';

/**
 * Last step before a new grid goes live: every value that changes (old → new)
 * and, when a rate is set to 0, an explicit confirmation checkbox.
 */
export function PublishDialog({ open, onOpenChange, changes, zeroPaths, restoring, saving, onConfirm, lang }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: PricingChange[];
  /** Changed money fields now at 0 € — publishing them needs the checkbox. */
  zeroPaths: string[];
  /** The tariff equals the default (fallback) values. */
  restoring: boolean;
  saving: boolean;
  onConfirm: () => void;
  lang: 'fr' | 'en';
}) {
  const { t } = useTranslation();
  const [zeroOk, setZeroOk] = useState(false);
  useEffect(() => { if (open) setZeroOk(false); }, [open]);

  const sorted = [...changes].sort((a, b) => describePricingPath(a.path, t).order - describePricingPath(b.path, t).order);
  const blocked = saving || (zeroPaths.length > 0 && !zeroOk);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-luna-navy/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-xl focus:outline-none">
          <div className="border-b border-slate-100 px-5 pb-3 pt-5">
            <Dialog.Title className="text-lg font-semibold text-luna-navy">{t('admin_pricing.confirm_title')}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-600">
              {t(restoring ? 'admin_pricing.confirm_intro_restore' : 'admin_pricing.confirm_intro', { count: changes.length })}
            </Dialog.Description>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="divide-y divide-slate-100 text-sm">
              {sorted.map((c) => (
                <li key={c.path} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="text-slate-700">{describePricingPath(c.path, t).label}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="text-slate-500">{formatPricingValue(c.path, c.before, lang, t)}</span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-400">→</span>
                    <span className="sr-only">{t('admin_pricing.change_to')}</span>
                    <span className="font-semibold text-luna-navy">{formatPricingValue(c.path, c.after, lang, t)}</span>
                  </span>
                </li>
              ))}
            </ul>

            {zeroPaths.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('admin_pricing.confirm_zero_title')}
                </p>
                <ul className="mt-1 list-disc pl-6">
                  {zeroPaths.map((p) => <li key={p}>{describePricingPath(p, t).label}</li>)}
                </ul>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-luna-navy" checked={zeroOk} onChange={(e) => setZeroOk(e.target.checked)} />
                  <span>{t('admin_pricing.confirm_zero_check')}</span>
                </label>
              </div>
            )}

            <p className="mt-4 text-xs text-slate-500">{t('admin_pricing.documents_note')}</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={saving}>{t('admin_pricing.confirm_cancel')}</Button>
            </Dialog.Close>
            <Button type="button" variant="navy" disabled={blocked} onClick={onConfirm}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('admin_pricing.saving')}</> : t('admin_pricing.confirm_publish')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
