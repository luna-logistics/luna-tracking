import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '@/components/SEO';
import { Switch } from '@/components/ui/switch';
import { fetchDestinationCities, toggleCityStatus, type DestinationCity } from '@/lib/cities';
import { toast } from '@/components/ui/sonner';

/**
 * Admin: destination cities table with an active / coming-soon toggle. The
 * quote form on /tarifs reads the same table, so a toggle here immediately
 * moves a city between selectable and greyed-out.
 */
export default function AdminCities() {
  const { t } = useTranslation();
  const [cities, setCities] = useState<DestinationCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const rows = await fetchDestinationCities();
    setCities(rows);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const onToggle = async (city: DestinationCity, next: boolean) => {
    setPendingId(city.id);
    const target = next ? 'active' : 'coming_soon';
    // Optimistic update — revert on failure so a network error is honest.
    setCities((prev) => prev.map((c) => (c.id === city.id ? { ...c, status: target } : c)));
    try {
      await toggleCityStatus(city.id, target);
      toast.success(city.name);
    } catch (err) {
      toast.error(t('common.error_generic'));
      setCities((prev) => prev.map((c) => (c.id === city.id ? { ...c, status: city.status } : c)));
      // eslint-disable-next-line no-console
      console.error('[admin-cities] toggle failed', err);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <SEO title={t('admin.cities_title')} noindex />
      <h1 className="text-2xl font-bold text-luna-navy">{t('admin.cities_title')}</h1>
      <p className="mt-3 text-slate-600 max-w-2xl">{t('admin.cities_intro')}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-luna-navy">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.cities_col_name')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.cities_col_country')}</th>
              <th className="text-left px-4 py-3 font-semibold">{t('admin.cities_col_status')}</th>
              <th className="text-right px-4 py-3 font-semibold">{t('admin.cities_col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t('common.loading')}</td></tr>
            )}
            {!loading && cities.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">—</td></tr>
            )}
            {cities.map((c) => {
              const active = c.status === 'active';
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-luna-navy">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600 uppercase font-mono text-xs">{c.country_code}</td>
                  <td className="px-4 py-3">
                    <span className={
                      active
                        ? 'inline-flex items-center rounded-full bg-luna-cyan/20 text-luna-navy px-2.5 py-1 text-xs font-semibold'
                        : 'inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-semibold'
                    }>
                      {active ? t('admin.cities_status_active') : t('admin.cities_status_coming_soon')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <label className="text-xs text-slate-600" htmlFor={`toggle-${c.id}`}>
                        {active ? t('admin.cities_toggle_deactivate') : t('admin.cities_toggle_activate')}
                      </label>
                      <Switch
                        id={`toggle-${c.id}`}
                        checked={active}
                        disabled={pendingId === c.id}
                        onCheckedChange={(v) => onToggle(c, v)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
