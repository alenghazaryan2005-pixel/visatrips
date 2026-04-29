'use client';

/**
 * Client-side helpers for admin-defined statuses.
 *
 * Two storage layers feed this provider:
 *   1. `custom_statuses` table — admin-created statuses, full Prisma rows.
 *   2. `status.*` settings (lib/settings.ts) — per-built-in admin overrides
 *      for label / color / description, plus a `status.deleted` tombstones
 *      array.
 *
 * Built-in statuses (UNFINISHED, PROCESSING, …) are bootstrapped from
 * STATUS_LABELS + STATUS_COLORS in constants.ts. The provider layers the
 * admin overrides on top and filters out tombstoned codes so deleted
 * built-ins disappear from dropdowns / filter tabs / customer pages.
 *
 * Existing orders that still reference a deleted code keep rendering with
 * a fallback label — we never silently lose data.
 */

import { createContext, useCallback, useContext, useEffect, useState, ReactNode, CSSProperties } from 'react';
import { STATUS_LABELS, STATUS_COLORS } from './constants';

export interface CustomStatus {
  id: string;
  country: string;
  code: string;
  label: string;
  color: string;
  description: string | null;
  sortOrder: number;
}

/** Per-built-in overrides that the admin Status Labels tab maintains. */
export interface BuiltinOverrides {
  labels: Record<string, string>;
  colors: Record<string, string>;
  descriptions: Record<string, string>;
  deleted: string[];
}

const EMPTY_OVERRIDES: BuiltinOverrides = { labels: {}, colors: {}, descriptions: {}, deleted: [] };

