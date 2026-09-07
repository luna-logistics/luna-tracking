import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, ArrowRight, Loader2, Plane, Ship, Truck, Train, Package as PackageIcon } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateRates, type RateMode, type RateQuote } from '@/lib/rates';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

/**
 * Public rate calculator. Backed by the calculate_rates() RPC — same
 * function powers /api/v1/rates. Never sees internal cost or markup.
 */

const MODES: (RateMode | 'any')[] = ['any', 'air', 'sea', 'road'];

// Small country set we currently price. Expand as rate_rules grow.
const COUNTRIES: { code: string; label_fr: string; label_en: string }[] = [
  { code: 'BE', label_fr: 'Belgique',                       label_en: 'Belgium' },
  { code: 'CD', label_fr: 'RD Congo',                       label_en: 'DR Congo' },
  { code: 'FR', label_fr: 'France',                         label_en: 'France' },
  { code: 'NL', label_fr: 'Pays-Bas',                       label_en: 'Netherlands' },
];

export default function RateCalculator() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';
  const [origin, setOrigin] = useState('BE');
  const [destination, setDestination] = useState('CD');
  const [mode, setMode] = useState<RateMode | 'any'>('any');
  const [weight, setWeight] = useState('10');
  const [volume, setVolume] = useState('');
  const [results, setResults] = useState<RateQuote[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const rates = await calculateRates({
        origin, destination,
        mode: mode === 'any' ? null : mode,
        weight_kg: weight === '' ? 0 : Number(weight),
        volume_m3: volume === '' ? 0 : Number(volume),
      });
      setResults(rates);
    } catch (err) {
      setError(errorMessage(err, t('rate_calc.error_generic')));
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  const label = (code: string) => {
    const c = COUNTRIES.find((x) => x.code === code);
    if (!c) return code;
    return lang === 'en' ? c.label_en : c.label_fr;
  };

  return (
    <div className="min-h-[70vh]">
      <SEO
        title={t('rate_calc.meta_title')}
        description={t('rate_calc.meta_description')}
      />
      <section className="bg-luna-gradient text-white">
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Calculator className="h-10 w-10 mx-auto opacity-90" aria-hidden="true" />
          <h1 className="mt-3 text-3xl md:text-4xl font-bold">{t('rate_calc.heading')}</h1>
          <p className="mt-3 text-white/90 text-base md:text-lg">{t('rate_calc.intro')}</p>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
          <form onSubmit={submit} className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('rate_calc.field_origin')}>
                <Select value={origin} onValueChange={setOrigin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{label(c.code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('rate_calc.field_destination')}>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{label(c.code)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('rate_calc.field_mode')}>
                <Select value={mode} onValueChange={(v) => setMode(v as RateMode | 'any')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === 'any' ? t('rate_calc.mode_any') : t(`shipment_mode.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('rate_calc.field_weight')}>
                <Input type="number" step="0.01" min="0" value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="10" />
              </Field>
              <Field label={t('rate_calc.field_volume')}>
                <Input type="number" step="0.001" min="0" value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="0.15" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="navy" disabled={busy || origin === destination}>
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" />{t('rate_calc.computing')}</>
                  : <><Calculator className="h-4 w-4" />{t('rate_calc.compute')}</>
                }
              </Button>
            </div>
            {origin === destination && (
              <p className="text-xs text-amber-800">{t('rate_calc.same_country_warning')}</p>
            )}
          </form>

          {error && (
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {results && results.length === 0 && (
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 text-center text-slate-600">
              {t('rate_calc.no_results')}
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-luna-navy">
                {t('rate_calc.results_title', { count: results.length })}
              </h2>
              {results.map((r, i) => <RateCard key={i} rate={r} rank={i} />)}
              <p className="text-xs text-slate-500 pt-2 text-center">
                {t('rate_calc.footer_note')}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RateCard({ rate, rank }: { rate: RateQuote; rank: number }) {
  const { t } = useTranslation();
  const Icon = modeIcon(rate.service_mode);
  const cheapest = rank === 0;
  return (
    <div className={cn(
      'rounded-2xl border-2 p-4 flex items-center gap-4 bg-white',
      cheapest ? 'border-emerald-400' : 'border-slate-200',
    )}>
      <div className={cn(
        'shrink-0 rounded-xl p-3',
        cheapest ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600',
      )}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-luna-navy">
          {t(`shipment_mode.${rate.service_mode}`)}
          {cheapest && (
            <span className="ml-2 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              {t('rate_calc.badge_cheapest')}
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {rate.transit_days_min && rate.transit_days_max
            ? t('rate_calc.transit_days', { min: rate.transit_days_min, max: rate.transit_days_max })
            : t('rate_calc.transit_days_unknown')}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-luna-navy">{rate.customer_price.toLocaleString()} {rate.currency}</p>
        <p className="text-xs text-slate-500">{t('rate_calc.price_excl_tax')}</p>
      </div>
    </div>
  );
}

function modeIcon(mode: RateMode) {
  switch (mode) {
    case 'air':  return Plane;
    case 'sea':  return Ship;
    case 'road': return Truck;
    case 'rail': return Train;
    default:     return PackageIcon;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-luna-navy text-xs uppercase tracking-wide">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
