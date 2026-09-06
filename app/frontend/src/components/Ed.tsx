import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, X } from 'lucide-react';
import Markdown from 'markdown-to-jsx';
import { useContent, useSiteContentContext } from '@/contexts/SiteContentContext';
import { useEditMode } from '@/contexts/EditModeContext';
import { saveSiteContent } from '@/lib/site-content';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

/**
 * Editable text block. When edit mode is off (or the visitor is not an
 * admin), renders exactly `defaultValue` (or the DB override if present).
 * When edit mode is on, wraps the text with a click-to-edit UI: click it,
 * type, Enter/Save writes to site_content and the site refreshes.
 *
 * Usage anywhere on a public page:
 *   <Ed page="home" field="hero_title" as="h1" className="text-4xl">
 *     {t('home.hero_title')}
 *   </Ed>
 *
 * The `field` key must also exist in editable-content.ts if you want it
 * to appear in the /admin/contenus form editor. Inline edits work
 * regardless — the admin form is one way in, the click-to-edit is another.
 */

type EdProps = {
  page: string;
  field: string;
  children: string;
  /** Rendered element when not editing. Defaults to <span>. */
  as?: ElementType;
  /** Textarea instead of input when editing — for longer text. */
  multiline?: boolean;
  /** Render text as Markdown (lists, bold, links) when not editing. */
  markdown?: boolean;
  className?: string;
  /** Optional trailing UI (e.g. an icon) rendered alongside the text. */
  trailing?: ReactNode;
};

export function Ed({ page, field, children, as, multiline = false, markdown = false, className, trailing }: EdProps) {
  const { editMode } = useEditMode();
  const value = useContent(page, field, children);
  const { i18n, t } = useTranslation();
  const lang: 'fr' | 'en' = i18n.language === 'en' ? 'en' : 'fr';
  const ctx = useSiteContentContext();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const Tag = (as ?? 'span') as ElementType;

  if (!editMode) {
    if (markdown && value) {
      return (
        <Tag className={cn('prose-luna', className)}>
          <Markdown options={MD_OPTS}>{value}</Markdown>
          {trailing}
        </Tag>
      );
    }
    return <Tag className={className}>{value}{trailing}</Tag>;
  }

  if (editing) {
    const commit = async () => {
      if (draft === value) { setEditing(false); return; }
      setSaving(true);
      try {
        await saveSiteContent(page, lang, field, draft);
        await ctx.refresh();
        setEditing(false);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Ed] save failed', err);
        toast.error(t('common.error_generic'));
      } finally {
        setSaving(false);
      }
    };
    const cancel = () => { setDraft(value); setEditing(false); };

    return (
      <span className={cn('inline-flex items-start gap-1 align-baseline', className)}>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && e.ctrlKey) void commit(); }}
            rows={8}
            className="min-w-[16rem] w-full rounded-md border-2 border-luna-cyan bg-white px-2 py-1 text-inherit shadow-sm focus:outline-none"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') void commit(); }}
            className="min-w-[12rem] w-full rounded-md border-2 border-luna-cyan bg-white px-2 py-1 text-inherit shadow-sm focus:outline-none"
          />
        )}
        <button type="button" onClick={commit} disabled={saving} title={t('edit_mode.save')}
          className="mt-1 shrink-0 rounded-md bg-luna-navy text-white p-1 hover:bg-luna-navy/90 disabled:opacity-50">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" onClick={cancel} disabled={saving} title={t('edit_mode.cancel')}
          className="mt-1 shrink-0 rounded-md bg-white text-slate-600 border border-slate-300 p-1 hover:bg-slate-50 disabled:opacity-50">
          <X className="h-4 w-4" />
        </button>
      </span>
    );
  }

  return (
    <Tag
      className={cn(
        'group relative cursor-pointer rounded-sm outline outline-2 outline-dashed outline-luna-cyan/50 outline-offset-2 transition-colors hover:outline-luna-cyan hover:bg-luna-cyan/10',
        markdown && 'prose-luna',
        className
      )}
      onClick={() => setEditing(true)}
      title={t('edit_mode.click_to_edit')}
    >
      {markdown && value ? <Markdown options={MD_OPTS}>{value}</Markdown> : value}
      <Pencil className="inline-block h-3 w-3 ml-1 opacity-40 group-hover:opacity-80 align-baseline" aria-hidden="true" />
      {trailing}
    </Tag>
  );
}

/** Markdown renderer options — safe subset (no raw HTML). */
const MD_OPTS = {
  disableParsingRawHTML: true,
  overrides: {
    a: { props: { className: 'text-luna-blue underline hover:no-underline', rel: 'noopener', target: '_blank' } },
    ul: { props: { className: 'list-disc list-inside space-y-1 my-2' } },
    ol: { props: { className: 'list-decimal list-inside space-y-1 my-2' } },
    strong: { props: { className: 'font-semibold' } },
    p: { props: { className: 'my-1' } },
  },
} as const;
