import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Open/closed state remembered per browser (localStorage). A per-viewer
 * convenience only: storage can be unavailable (private window, blocked
 * site data) — every access is guarded and the panel then simply starts
 * in its default state.
 */
export function usePersistedOpen(storageKey: string, defaultOpen = true): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState<boolean>(() => {
    try {
      const v = window.localStorage.getItem(storageKey);
      return v === null ? defaultOpen : v === '1';
    } catch { return defaultOpen; }
  });
  const setOpen = (next: boolean) => {
    setOpenState(next);
    try { window.localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  return [open, setOpen];
}

/**
 * Admin info/settings block that can be folded away. Collapsing only hides
 * the body — the content (and its settings) stays mounted-on-open and
 * unchanged. `summary` is shown in the header while collapsed so the
 * current setting stays visible at a glance.
 */
export function CollapsiblePanel({
  storageKey, icon, title, summary, defaultOpen = true, className, children,
}: {
  storageKey: string;
  icon?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);
  const bodyId = useId();
  return (
    <section className={cn('mb-4 rounded-2xl border-2 border-amber-500 bg-amber-50', open ? 'p-4' : 'px-4 py-2.5', className)}>
      <header className={cn('flex items-center gap-2', open && 'mb-2')}>
        {icon}
        <h2 className="font-semibold text-luna-navy text-sm">{title}</h2>
        {!open && summary && <span className="min-w-0 truncate text-xs text-slate-600">— {summary}</span>}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-luna-navy hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-luna-navy"
        >
          {open ? t('common.collapse') : t('common.expand')}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </header>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
