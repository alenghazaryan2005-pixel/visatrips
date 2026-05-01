/**
 * Theme — lets admins customize the global color palette from
 * /admin/theme. The 9 brand tokens defined here are written into a single
 * inline <style> on :root by ThemeStyleInjector at request time, overriding
 * the same tokens declared in app/globals.css.
 *
 * Storage (existing Setting table, no schema migration):
 *   key='theme.active'   value=<JSON ThemeColors>
 *   key='theme.presets'  value=<JSON SavedPreset[]>
 *
 * Built-in presets are hardcoded and cannot be deleted; user-saved presets
 * are stored in the .presets array and can be deleted.
 */

/* ── Token catalog ─────────────────────────────────────────────────────────
 * Adding a new token: append to ThemeKey, add a default in DEFAULT_THEME,
 * add a label/description in TOKEN_META. Do NOT remove tokens — existing
 * stored themes may reference them. */

export type ThemeKey =
  /* Brand & text */
  | 'ink'      // primary text color
  | 'slate'    // muted text / secondary labels
  | 'blue'     // brand primary (CTA buttons, links)
  | 'blue2'    // brand secondary (gradient end, decorative)
  | 'navy'     // legacy dark accent (kept for back-compat with existing pages)
  /* Surfaces */
  | 'sky'      // app background (lightest)
  | 'white'    // pure white surfaces — cards, modals
  | 'cloud'    // subtle background fill — borders, dividers, input bg
  | 'mist'     // even lighter background — table headers, hover states
  /* Admin chrome */
  | 'sidebar'  // admin sidebar background
  /* Status / semantic */
  | 'success'  // approved / completed (green family)
  | 'warning'  // processing / pending (amber family)
  | 'danger'   // rejected / needs-correction (red family)
  | 'info';    // submitted / under-review (sky-blue family)

export type ThemeColors = Record<ThemeKey, string>;

/** Stable order — controls the order tokens render in the admin UI. */
export const THEME_KEYS: ThemeKey[] = [
  // Brand & text
  'ink', 'slate', 'blue', 'blue2', 'navy',
  // Surfaces
  'sky', 'white', 'cloud', 'mist',
  // Admin chrome
  'sidebar',
  // Status
  'success', 'warning', 'danger', 'info',
];

export const DEFAULT_THEME: ThemeColors = {
  ink:     '#1E293B',
  slate:   '#475569',
  blue:    '#6C8AFF',
  blue2:   '#93ADFF',
  navy:    '#1A2B5E',
  sky:     '#F8FAFF',
  white:   '#FDFEFF',
  cloud:   '#EDF1F8',
  mist:    '#F2F5FC',
  sidebar: '#1E293B',  // matches ink by default; decouple to give the sidebar a distinct color
  success: '#16A34A',
  warning: '#D97706',
  danger:  '#DC2626',
  info:    '#0284C7',
};

/** Visual grouping for the admin /admin/theme editor — keeps the picker
 *  organised by purpose instead of one wall of 14 swatches. */
export type ThemeGroup = 'brand' | 'surface' | 'admin' | 'status';

export const TOKEN_META: Record<ThemeKey, { label: string; description: string; group: ThemeGroup }> = {
  /* Brand & text */
  ink:     { group: 'brand',   label: 'Ink',            description: 'Primary text colour — headings and body copy.' },
  slate:   { group: 'brand',   label: 'Slate',          description: 'Muted text — labels, captions, secondary copy.' },
  blue:    { group: 'brand',   label: 'Blue (Brand)',   description: 'Primary brand colour — CTA buttons, links, accents.' },
  blue2:   { group: 'brand',   label: 'Blue Light',     description: 'Secondary brand colour — gradient ends, decorative.' },
  navy:    { group: 'brand',   label: 'Navy',           description: 'Legacy deep-blue accent (kept for backwards compatibility).' },
  /* Surfaces */
  sky:     { group: 'surface', label: 'Sky',            description: 'App background — the lightest fill behind every page.' },
  white:   { group: 'surface', label: 'White',          description: 'Pure white surfaces — cards, modals.' },
  cloud:   { group: 'surface', label: 'Cloud',          description: 'Subtle background fill — borders, dividers, input bg.' },
  mist:    { group: 'surface', label: 'Mist',           description: 'Lighter background — table headers, hover states.' },
  /* Admin chrome */
  sidebar: { group: 'admin',   label: 'Sidebar',        description: 'Admin sidebar background. Decoupled from Ink so you can have a distinct sidebar colour.' },
  /* Status */
  success: { group: 'status',  label: 'Success',        description: 'Approved / completed states (green family).' },
  warning: { group: 'status',  label: 'Warning',        description: 'Processing / pending states (amber family).' },
  danger:  { group: 'status',  label: 'Danger',         description: 'Rejected / needs-correction states (red family).' },
  info:    { group: 'status',  label: 'Info',           description: 'Submitted / under-review states (sky-blue family).' },
};

