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
  | 'ink'    // primary text color
  | 'sky'    // app background (lightest)
  | 'navy'   // dark accent / admin sidebar
  | 'blue'   // brand primary (CTA buttons, links)
  | 'blue2'  // brand secondary (gradient end, decorative)
  | 'slate'  // muted text / secondary labels
  | 'cloud'  // light background fills (cards, inputs)
  | 'mist'   // even lighter background
  | 'white'; // pure white surfaces

export type ThemeColors = Record<ThemeKey, string>;

export const THEME_KEYS: ThemeKey[] = [
  'ink', 'sky', 'navy', 'blue', 'blue2', 'slate', 'cloud', 'mist', 'white',
];

export const DEFAULT_THEME: ThemeColors = {
  ink:   '#1E293B',
  sky:   '#F8FAFF',
  navy:  '#1A2B5E',
  blue:  '#6C8AFF',
  blue2: '#93ADFF',
  slate: '#475569',
  cloud: '#EDF1F8',
  mist:  '#F2F5FC',
  white: '#FDFEFF',
};

export const TOKEN_META: Record<ThemeKey, { label: string; description: string }> = {
  ink:   { label: 'Ink',           description: 'Primary text color (used for headings and body copy).' },
  sky:   { label: 'Sky',           description: 'App background — the lightest fill behind every page.' },
  navy:  { label: 'Navy',          description: 'Dark accent — the admin sidebar and dark sections.' },
  blue:  { label: 'Blue (Brand)',  description: 'Primary brand color — CTA buttons, links, accents.' },
  blue2: { label: 'Blue Light',    description: 'Secondary brand color — gradient ends, decorative.' },
  slate: { label: 'Slate',         description: 'Muted text — labels, captions, secondary copy.' },
  cloud: { label: 'Cloud',         description: 'Light background fill — cards, inputs, dividers.' },
  mist:  { label: 'Mist',          description: 'Lighter background — very subtle fills.' },
  white: { label: 'White',         description: 'Pure white surfaces — modals, cards.' },
};

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
      ink:   '#3B1F1A',
      sky:   '#FFF8F2',
      navy:  '#5C1E1E',
      blue:  '#FF7A59',
      blue2: '#FFB088',
      slate: '#7C4A3A',
      cloud: '#FCE6D8',
      mist:  '#FEF1E6',
      white: '#FFFEFD',
    },
  },
  {
    id: 'builtin:forest',
    name: 'Forest',
    description: 'Deep greens and earthy tones.',
    builtIn: true,
    colors: {
      ink:   '#1E2E22',
      sky:   '#F4FAF5',
      navy:  '#1F4A2E',
      blue:  '#3FAB6D',
      blue2: '#7BD09D',
      slate: '#4F6B58',
      cloud: '#DDEFE3',
      mist:  '#EBF6EE',
      white: '#FDFFFD',
    },
  },
  {
    id: 'builtin:midnight',
    name: 'Midnight',
    description: 'Dark slate with vibrant blue accents.',
    builtIn: true,
    colors: {
      ink:   '#E5EAF2',
      sky:   '#0F1729',
      navy:  '#0A0F1F',
      blue:  '#7AA2FF',
      blue2: '#A5BCFF',
      slate: '#94A3B8',
      cloud: '#1E2A44',
      mist:  '#1A2335',
      white: '#252F47',
    },
  },
  {
    id: 'builtin:ocean',
    name: 'Ocean',
    description: 'Cool teals and aqua.',
    builtIn: true,
    colors: {
      ink:   '#0E2A33',
      sky:   '#F0FAFB',
      navy:  '#143E4D',
      blue:  '#0EA5B7',
      blue2: '#67DCE5',
      slate: '#3F6976',
      cloud: '#D6EEF1',
      mist:  '#E8F6F8',
      white: '#FCFFFF',
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
