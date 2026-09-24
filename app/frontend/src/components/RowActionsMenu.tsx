import { useEffect, useRef, useState, type ComponentType } from 'react';
import { MoreVertical, type LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RowAction = {
  key: string;
  label: string;
  icon: ComponentType<LucideProps>;
  onSelect: () => void;
  /** Destructive (delete): red. The caller still confirms before acting. */
  danger?: boolean;
};

/** The one "…" row menu used across admin + dashboard lists (support inbox,
 *  shipments, templates): a kebab button opening a small menu of actions.
 *  Closes on outside click / Escape. Destructive actions confirm in the
 *  caller, and are re-checked server-side — hiding the menu is UX, not
 *  security. */
export function RowActionsMenu({ label, actions, className, size = 'md' }: {
  /** Accessible name: "Actions — <row>". */
  label: string;
  actions: RowAction[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;
  const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm';
  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={cn('inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-luna-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-blue',
          size === 'sm' ? 'h-6 w-6' : 'h-7 w-7')}>
        <MoreVertical className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-8 z-20 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {actions.map((a, i) => (
            <button key={a.key} type="button" role="menuitem" autoFocus={i === 0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); a.onSelect(); }}
              className={cn(item, a.danger ? 'text-red-700 hover:bg-red-50' : 'text-luna-navy hover:bg-slate-50')}>
              <a.icon className="h-4 w-4" aria-hidden="true" />{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
