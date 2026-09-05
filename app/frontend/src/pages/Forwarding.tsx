import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Boxes, Truck, CheckCircle2 } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconCircle } from '@/components/IconCircle';
import { toast } from '@/components/ui/sonner';
import { submitForwardingRequest } from '@/lib/forwarding';
import { useContent, useSiteImage } from '@/contexts/SiteContentContext';
import { Ed } from '@/components/Ed';

export default function Forwarding() {
  const { t } = useTranslation();
  const metaTitle       = useContent('forwarding', 'meta_title',       t('forwarding.meta_title'));
  const metaDescription = useContent('forwarding', 'meta_description', t('forwarding.meta_description'));
  const pageTitle       = useContent('forwarding', 'page_title',       t('forwarding.page_title'));
  const pageIntro       = useContent('forwarding', 'intro',            t('forwarding.intro'));
  const ogImage         = useSiteImage('forwarding_og', '') || undefined;
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const est = String(form.get('estimated_value') ?? '').trim();
      await submitForwardingRequest({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? '') || null,
        origin_country: String(form.get('origin_country') ?? ''),
        description: String(form.get('description') ?? ''),
        estimated_value: est ? Number(est) : null,
      });
      setSubmitted(true);
      toast.success(t('forwarding.form_success_title'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[forwarding] submit failed', err);
      toast.error(t('common.error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { icon: Mail, title: t('forwarding.how_step1_title'), body: t('forwarding.how_step1_body') },
    { icon: Truck, title: t('forwarding.how_step2_title'), body: t('forwarding.how_step2_body') },
    { icon: Boxes, title: t('forwarding.how_step3_title'), body: t('forwarding.how_step3_body') },
  ];

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} image={ogImage} />

      <section className="bg-luna-gradient text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <Ed page="forwarding" field="page_title" as="h1" className="text-3xl sm:text-4xl font-bold block">
            {pageTitle}
          </Ed>
          <Ed page="forwarding" field="intro" as="p" multiline className="mt-3 text-white/90 max-w-2xl block">
            {pageIntro}
          </Ed>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-luna-navy text-center">{t('forwarding.how_title')}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 text-center shadow-sm">
                <div className="relative inline-block">
                  <IconCircle icon={s.icon} variant="onLight" label={s.title} />
                  <span className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-luna-cyan text-luna-navy text-xs font-bold ring-2 ring-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-luna-navy">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-luna-navy text-center">{t('forwarding.examples_title')}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-luna-blue font-semibold">🇺🇸 → 🇨🇩</div>
              <h3 className="mt-2 text-lg font-semibold text-luna-navy">{t('forwarding.example_us_title')}</h3>
              <p className="mt-2 text-sm text-slate-700">{t('forwarding.example_us_body')}</p>
            </div>
            <div className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-luna-blue font-semibold">🇨🇳 → 🇨🇩</div>
              <h3 className="mt-2 text-lg font-semibold text-luna-navy">{t('forwarding.example_cn_title')}</h3>
              <p className="mt-2 text-sm text-slate-700">{t('forwarding.example_cn_body')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-luna-navy">{t('forwarding.form_title')}</h2>
          <p className="mt-2 text-slate-600">{t('forwarding.form_intro')}</p>

          {submitted ? (
            <div className="mt-8 rounded-2xl border-2 border-luna-cyan bg-white p-8 text-center shadow-sm">
              <CheckCircle2 className="mx-auto h-10 w-10 text-luna-blue" aria-hidden="true" />
              <h3 className="mt-3 text-xl font-semibold text-luna-navy">{t('forwarding.form_success_title')}</h3>
              <p className="mt-2 text-sm text-slate-600">{t('forwarding.form_success_body')}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">{t('forwarding.form_name')}</Label>
                  <Input id="name" name="name" required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email">{t('forwarding.form_email')}</Label>
                  <Input id="email" name="email" type="email" required className="mt-1.5" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="phone">{t('forwarding.form_phone')}</Label>
                  <Input id="phone" name="phone" type="tel" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="origin_country">{t('forwarding.form_origin_country')}</Label>
                  <Input id="origin_country" name="origin_country" required className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label htmlFor="description">{t('forwarding.form_description')}</Label>
                <Textarea id="description" name="description" rows={4} required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="estimated_value">{t('forwarding.form_estimated_value')}</Label>
                <Input id="estimated_value" name="estimated_value" type="number" min="0" step="0.01" className="mt-1.5" />
              </div>
              <div>
                <Button type="submit" variant="navy" size="lg" disabled={submitting}>
                  {submitting ? t('forwarding.form_submitting') : t('forwarding.form_submit')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