export const GROUP_META: Record<ThemeGroup, { label: string; description: string }> = {
  brand:   { label: 'Brand & Text', description: 'Primary identity colours and text — used everywhere.' },
  surface: { label: 'Surfaces',     description: 'Page background, card backgrounds, dividers.' },
  admin:   { label: 'Admin Chrome', description: 'Pieces that only affect the admin panel\'s structural look.' },
  status:  { label: 'Status',       description: 'Semantic colours for approved/pending/rejected/submitted states.' },
};

/** Token keys grouped by their `group`, in the order they should render. */
export const KEYS_BY_GROUP: Record<ThemeGroup, ThemeKey[]> = (() => {
  const out: Record<ThemeGroup, ThemeKey[]> = { brand: [], surface: [], admin: [], status: [] };
  for (const k of THEME_KEYS) out[TOKEN_META[k].group].push(k);
  return out;
})();

/* ── Built-in presets ───────────────────────────────────────────────────── */

export interface BuiltInPreset {
  id: string;            // stable id, prefixed "builtin:"
  name: string;
  description: string;
  builtIn: true;
  colors: ThemeColors;
}

export interface UserPreset {
  id: string;            // stable cuid-ish, prefixed "user:"
  name: string;
  description?: string;
  builtIn?: false;
  colors: ThemeColors;
  createdAt: string;     // ISO
  createdBy?: string;
}

export type Preset = BuiltInPreset | UserPreset;

/** Status colours stay close to standards across all presets so they remain
 *  intuitively recognisable (green=success, red=danger, etc.) regardless of
 *  the brand palette. Admins can still override per-token if they really
 *  want a teal "success" — but presets don't try to be clever here. */
const STANDARD_STATUS = {
  success: '#16A34A',
  warning: '#D97706',
  danger:  '#DC2626',
  info:    '#0284C7',
} as const;

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    id: 'builtin:default-blue',
    name: 'Default Blue',
    description: 'The original VisaTrips palette.',
    builtIn: true,
    colors: { ...DEFAULT_THEME },
  },
  {
    id: 'builtin:sunset',
    name: 'Sunset',
    description: 'Warm oranges and pinks.',
    builtIn: true,
    colors: {
      ink:     '#3B1F1A',
      slate:   '#7C4A3A',
      blue:    '#FF7A59',
      blue2:   '#FFB088',
      navy:    '#5C1E1E',
      sky:     '#FFF8F2',
      white:   '#FFFEFD',
      cloud:   '#FCE6D8',
      mist:    '#FEF1E6',
      sidebar: '#5C1E1E',
      ...STANDARD_STATUS,
    },
  },
  {
    id: 'builtin:forest',
    name: 'Forest',
    description: 'Deep greens and earthy tones.',
    builtIn: true,
    colors: {
      ink:     '#1E2E22',
      slate:   '#4F6B58',
      blue:    '#3FAB6D',
      blue2:   '#7BD09D',
      navy:    '#1F4A2E',
      sky:     '#F4FAF5',
      white:   '#FDFFFD',
      cloud:   '#DDEFE3',
      mist:    '#EBF6EE',
      sidebar: '#1F4A2E',
      ...STANDARD_STATUS,
    },
  },
  {
    id: 'builtin:midnight',
    name: 'Midnight',
    description: 'Dark slate with vibrant blue accents.',
    builtIn: true,
    colors: {
      ink:     '#E5EAF2',
      slate:   '#94A3B8',
      blue:    '#7AA2FF',
      blue2:   '#A5BCFF',
      navy:    '#0A0F1F',
      sky:     '#0F1729',
      white:   '#252F47',
      cloud:   '#1E2A44',
      mist:    '#1A2335',
      sidebar: '#0A0F1F',
      // Status colours brightened slightly so they're readable on dark surfaces.
      success: '#22C55E',
      warning: '#F59E0B',
      danger:  '#EF4444',
      info:    '#38BDF8',
    },
  },
  {
    id: 'builtin:ocean',
    name: 'Ocean',
    description: 'Cool teals and aqua.',
    builtIn: true,
    colors: {
      ink:     '#0E2A33',
      slate:   '#3F6976',
      blue:    '#0EA5B7',
      blue2:   '#67DCE5',
      navy:    '#143E4D',
      sky:     '#F0FAFB',
      white:   '#FCFFFF',
      cloud:   '#D6EEF1',
      mist:    '#E8F6F8',
      sidebar: '#143E4D',
      ...STANDARD_STATUS,
    },
  },
];

