import { useRef, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold, Italic, Underline, Link as LinkIcon,
  Highlighter, Palette, Heading, Code,
  List, ListOrdered, Smile, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cleanPastedHtml } from '@/lib/rich-content';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  /** Reveals an HTML source-view toggle in the toolbar. */
  allowHtmlSourceView?: boolean;
  /** When set, adds an Image toolbar button. Parent handles the upload UI. */
  onRequestImage?: () => Promise<{ url: string; alt: string } | null>;
}

/** Sanitize on the way BACK from HTML source view — no scripts, no on*. */
function sanitizeHtml(input: string): string {
  if (typeof window === 'undefined') return input;
  const tmp = document.createElement('div');
  tmp.innerHTML = input;
  tmp.querySelectorAll('script').forEach((el) => el.remove());
  tmp.querySelectorAll<HTMLElement>('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return tmp.innerHTML;
}

type BlockLevel = 'p' | 'h2' | 'h3' | 'h4';

/**
 * WYSIWYG editor for admin blog posts (also usable elsewhere). Wraps
 * contentEditable + document.execCommand — no big editor library.
 *
 * Feature set: bold / italic / underline, block headings (h2/h3/h4 —
 * h1 stays reserved for the page title), unordered + ordered lists,
 * text color, highlight color, link, image (upload via onRequestImage
 * callback), emoji picker (curated logistics-oriented set), HTML source
 * view toggle (allowHtmlSourceView).
 */
const EMOJI_PALETTE = [
  '📦', '🚚', '✈️', '🚢', '🚛', '🚂', '🛫', '🛬', '📮', '📬',
  '🌍', '🌎', '🌏', '📍', '🗺️', '🧭', '🏭', '🏢', '🏬', '🏗️',
  '🇧🇪', '🇨🇩', '🇺🇸', '🇨🇳', '🇫🇷', '🇬🇧', '🇩🇪', '🇮🇹', '🇪🇸', '🇳🇱',
  '✅', '✔️', '❌', '⚠️', 'ℹ️', '💡', '📝', '📅', '⏰', '🕐',
  '💰', '💶', '💳', '🧾', '📊', '📈', '📉', '⭐', '🌟', '🔥',
  '📞', '📱', '💬', '📧', '📥', '📤', '🔒', '🔑', '🔍', '👥',
  '❤️', '💙', '🙏', '👍', '👏', '🎉', '🎁', '✨',
];

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
  minHeightClass = 'min-h-[200px]',
  allowHtmlSourceView = false,
  onRequestImage,
}: RichTextEditorProps) {
  const { t } = useTranslation();
  const BLOCK_LABELS: Record<BlockLevel, string> = {
    p: t('rich_text_editor.block_paragraph'),
    h2: t('rich_text_editor.block_h2'),
    h3: t('rich_text_editor.block_h3'),
    h4: t('rich_text_editor.block_h4'),
  };
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [textColor, setTextColor] = useState('#002F67');
  const [highlightColor, setHighlightColor] = useState('#FEF08A');
  const savedSelectionRef = useRef<Range | null>(null);
  const [sourceView, setSourceView] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    let toInsert = '';
    if (html) toInsert = cleanPastedHtml(html);
    else if (text) {
      toInsert = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }
    if (toInsert) { document.execCommand('insertHTML', false, toInsert); handleInput(); }
  }, [handleInput]);

  const saveSelection = () => {
    const s = window.getSelection();
    if (s && s.rangeCount > 0) savedSelectionRef.current = s.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    const s = window.getSelection();
    if (s && savedSelectionRef.current) { s.removeAllRanges(); s.addRange(savedSelectionRef.current); }
  };
  const execCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    handleInput();
  };

  const handleBlockLevel = (level: BlockLevel) => {
    execCommand('formatBlock', `<${level}>`);
    setShowBlockMenu(false);
  };

  const insertEmoji = (e: string) => { execCommand('insertText', e); setShowEmojiMenu(false); };

  const handleLinkSubmit = () => {
    if (linkUrl.trim()) {
      restoreSelection();
      editorRef.current?.focus();
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      document.execCommand('createLink', false, url);
      const s = window.getSelection();
      if (s && s.rangeCount > 0) {
        const anchor = s.anchorNode?.parentElement;
        if (anchor?.tagName === 'A') {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      }
      handleInput();
    }
    setLinkUrl('');
    setShowLinkInput(false);
  };
  const handleLinkClick = () => {
    saveSelection();
    const s = window.getSelection();
    if (!s || s.isCollapsed) return;
    setShowLinkInput(true);
  };

  const handleImageClick = async () => {
    if (!onRequestImage) return;
    saveSelection();
    const picked = await onRequestImage();
    if (!picked || !picked.url) return;
    editorRef.current?.focus();
    restoreSelection();
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const alt = esc(picked.alt || '');
    const src = esc(picked.url);
    const html = `<figure><img src="${src}" alt="${alt}" />${picked.alt ? `<figcaption>${esc(picked.alt)}</figcaption>` : ''}</figure><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    handleInput();
  };

  const enterSourceView = () => {
    const html = editorRef.current?.innerHTML ?? content;
    setSourceDraft(html);
    setSourceView(true);
    setShowLinkInput(false);
    setShowBlockMenu(false);
  };
  const exitSourceView = () => {
    const cleaned = sanitizeHtml(sourceDraft);
    onChange(cleaned);
    setSourceView(false);
    requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = cleaned; });
  };

  return (
    <div className="border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-luna-cyan/40 focus-within:border-luna-cyan">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-slate-50/80 flex-wrap">
        <div className="relative">
          <ToolbarButton
            onClick={() => { saveSelection(); setShowBlockMenu(!showBlockMenu); setShowLinkInput(false); }}
            title={t('rich_text_editor.heading_level_title')} active={showBlockMenu}
          >
            <Heading className="h-3.5 w-3.5" />
          </ToolbarButton>
          {showBlockMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
              {(['p', 'h2', 'h3', 'h4'] as BlockLevel[]).map((lvl) => (
                <button key={lvl} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100"
                  onClick={() => handleBlockLevel(lvl)}>
                  {BLOCK_LABELS[lvl]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton onClick={() => execCommand('bold')} title={t('rich_text_editor.bold_title')} active={false}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('italic')} title={t('rich_text_editor.italic_title')} active={false}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('underline')} title={t('rich_text_editor.underline_title')} active={false}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title={t('rich_text_editor.bullet_list_title')} active={false}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCommand('insertOrderedList')} title={t('rich_text_editor.numbered_list_title')} active={false}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <label
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-600 cursor-pointer inline-flex items-center relative"
          title={t('rich_text_editor.text_color_title')} onMouseDown={saveSelection}
        >
          <Palette className="h-3.5 w-3.5" />
          <span className="ml-1 w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: textColor }} aria-hidden />
          <input
            type="color" value={textColor}
            onChange={(e) => { setTextColor(e.target.value); execCommand('foreColor', e.target.value); }}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={t('rich_text_editor.text_color_title')}
          />
        </label>

        <label
          className="p-1.5 rounded hover:bg-slate-200 transition-colors text-slate-600 cursor-pointer inline-flex items-center relative"
          title={t('rich_text_editor.highlight_title')} onMouseDown={saveSelection}
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span className="ml-1 w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: highlightColor }} aria-hidden />
          <input
            type="color" value={highlightColor}
            onChange={(e) => { setHighlightColor(e.target.value); execCommand('hiliteColor', e.target.value); }}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={t('rich_text_editor.highlight_color_title')}
          />
        </label>
        <ToolbarButton onClick={() => execCommand('hiliteColor', 'inherit')}
          title={t('rich_text_editor.remove_highlight_title')} active={false}>
          <span className="text-[10px] font-medium">✕</span>
        </ToolbarButton>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <ToolbarButton onClick={handleLinkClick} title={t('rich_text_editor.insert_link_title')} active={showLinkInput}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        {onRequestImage && (
          <ToolbarButton onClick={handleImageClick} title={t('rich_text_editor.insert_image_title')} active={false}>
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}

        <div className="relative">
          <ToolbarButton
            onClick={() => { saveSelection(); setShowEmojiMenu(!showEmojiMenu); setShowBlockMenu(false); setShowLinkInput(false); }}
            title={t('rich_text_editor.insert_emoji_title')} active={showEmojiMenu}
          >
            <Smile className="h-3.5 w-3.5" />
          </ToolbarButton>
          {showEmojiMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 z-50 w-64 max-h-56 overflow-y-auto grid grid-cols-10 gap-0.5">
              {EMOJI_PALETTE.map((e) => (
                <button key={e} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => insertEmoji(e)}
                  className="text-lg leading-none p-1 rounded hover:bg-luna-cyan/10 focus:bg-luna-cyan/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {allowHtmlSourceView && (
          <>
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <ToolbarButton onClick={() => (sourceView ? exitSourceView() : enterSourceView())}
              title={sourceView ? t('rich_text_editor.back_visual_title') : t('rich_text_editor.view_html_title')} active={sourceView}>
              <Code className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        )}
      </div>

      {showLinkInput && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-luna-cyan/10">
          <LinkIcon className="h-3.5 w-3.5 text-luna-navy shrink-0" />
          <Input
            value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com"
            className="h-7 text-xs flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleLinkSubmit(); }
              if (e.key === 'Escape') { setShowLinkInput(false); setLinkUrl(''); }
            }}
            autoFocus
          />
          <Button type="button" size="sm" variant="navy" className="h-7 text-xs px-2" onClick={handleLinkSubmit}>OK</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2"
            onClick={() => { setShowLinkInput(false); setLinkUrl(''); }}>✕</Button>
        </div>
      )}

      {sourceView && (
        <textarea
          value={sourceDraft} onChange={(e) => setSourceDraft(e.target.value)}
          className={`${minHeightClass} w-full px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset resize-y bg-slate-50 border-t border-slate-100`}
          spellCheck={false}
          placeholder={t('rich_text_editor.source_placeholder')}
        />
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={`${sourceView ? 'hidden' : ''} ${minHeightClass} w-full px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_a]:text-luna-blue [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-1 [&_h4]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-0.5 [&_figure]:my-4 [&_img]:rounded-md [&_img]:max-w-full`}
        onInput={handleInput}
        onPaste={handlePaste}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onClick={() => { setShowBlockMenu(false); setShowEmojiMenu(false); }}
        data-placeholder={placeholder ?? t('rich_text_editor.default_placeholder')}
      />
    </div>
  );
}

function ToolbarButton({
  onClick, title, active, children,
}: { onClick: () => void; title: string; active: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`p-1.5 rounded hover:bg-slate-200 transition-colors ${active ? 'bg-slate-200 text-luna-navy' : 'text-slate-600'}`}
      onClick={(e) => { e.preventDefault(); onClick(); }}
      title={title}
    >
      {children}
    </button>
  );
}
