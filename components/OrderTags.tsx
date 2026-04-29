'use client';

/**
 * Reusable bits for the admin order-tag system:
 *   - <TagChip>     — inline pill for a single tag (name + optional icon, color)
 *   - <TagPicker>   — popup picker that toggles tags on a given order and
 *                     supports inline creation of new tags + delete of unused ones
 *
 * Backed by /api/order-tags (catalog) and /api/orders/[id] (per-order
 * `tags` JSON array). The catalog is fetched once and reused; callers can
 * also pass in `tags` if they already have them loaded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface OrderTag {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  description: string | null;
  sortOrder: number;
}

const COLOR_OPTIONS = [
  'slate', 'blue', 'green', 'amber', 'red', 'purple', 'pink', 'emerald',
] as const;

// Map the named palette to {bg, fg, border} so chips render consistently
// without depending on a global CSS class for tag colors.
const COLOR_TOKENS: Record<string, { bg: string; fg: string; border: string }> = {
  slate:   { bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1' },
  blue:    { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
  green:   { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  amber:   { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
  red:     { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  purple:  { bg: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' },
  pink:    { bg: '#fce7f3', fg: '#9d174d', border: '#f9a8d4' },
  emerald: { bg: '#d1fae5', fg: '#065f46', border: '#6ee7b7' },
};

function tokensFor(color: string) {
  return COLOR_TOKENS[color] ?? COLOR_TOKENS.blue;
}

/* ── Single chip ────────────────────────────────────────────────────────── */
export function TagChip({
  tag,
  size = 'md',
  onRemove,
  onClick,
  title,
}: {
  tag: OrderTag;
  size?: 'sm' | 'md';
  onRemove?: () => void;
  onClick?: () => void;
  title?: string;
}) {
  const t = tokensFor(tag.color);
  const padding = size === 'sm' ? '0.1rem 0.4rem' : '0.2rem 0.55rem';
  const fontSize = size === 'sm' ? '0.68rem' : '0.75rem';
  return (
    <span
      title={title ?? tag.description ?? tag.name}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        padding, fontSize, fontWeight: 600,
        background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
        borderRadius: '999px',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {tag.icon && <span aria-hidden>{tag.icon}</span>}
      <span>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove tag"
          style={{
            background: 'transparent', border: 'none', color: t.fg, opacity: 0.7,
            cursor: 'pointer', fontSize: '0.95em', lineHeight: 1, padding: '0 0 0 0.15rem',
          }}
        >×</button>
      )}
    </span>
  );
}

