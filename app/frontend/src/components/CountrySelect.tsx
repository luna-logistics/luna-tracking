import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, X } from 'lucide-react';
import { COUNTRY_CODES, countryName, normalizeForSearch } from '@/lib/countries';
import { cn } from '@/lib/utils';

/**
 * Searchable country picker (ARIA 1.2 combobox + listbox). Type a name in the
 * visitor's language or an ISO code ("congo", "RD", "cd"…) to filter; arrow
 * keys + Enter to choose, Escape to close. Stores the ISO 3166-1 alpha-2 code.
 */
export function CountrySelect({
  value, onChange, disabled, id, invalid,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'fr';
  const autoId = useId();
  const inputId = id ?? `country-${autoId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(
    () => COUNTRY_CODES
      .map((code) => ({ code, name: countryName(code, lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang)),
    [lang],
  );
  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return all;
    return all.filter((c) => normalizeForSearch(c.name).includes(q) || c.code.toLowerCase() === q);
  }, [all, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (code: string) => { onChange(code); setOpen(false); setQuery(''); };
  const display = value ? `${countryName(value, lang)} (${value})` : '';

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-activedescendant={open && filtered[active] ? `${listId}-${filtered[active].code}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={t('country_select.placeholder')}
        value={open ? query : display}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { if (open && filtered[active]) { e.preventDefault(); pick(filtered[active].code); } }
          else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
          else if (e.key === 'Tab') { setOpen(false); setQuery(''); }
        }}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background pl-3 pr-14 py-2 text-base md:text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      />
      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
        {value && !disabled && (
          <button type="button" className="pointer-events-auto rounded p-0.5 text-slate-400 hover:text-luna-navy"
            aria-label={t('country_select.clear')} onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(null); setQuery(''); }}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </div>
      {open && !disabled && (
        <ul id={listId} ref={listRef} role="listbox" aria-label={t('country_select.list_label')}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-slate-500" role="presentation">{t('country_select.no_match')}</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.code} id={`${listId}-${c.code}`} data-idx={i} role="option" aria-selected={c.code === value}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c.code)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5',
                i === active && 'bg-luna-blue/10',
                c.code === value && 'font-semibold text-luna-navy',
              )}>
              <span className="truncate">{c.name}</span>
              <span className="font-mono text-xs text-slate-400">{c.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
