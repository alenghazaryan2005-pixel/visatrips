'use client';

import { useState, useRef, useEffect } from 'react';

interface Country {
  code:    string;
  flag:    string;
  name:    string;
  tag?:    string;
  region?: string;
}

interface DropdownProps {
  label:       string;
  placeholder: string;
  options:     Country[];
  value:       string;
  onChange:    (code: string) => void;
}

function CountryDropdown({ label, placeholder, options, value, onChange }: DropdownProps) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref       = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(c => c.code === value);
  const filtered = options.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSearch(''); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 40);
  }, [open]);

  return (
    <div className="vf-wrap" ref={ref}>
      <div className="vf-label">{label}</div>

      {/* Trigger */}
      <button
        type="button"
        className="vf-trigger"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="vf-trigger-value">
            <span className="vf-flag">{selected.flag}</span>
            <span className="vf-name">{selected.name}</span>
          </span>
        ) : (
          <span className="vf-placeholder">{placeholder}</span>
        )}
        <span className={`vf-chevron${open ? ' open' : ''}`}>›</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="vf-panel" role="listbox">
          {/* Search */}
          <div className="vf-search-row">
            <input
              ref={searchRef}
              className="vf-search"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* List */}
          <ul className="vf-list">
            {filtered.length === 0 ? (
              <li className="vf-empty">No results</li>
            ) : (
              filtered.map(c => (
                <li
                  key={c.code}
                  role="option"
                  aria-selected={c.code === value}
                  className={`vf-item${c.code === value ? ' vf-item--selected' : ''}`}
                  onClick={() => {
                    onChange(c.code);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className="vf-item-flag">{c.flag}</span>
                  <span className="vf-item-name">{c.name}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

interface VisaSelectorProps {
  passportCountries:    Country[];
  destinationCountries: Country[];
}

export default function VisaSelector({ passportCountries, destinationCountries }: VisaSelectorProps) {
  const [passport,    setPassport]    = useState('');
  const [destination, setDestination] = useState('');

  const sel1 = passportCountries.find(c => c.code === passport);
  const sel2 = destinationCountries.find(c => c.code === destination);
  const canSubmit = passport && destination;

  return (
    <div className="vs-box">
      <div className="vs-fields">
        <CountryDropdown
          label="My passport"
          placeholder="Select country"
          options={passportCountries}
          value={passport}
          onChange={setPassport}
        />
        <div className="vs-divider" />
        <CountryDropdown
          label="My destination"
          placeholder="Traveling to"
          options={destinationCountries}
          value={destination}
          onChange={setDestination}
        />
      </div>

      <button
        className={`vs-cta${canSubmit ? ' vs-cta--on' : ''}`}
        disabled={!canSubmit}
        onClick={() => canSubmit && (window.location.href = `/apply?passport=${passport}`)}
      >
        {canSubmit
          ? `Get started — ${sel1?.name} → ${sel2?.name} →`
          : 'Select passport & destination to continue'}
      </button>
    </div>
  );
}
