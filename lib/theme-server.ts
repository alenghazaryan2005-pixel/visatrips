/**
 * Server-side theme helpers — read/write per-user themes + presets from
 * the Setting table. Kept separate from lib/theme.ts so client components
 * can import the pure helpers (DEFAULT_THEME, normalizeTheme, etc.) without
 * pulling in Prisma.
 *
 * SCOPE: Each admin has their own active theme + their own saved presets,
 * keyed by their email. The previous global `theme.active` / `theme.presets`
 * setting rows are kept around for legacy reads but no new writes go to
 * them — every write is scoped to the calling admin's email.
 */

import { prisma } from '@/lib/prisma';
import {
  BUILT_IN_PRESETS,
  DEFAULT_THEME,
  normalizeTheme,
  type Preset,
  type ThemeColors,
  type UserPreset,
} from '@/lib/theme';

/** Email-safe Setting key for per-user theme storage. We lower-case the
 *  email and use a stable prefix so admins find their own theme even if
 *  they log in with mixed-case email. */
function activeKeyFor(email: string): string {
  return `theme.user.${email.toLowerCase()}.active`;
}
function presetsKeyFor(email: string): string {
  return `theme.user.${email.toLowerCase()}.presets`;
}

// Legacy keys (pre-per-user). Both are dead data now — kept around in
// the DB only for archeology. Nothing reads or writes to them. We dropped
// the legacy `theme.active` fallback after a corrupted row poisoned every
// admin who didn't have their own per-user theme yet (e.g. white token
// set to a deep blue, sidebar to a light blue). Falling back to
// DEFAULT_THEME is safer: it can never be corrupted at runtime, and a
// fresh admin sees the brand palette every time until they save their
// own. Don't add the fallback back without first making the legacy row
// permanently read-only at the API layer.
const LEGACY_ACTIVE_KEY = 'theme.active';
const LEGACY_PRESETS_KEY = 'theme.presets';
// Suppress unused-vars — kept for documentation; intentionally not
// referenced anywhere in the read path.
void LEGACY_ACTIVE_KEY; void LEGACY_PRESETS_KEY;

/**
 * Returns the active theme for a specific admin email.
 *  - If the admin has a per-user `theme.user.<email>.active` row, use it.
 *  - Otherwise fall through to DEFAULT_THEME (the brand defaults baked
 *    into lib/theme.ts).
 *
 * Never reads the legacy global `theme.active` — that path was a
 * corruption vector (any single bad save poisoned every admin with no
 * per-user row). DEFAULT_THEME is in code, immutable at runtime, and
 * always renders as a clean brand palette.
 */
export async function getActiveTheme(email?: string | null): Promise<ThemeColors> {
  try {
    if (email) {
      const userRow = await prisma.setting.findUnique({ where: { key: activeKeyFor(email) } });
      if (userRow) {
        const parsed = JSON.parse(userRow.value);
        return normalizeTheme(parsed);
      }
    }
    return { ...DEFAULT_THEME };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/**
 * Returns the user-saved presets for a specific admin email. Built-ins are
 * NOT included here — the admin UI merges them on the client side via
 * BUILT_IN_PRESETS so their colour values stay in sync with the catalog.
 */
export async function getUserPresets(email?: string | null): Promise<UserPreset[]> {
  try {
    // Same rationale as the active-theme fallback above: don't read the
    // legacy global presets row. Anonymous calls (no email) just get an
    // empty list; a fresh admin will see the built-ins from
    // BUILT_IN_PRESETS until they save their first preset.
    if (!email) return [];
    const row = await prisma.setting.findUnique({ where: { key: presetsKeyFor(email) } });
    if (!row) return [];
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is UserPreset =>
      p && typeof p === 'object'
      && typeof p.id === 'string' && p.id.startsWith('user:')
      && typeof p.name === 'string'
      && p.colors && typeof p.colors === 'object'
    ).map(p => ({
      ...p,
      colors: normalizeTheme(p.colors),
    }));
  } catch {
    return [];
  }
}

/** Returns built-in + this user's saved presets merged. Built-ins first. */
export async function getAllPresets(email?: string | null): Promise<Preset[]> {
  const userPresets = await getUserPresets(email);
  return [...BUILT_IN_PRESETS, ...userPresets];
}

/** Persist the active theme for a specific admin. Caller must pre-validate. */
export async function saveActiveTheme(email: string, colors: ThemeColors, updatedBy?: string): Promise<void> {
  const key = activeKeyFor(email);
  const value = JSON.stringify(colors);
  await prisma.setting.upsert({
    where: { key },
    create: { key, category: 'theme', value, updatedBy: updatedBy ?? email },
    update: { value, updatedBy: updatedBy ?? email },
  });
}

/** Replace the user-presets array for a specific admin in one upsert. */
export async function saveUserPresets(email: string, presets: UserPreset[], updatedBy?: string): Promise<void> {
  const key = presetsKeyFor(email);
  const value = JSON.stringify(presets);
  await prisma.setting.upsert({
    where: { key },
    create: { key, category: 'theme', value, updatedBy: updatedBy ?? email },
    update: { value, updatedBy: updatedBy ?? email },
  });
}
