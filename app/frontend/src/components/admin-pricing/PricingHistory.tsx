import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { PricingHistoryRow } from '@/lib/pricing/config';
import { describePricingPath, formatPricingValue } from './labels';

/**
 * /admin/tarifs change history: one entry per publication (newest first) —
 * when, who, what kind of change, then every changed value old → new.
 */
const PAGE = 10;

export function PricingHistory({ rows, lang }: { rows: PricingHistoryRow[] | null; lang: 'fr' | 'en' }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(PAGE);

  const groups = useMemo(() => {
    const out: { key: string; at: string; who: string | null; action: PricingHistoryRow['action']; rows: PricingHistoryRow[] }[] = [];
    for (const r of rows ?? []) {
      const key = `${r.config_id ?? '-'}|${r.changed_at}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else out.push({ key, at: r.changed_at, who: r.changed_by_email, action: r.action, rows: [r] });
    }
    for (const g of out) g.rows.sort((a, b) => describePricingPath(a.path, t).order - describePricingPath(b.path, t).order);
    return out;
  }, [rows, t]);

  if (rows === null) return <p className="text-sm text-slate-500">{t('admin_pricing.history_unavailable')}</p>;
  if (groups.length === 0) return <p className="text-sm text-slate-500">{t('admin_pricing.history_none')}</p>;

  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-BE', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <ol className="space-y-4">
        {groups.slice(0, shown).map((g) => (
          <li key={g.key} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <time dateTime={g.at} className="font-semibold text-luna-navy">{when(g.at)}</time>
              <span className="text-slate-600">
                {g.who ? t('admin_pricing.history_by', { who: g.who }) : t('admin_pricing.history_unknown_author')}
              </span>
              <span className={g.action === 'restore_defaults'
                ? 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900'
                : 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700'}>
                {t(`admin_pricing.history_action_${g.action}`)}
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {g.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-2">
                  <span className="text-slate-600">{describePricingPath(r.path, t).label}</span>
                  <span className="tabular-nums text-slate-500 line-through decoration-slate-300">{formatPricingValue(r.path, r.old_value, lang, t)}</span>
                  <span aria-hidden="true" className="text-slate-400">→</span>
                  <span className="sr-only">{t('admin_pricing.change_to')}</span>
                  <span className="tabular-nums font-medium text-luna-navy">{formatPricingValue(r.path, r.new_value, lang, t)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {groups.length > shown && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setShown((n) => n + PAGE)}>
          {t('admin_pricing.history_more')}
        </Button>
      )}
    </div>
  );
}
