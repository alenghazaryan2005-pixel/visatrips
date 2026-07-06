'use client';

/**
 * Searchable styled dropdown used across the finish flow (India + Aruba
 * + any future country routed through SchemaDrivenFinish). Replaces the
 * native <select> when we want a consistent on-brand look — chevron
 * trigger button, popup with built-in search, scrollable option list.
 *
 * Originally lived inline in app/apply/finish/page.tsx; extracted here
 * so the schema-driven renderer can reuse the same component without
 * duplication. Visual / behaviour are unchanged from the original.
 */

import { useEffect, useRef, useState } from 'react';

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setSearch('');
  }, [open]);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="cdd-wrap" ref={ref}>
      <button
        type="button"
        className={`cdd-trigger${value ? ' has-value' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className={value ? 'cdd-value' : 'cdd-placeholder'}>
          {value || placeholder}
        </span>
        <svg className={`cdd-chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12">
          <path fill="#8892B0" d="M6 8L1 3h10z"/>
        </svg>
      </button>
      {open && (
        <div className="cdd-menu">
          <div className="cdd-search-wrap">
            <input
              ref={inputRef}
              className="cdd-search"
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="cdd-options">
            {filtered.length === 0 && <div className="cdd-empty">No results</div>}
            {filtered.map(o => (
              <button
                key={o}
                type="button"
                className={`cdd-option${o === value ? ' selected' : ''}`}
                onClick={() => { onChange(o); setOpen(false); }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