// Backward-compat named-color palette. New statuses should just use a hex.
const COLOR_PALETTE: Record<string, { bg: string; fg: string }> = {
  slate:   { bg: '#e2e8f0', fg: '#334155' },
  blue:    { bg: '#dbeafe', fg: '#1e40af' },
  green:   { bg: '#d1fae5', fg: '#065f46' },
  emerald: { bg: '#a7f3d0', fg: '#047857' },
  amber:   { bg: '#fef3c7', fg: '#92400e' },
  red:     { bg: '#fee2e2', fg: '#991b1b' },
  purple:  { bg: '#ede9fe', fg: '#5b21b6' },
  pink:    { bg: '#fce7f3', fg: '#9d174d' },
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/**
 * Turn any color input (a hex like "#8b5cf6" or a named preset like "blue")
 * into a { bg, fg } pair suitable for a badge. For hex inputs, the bg is the
 * hex at ~10% alpha and the fg is the hex at full opacity — same look as the
 * built-in status chips.
 */
export function resolveStatusColor(color: string | null | undefined): { bg: string; fg: string } {
  if (!color) return COLOR_PALETTE.slate;
  if (HEX_RE.test(color)) {
    // 1A ≈ 10% alpha — matches the built-in chip styling (rgba(c, 0.1))
    return { bg: `${color}1A`, fg: color };
  }
  return COLOR_PALETTE[color] || COLOR_PALETTE.slate;
}

interface CustomStatusesContextValue {
  /** Admin-created custom statuses from the custom_statuses table. */
  statuses: CustomStatus[];
  /** Per-built-in overrides + tombstones. */
  builtinOverrides: BuiltinOverrides;
  loading: boolean;
  refresh: () => Promise<void>;
  getLabel: (code: string) => string;
  getDescription: (code: string) => string;
  getBadgeClass: (code: string) => string;        // CSS class for built-ins; '' for custom
  getBadgeStyle: (code: string) => CSSProperties; // inline style for custom; {} for built-ins
  /** True when admin has deleted this built-in status. Existing orders with this code still render with a fallback. */
  isDeletedBuiltIn: (code: string) => boolean;
}

const Ctx = createContext<CustomStatusesContextValue | null>(null);

export function CustomStatusesProvider({ country = 'INDIA', children }: { country?: string; children: ReactNode }) {
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [builtinOverrides, setBuiltinOverrides] = useState<BuiltinOverrides>(EMPTY_OVERRIDES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Fetch both data sources in parallel — they share latency.
    const [statusesRes, settingsRes] = await Promise.allSettled([
      fetch(`/api/settings/custom-statuses?country=${encodeURIComponent(country)}`),
      fetch('/api/settings'),
    ]);

    if (statusesRes.status === 'fulfilled' && statusesRes.value.ok) {
      try {
        const d = await statusesRes.value.json();
        setStatuses(d.statuses || []);
      } catch {}
    }

    if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
      try {
        const d = await settingsRes.value.json();
        // /api/settings returns { settings: {...}, defaults: {...} }. Merge.
        const merged = { ...(d.defaults || {}), ...(d.settings || {}) };
        setBuiltinOverrides({
          labels:       isObj(merged['status.labels'])       ? merged['status.labels']       : {},
          colors:       isObj(merged['status.colors'])       ? merged['status.colors']       : {},
          descriptions: isObj(merged['status.descriptions']) ? merged['status.descriptions'] : {},
          deleted:      Array.isArray(merged['status.deleted']) ? merged['status.deleted']    : [],
        });
      } catch {}
    }

    setLoading(false);
  }, [country]);

  useEffect(() => { refresh(); }, [refresh]);

  const getLabel = useCallback((code: string) => {
    if (!code) return '';
    const custom = statuses.find(s => s.code === code);
    if (custom) return custom.label;
    return builtinOverrides.labels[code] ?? STATUS_LABELS[code] ?? code.replace(/_/g, ' ');
  }, [statuses, builtinOverrides.labels]);

  const getDescription = useCallback((code: string) => {
    if (!code) return '';
    const custom = statuses.find(s => s.code === code);
    if (custom) return custom.description ?? '';
    return builtinOverrides.descriptions[code] ?? '';
  }, [statuses, builtinOverrides.descriptions]);

  const getBadgeClass = useCallback((code: string) => {
    if (!code) return '';
    const custom = statuses.find(s => s.code === code);
    if (custom) return 'admin-status admin-status-custom';
    // If admin set a hex color override for a built-in, treat it like a
    // custom — emit the hex via inline style instead of the legacy CSS class.
    if (builtinOverrides.colors[code]) return 'admin-status admin-status-custom';
    return `admin-status ${STATUS_COLORS[code] ?? ''}`;
  }, [statuses, builtinOverrides.colors]);

  const getBadgeStyle = useCallback((code: string): CSSProperties => {
    const custom = statuses.find(s => s.code === code);
    if (custom) {
      const palette = resolveStatusColor(custom.color);
      return { background: palette.bg, color: palette.fg };
    }
    const overrideHex = builtinOverrides.colors[code];
    if (overrideHex) {
      const palette = resolveStatusColor(overrideHex);
      return { background: palette.bg, color: palette.fg };
    }
    return {};
  }, [statuses, builtinOverrides.colors]);

  const isDeletedBuiltIn = useCallback((code: string) => {
    return builtinOverrides.deleted.includes(code);
  }, [builtinOverrides.deleted]);

  return (
    <Ctx.Provider value={{
      statuses, builtinOverrides, loading, refresh,
      getLabel, getDescription, getBadgeClass, getBadgeStyle,
      isDeletedBuiltIn,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCustomStatuses(): CustomStatusesContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Provider not mounted — return a stub that falls back to built-ins only
    return {
      statuses: [],
      builtinOverrides: EMPTY_OVERRIDES,
      loading: false,
      refresh: async () => {},
      getLabel: (code: string) => STATUS_LABELS[code] || code.replace(/_/g, ' '),
      getDescription: () => '',
      getBadgeClass: (code: string) => `admin-status ${STATUS_COLORS[code] ?? ''}`,
      getBadgeStyle: () => ({}),
      isDeletedBuiltIn: () => false,
    };
  }
  return v;
}

/**
 * Inline status badge that handles both built-in and custom statuses.
 */
export function StatusBadge({ code }: { code: string }) {
  const { getLabel, getBadgeClass, getBadgeStyle } = useCustomStatuses();
  return (
    <span className={getBadgeClass(code)} style={getBadgeStyle(code)}>
      {getLabel(code)}
    </span>
  );
}

function isObj(x: unknown): x is Record<string, string> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
