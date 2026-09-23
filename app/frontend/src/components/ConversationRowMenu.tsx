import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchiveRestore, MoreVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "…" menu on each inbox row: delete (soft, confirmed) — or restore in the
 *  deleted view — without having to open the conversation first. */
export function ConversationRowMenu({ deleted, label, onDelete, onRestore }: {
  deleted: boolean; label: string; onDelete: () => void; onRestore: () => void;
}) {
  const { t } = useTranslation();
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

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm';
  return (
    <div ref={ref} className="absolute right-1.5 top-2">
      <button type="button" aria-haspopup="menu" aria-expanded={open}
        aria-label={t('admin_support.row_actions', { name: label })} title={t('admin_support.row_actions', { name: label })}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-luna-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luna-blue">
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-8 z-20 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {deleted ? (
            <button type="button" role="menuitem" autoFocus onClick={() => { setOpen(false); onRestore(); }}
              className={cn(item, 'text-luna-navy hover:bg-slate-50')}>
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />{t('admin_support.restore')}
            </button>
          ) : (
            <button type="button" role="menuitem" autoFocus onClick={() => { setOpen(false); onDelete(); }}
              className={cn(item, 'text-red-700 hover:bg-red-50')}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />{t('admin_support.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