/* ── Tag list cache hook ────────────────────────────────────────────────── */
export function useOrderTagCatalog(): {
  tags: OrderTag[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsertLocal: (tag: OrderTag) => void;
  removeLocal: (id: string) => void;
} {
  const [tags, setTags] = useState<OrderTag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/order-tags', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tags)) setTags(data.tags);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const upsertLocal = useCallback((tag: OrderTag) => {
    setTags(prev => {
      const idx = prev.findIndex(t => t.id === tag.id);
      const next = idx >= 0 ? [...prev.slice(0, idx), tag, ...prev.slice(idx + 1)] : [...prev, tag];
      next.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      return next;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tags, loading, refresh, upsertLocal, removeLocal };
}

/* ── Picker popup ───────────────────────────────────────────────────────── */
export function TagPicker({
  applied,
  catalog,
  onApply,
  onCreate,
  onDelete,
  onClose,
}: {
  /** Currently applied tag ids on this order. */
  applied: string[];
  /** Full catalog of tags. */
  catalog: OrderTag[];
  /** Toggle a tag on the order — picker keeps open for multi-select. */
  onApply: (tagId: string, applied: boolean) => Promise<void> | void;
  /** Create a new tag. Returns the created tag (or throws on error). */
  onCreate: (input: { name: string; color: string; icon?: string }) => Promise<OrderTag>;
  /** Delete a tag from the catalog (removes it from every order too). */
  onDelete?: (tagId: string) => Promise<void>;
  onClose?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<typeof COLOR_OPTIONS[number]>('blue');
  const [newIcon, setNewIcon] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside.
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer until next tick so the click that opened the picker doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(t => t.name.toLowerCase().includes(q));
  }, [catalog, search]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setError('Name is required.'); return; }
    setBusy(true); setError('');
    try {
      await onCreate({ name, color: newColor, icon: newIcon.trim() || undefined });
      setNewName(''); setNewIcon(''); setCreating(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to create tag.');
    } finally { setBusy(false); }
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', zIndex: 50, top: '100%', left: 0, marginTop: '0.4rem',
        minWidth: '280px', maxWidth: '360px',
        background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.6rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.1)', padding: '0.5rem',
      }}
    >
      <input
        type="text"
        autoFocus
        placeholder="Search or create tag…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '0.4rem 0.5rem', fontSize: '0.85rem',
          border: '1px solid #d1d5db', borderRadius: '0.4rem', marginBottom: '0.4rem',
        }}
      />

      <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {filtered.length === 0 && !creating && (
          <div style={{ fontSize: '0.8rem', color: '#6b7280', padding: '0.4rem', textAlign: 'center' }}>
            {catalog.length === 0 ? 'No tags yet — create one below.' : 'No matches.'}
          </div>
        )}
        {filtered.map(tag => {
          const isApplied = applied.includes(tag.id);
          return (
            <div
              key={tag.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.3rem 0.4rem', borderRadius: '0.4rem',
                background: isApplied ? '#f3f4f6' : 'transparent',
                gap: '0.4rem',
              }}
            >
              <button
                type="button"
                onClick={() => onApply(tag.id, !isApplied)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: 0,
                }}
              >
                <input type="checkbox" checked={isApplied} readOnly tabIndex={-1} />
                <TagChip tag={tag} size="sm" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  title={`Delete "${tag.name}" from the catalog`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete tag "${tag.name}"? It will also be removed from every order using it.`)) return;
                    await onDelete(tag.id);
                  }}
                  style={{
                    background: 'transparent', border: 'none', color: '#9ca3af',
                    cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.2rem',
                  }}
                >🗑</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '0.4rem', paddingTop: '0.4rem' }}>
        {creating ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <input
                type="text"
                placeholder="Icon (emoji, optional)"
                value={newIcon}
                onChange={e => setNewIcon(e.target.value)}
                maxLength={4}
                style={{
                  width: '70px', padding: '0.3rem 0.4rem', fontSize: '0.85rem',
                  border: '1px solid #d1d5db', borderRadius: '0.4rem', textAlign: 'center',
                }}
              />
              <input
                type="text"
                autoFocus
                placeholder="Tag name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                maxLength={40}
                style={{
                  flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.85rem',
                  border: '1px solid #d1d5db', borderRadius: '0.4rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map(c => {
                const tok = tokensFor(c);
                const selected = newColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    title={c}
                    style={{
                      width: '20px', height: '20px', borderRadius: '999px',
                      background: tok.bg, border: `2px solid ${selected ? tok.fg : 'transparent'}`,
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                );
              })}
            </div>
            {error && <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName(''); setError(''); }}
                style={{ background: 'transparent', border: 'none', fontSize: '0.8rem', cursor: 'pointer', color: '#6b7280' }}
              >Cancel</button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy || !newName.trim()}
                style={{
                  background: busy || !newName.trim() ? '#9ca3af' : 'var(--blue)',
                  color: 'white', border: 'none', borderRadius: '0.35rem',
                  padding: '0.3rem 0.7rem', fontSize: '0.8rem', fontWeight: 600,
                  cursor: busy || !newName.trim() ? 'not-allowed' : 'pointer',
                }}
              >{busy ? 'Saving…' : 'Create'}</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '0.35rem 0.4rem', fontSize: '0.82rem', color: 'var(--blue)',
              fontWeight: 600,
            }}
          >+ Create new tag</button>
        )}
      </div>
    </div>
  );
}
