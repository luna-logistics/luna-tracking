import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchDestinationCities, type DestinationCity } from '@/lib/cities';
import { toast } from '@/components/ui/sonner';

export default function Pricing() {
  const { t } = useTranslation();
  const [cities, setCities] = useState<DestinationCity[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchDestinationCities().then(setCities);
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    // No backend yet — this is the confirmation-only flow specified for now.
    // A future chantier wires the form to a Supabase table + Resend email.
    await new Promise((r) => setTimeout(r, 500));
    setSubmitting(false);
    setSubmitted(true);
    toast.success(t('pricing.success_title'));
  };

  return (
    <>
      <SEO title={t('pricing.meta_title')} description={t('pricing.meta_description')} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold text-luna-navy">{t('pricing.page_title')}</h1>
          <p className="mt-3 text-slate-600">{t('pricing.page_intro')}</p>

          {submitted ? (
            <div className="mt-8 rounded-2xl border-2 border-luna-cyan bg-white p-8 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-10 w-10 text-luna-blue" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-semibold text-luna-navy">{t('pricing.success_title')}</h2>
              <p className="mt-2 text-sm text-slate-600">{t('pricing.success_body')}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="origin" className="text-luna-navy">{t('pricing.origin_label')}</Label>
                  <Input id="origin" name="origin" placeholder={t('pricing.origin_placeholder')} required className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="destination" className="text-luna-navy">{t('pricing.destination_label')}</Label>
                  <Select name="destination" required>
                    <SelectTrigger id="destination" className="mt-2">
                      <SelectValue placeholder={t('pricing.destination_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem
                          key={c.id}
                          value={c.slug}
                          disabled={c.status !== 'active'}
                        >
                          {c.name}
                          {c.status !== 'active' && (
                            <span className="ml-2 text-xs text-slate-500">
                              — {t('pricing.destination_coming_soon')}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="weight" className="text-luna-navy">{t('pricing.weight_label')}</Label>
                  <Input id="weight" name="weight" type="number" min="0" step="0.1" placeholder={t('pricing.weight_placeholder')} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="volume" className="text-luna-navy">{t('pricing.volume_label')}</Label>
                  <Input id="volume" name="volume" type="number" min="0" step="0.01" placeholder={t('pricing.volume_placeholder')} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="mode" className="text-luna-navy">{t('pricing.mode_label')}</Label>
                  <Select name="mode" defaultValue="any">
                    <SelectTrigger id="mode" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('pricing.mode_any')}</SelectItem>
                      <SelectItem value="air">{t('pricing.mode_air')}</SelectItem>
                      <SelectItem value="sea">{t('pricing.mode_sea')}</SelectItem>
                      <SelectItem value="ground">{t('pricing.mode_ground')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="name" className="text-luna-navy">{t('pricing.name_label')}</Label>
                  <Input id="name" name="name" autoComplete="name" required className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="email" className="text-luna-navy">{t('pricing.email_label')}</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-luna-navy">{t('pricing.phone_label')}</Label>
                  <Input id="phone" name="phone" type="tel" autoComplete="tel" className="mt-2" />
                </div>
              </div>

              <div>
                <Label htmlFor="message" className="text-luna-navy">{t('pricing.message_label')}</Label>
                <Textarea id="message" name="message" rows={4} className="mt-2" />
              </div>

              <div>
                <Button type="submit" variant="navy" size="lg" disabled={submitting}>
                  {submitting ? t('pricing.sending') : t('pricing.submit')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
