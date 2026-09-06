import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useBlockHidden, useSiteContentContext } from '@/contexts/SiteContentContext';
import { useEditMode } from '@/contexts/EditModeContext';
import { setBlockHidden } from '@/lib/site-content';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';

/**
 * Wraps a content section (hero, pillars grid, examples row, …) so an
 * admin can HIDE it from the public site without a redeploy — just a DB
 * flag. Non-admin visitors and non-edit-mode admins see nothing extra;
 * edit mode surfaces a small overlay in the top-right of every wrapped
 * block with an eye/eye-off toggle.
 *
 * Rules:
 *   - not admin edit mode + hidden → renders NOTHING (block gone from
 *     the DOM entirely — no reserved space, no SEO leak)
 *   - not admin edit mode + visible → renders children as-is (zero
 *     runtime chrome, so wrapping is free on the public site)
 *   - admin edit mode + visible → children + floating toggle button
 *   - admin edit mode + hidden → children rendered with 40% opacity +
 *     a "bloc masqué" ribbon, toggle available to bring it back
 *
 * `name` prop is a stable slug (kebab-case, e.g. "home-pillars",
 * "forwarding-examples") — that's what /admin/contenus references and
 * what the DB row's block_key stores. Never change a block name after
 * ship, or you orphan the admin's saved hidden/shown choice.
 */

export function Block({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  const { editMode } = useEditMode();
  const hidden = useBlockHidden(name);
  const { t } = useTranslation();
  const ctx = useSiteContentContext();
  const [pending, setPending] = useState(false);

  // Public path — no admin, no chrome.
  if (!editMode) {
    if (hidden) return null;
    return <div className={className}>{children}</div>;
  }

  const toggle = async () => {
    setPending(true);
    try {
      await setBlockHidden(name, !hidden);
      await ctx.refresh();
      toast.success(hidden ? t('block.now_visible') : t('block.now_hidden'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[block] toggle failed', err);
      toast.error(errorMessage(err, t('common.error_generic')));
    } finally { setPending(false); }
  };

  return (
    <div
      className={cn(
        'relative outline outline-2 outline-dashed rounded-sm transition-all',
        hidden ? 'outline-red-400 opacity-40' : 'outline-luna-cyan/40 hover:outline-luna-cyan',
        className
      )}
    >
      {hidden && (
        <div className="absolute top-2 left-2 z-30 rounded-full bg-red-600 text-white px-2.5 py-1 text-xs font-semibold shadow-md">
          {t('block.hidden_ribbon')}
        </div>
      )}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-1">
        <span className="rounded-md bg-luna-navy/90 text-white px-2 py-0.5 text-xs font-mono">{name}</span>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          title={hidden ? t('block.show') : t('block.hide')}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold shadow-md transition-colors',
            hidden ? 'bg-white text-luna-navy hover:bg-luna-cyan' : 'bg-luna-cyan text-luna-navy hover:bg-luna-cyan/80'
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {hidden ? t('block.show') : t('block.hide')}
        </button>
      </div>
      {children}
    </div>
  );
}
