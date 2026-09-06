import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Loader2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { createBusiness, CURRENCIES, type Currency } from '@/lib/businesses';
import { useBusiness } from '@/contexts/BusinessContext';
import { urlFor } from '@/lib/url/routes';
import { errorMessage } from '@/lib/errors';

/**
 * First-run for a professional account: create the business row.
 * Only the essentials — name + country + currency. The full company
 * profile (VAT, legal name, address) is filled from Paramètres later.
 */
export default function BusinessCreate() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const navigate = useNavigate();
  const { refresh, select } = useBusiness();

  const [name, setName] = useState('');
  const [country, setCountry] = useState('BE');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const biz = await createBusiness({ name, country, currency });
      await refresh();
      select(biz.id);
      navigate(urlFor('businessDashboard', lang), { replace: true });
    } catch (err) {
      console.error('[business-create] failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
      setBusy(false);
    }
  };

  return (
    <>
      <SEO title={t('business_create.meta_title')} noindex />
      <div className="min-h-screen bg-luna-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-luna-cyan/20 text-luna-navy mb-4">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-luna-navy">{t('business_create.title')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('business_create.intro')}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="name">{t('business_create.field_name')}</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" placeholder={t('business_create.field_name_placeholder')} />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label htmlFor="country">{t('business_create.field_country')}</Label>
                <Input id="country" required minLength={2} maxLength={2} value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} className="mt-1.5 font-mono uppercase" />
                <p className="mt-1 text-[11px] text-slate-500">{t('business_create.country_hint')}</p>
              </div>
              <div>
                <Label htmlFor="currency">{t('business_create.field_currency')}</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                  <SelectTrigger id="currency" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" variant="navy" className="w-full" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('business_create.submit')}
            </Button>
            <p className="text-[11px] text-slate-500 text-center">{t('business_create.later_hint')}</p>
          </form>
        </div>
      </div>
    </>
  );
}
