import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PackageSearch, AlertTriangle } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchTrackingStatus, type TrackingResult } from '@/lib/tracking';
import { useContent } from '@/contexts/SiteContentContext';

export default function Tracking() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'fr';
  const metaTitle       = useContent('tracking', 'meta_title',       t('tracking.meta_title'));
  const metaDescription = useContent('tracking', 'meta_description', t('tracking.meta_description'));
  const pageTitle       = useContent('tracking', 'page_title',       t('tracking.page_title'));
  const pageIntro       = useContent('tracking', 'page_intro',       t('tracking.page_intro'));
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const r = await fetchTrackingStatus(password.trim(), lang);
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO title={metaTitle} description={metaDescription} />

      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-4 text-luna-navy">
            <PackageSearch className="h-7 w-7" />
            <h1 className="text-3xl font-bold">{pageTitle}</h1>
          </div>
          <p className="text-slate-600 mb-8">{pageIntro}</p>

          <form onSubmit={onSubmit} className="rounded-2xl border-2 border-luna-blue/30 bg-white p-6 shadow-sm">
            <Label htmlFor="tracking-password" className="text-luna-navy">
              {t('tracking.password_label')}
            </Label>
            <Input
              id="tracking-password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('tracking.password_placeholder')}
              className="mt-2"
              required
            />
            <Button type="submit" variant="navy" size="lg" className="mt-4 w-full sm:w-auto" disabled={loading}>
              {loading ? t('tracking.loading') : t('tracking.submit')}
            </Button>
          </form>

          {result && (
            <div className="mt-6" role="status" aria-live="polite">
              {result.status === 'unavailable' && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5" aria-hidden="true" />
                    <div>
                      <h2 className="font-semibold text-amber-900">{t('tracking.unavailable_title')}</h2>
                      <p className="mt-1 text-sm text-amber-900/90">{result.message || t('tracking.unavailable_body')}</p>
                    </div>
                  </div>
                </div>
              )}
              {result.status === 'not_found' && (
                <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-5">
                  <p className="text-sm text-slate-700">{t('tracking.empty_result')}</p>
                </div>
              )}
              {result.status === 'ok' && (
                <div className="rounded-xl border-2 border-luna-blue/30 bg-white p-5">
                  <ul className="divide-y divide-slate-100">
                    {result.positions.map((p) => (
                      <li key={p.numeroColis} className="py-3 flex items-start justify-between gap-4">
                        <div>
                          <div className="font-mono text-sm text-luna-navy">{p.numeroColis}</div>
                          <div className="text-sm text-slate-600">{p.libelle}</div>
                        </div>
                        {p.date && <div className="text-xs text-slate-500 shrink-0">{p.date}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