/* ── Validation ────────────────────────────────────────────────────────── */

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isValidHex(s: unknown): s is string {
  return typeof s === 'string' && HEX_RE.test(s);
}

/**
 * Coerce arbitrary input into a ThemeColors. Missing or invalid tokens fall
 * back to DEFAULT_THEME. Returns the merged palette.
 */
export function normalizeTheme(input: unknown): ThemeColors {
  const out: ThemeColors = { ...DEFAULT_THEME };
  if (!input || typeof input !== 'object') return out;
  const obj = input as Record<string, unknown>;
  for (const k of THEME_KEYS) {
    const v = obj[k];
    if (isValidHex(v)) out[k] = (v as string).toUpperCase();
  }
  return out;
}

/**
 * Validate a theme dictionary strictly — throws on any invalid token.
 * Used by API write handlers.
 */
export function validateThemeStrict(input: unknown): ThemeColors {
  if (!input || typeof input !== 'object') throw new Error('Theme must be an object.');
  const obj = input as Record<string, unknown>;
  const out: Partial<ThemeColors> = {};
  for (const k of THEME_KEYS) {
    const v = obj[k];
    if (!isValidHex(v)) {
      throw new Error(`Theme token "${k}" must be a hex color (got ${JSON.stringify(v)}).`);
    }
    out[k] = (v as string).toUpperCase();
  }
  return out as ThemeColors;
}

/* ── CSS generator ─────────────────────────────────────────────────────── */

/**
 * Build the CSS that ThemeStyleInjector renders into <head>. We override
 * ONLY the brand tokens declared in globals.css — the shadcn/ui HSL block
 * (--background, --foreground, etc.) is left untouched.
 *
 * The result is wrapped in :root so it has standard cascade priority.
 * Loaded after globals.css means it wins.
 */
export function generateThemeCSS(colors: ThemeColors): string {
  const lines: string[] = [];
  for (const k of THEME_KEYS) {
    lines.push(`  --${k}: ${colors[k]};`);
  }
  return `:root{\n${lines.join('\n')}\n}\n`;
}

/**
 * Apply a theme to the live document — updates BOTH the persistent
 * `<style id="theme-active">` block AND the :root inline styles.
 *
 * The two-pronged update is intentional: in a Next.js App Router app the
 * shared admin layout doesn't re-render on intra-section navigations, so
 * the `<style>` block injected by ThemeStyleInjector at first paint stays
 * stale unless we update its textContent client-side. The :root inline
 * styles give us instant repaint priority (highest specificity); the
 * `<style>` block ensures the new theme survives editor unmount + every
 * subsequent admin-page navigation in the same session.
 *
 * Safe to call from any client-side code (no-op on the server).
 */
export function applyThemeToDocument(colors: ThemeColors): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const k of THEME_KEYS) {
    root.style.setProperty(`--${k}`, colors[k]);
  }
  const styleEl = document.getElementById('theme-active');
  if (styleEl instanceof HTMLStyleElement) {
    styleEl.textContent = generateThemeCSS(colors);
  }
}

/**
 * Inverse of `applyThemeToDocument` — clears the per-element :root inline
 * overrides so the page falls back to whatever's in `<style id="theme-active">`.
 * Used by the editor on unmount to drop draft (unsaved) overrides.
 */
export function clearThemeRootOverrides(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const k of THEME_KEYS) {
    root.style.removeProperty(`--${k}`);
  }
}

/* ── Preset id helpers ─────────────────────────────────────────────────── */

export function isBuiltInPresetId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('builtin:');
}

/**
 * Generate a short, stable id for a user preset. Not cryptographic — just
 * unique within the presets array.
 */
export function generateUserPresetId(): string {
  return `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
