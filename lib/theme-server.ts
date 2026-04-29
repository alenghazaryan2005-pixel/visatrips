/**
 * Server-side theme helpers — read/write the active theme and presets from
 * the Setting table. Kept separate from lib/theme.ts so client components
 * can import the pure helpers (DEFAULT_THEME, normalizeTheme, etc.) without
 * pulling in Prisma.
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

const ACTIVE_KEY = 'theme.active';
const PRESETS_KEY = 'theme.presets';

/** Returns the currently active theme, falling back to DEFAULT_THEME on any error. */
export async function getActiveTheme(): Promise<ThemeColors> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: ACTIVE_KEY } });
    if (!row) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(row.value);
    return normalizeTheme(parsed);
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/**
 * Returns the user-saved presets (built-ins are NOT included — the admin UI
 * merges built-ins on the client side via BUILT_IN_PRESETS).
 */
export async function getUserPresets(): Promise<UserPreset[]> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: PRESETS_KEY } });
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

/** Returns built-in + user presets merged. Built-ins always come first. */
export async function getAllPresets(): Promise<Preset[]> {
  const userPresets = await getUserPresets();
  return [...BUILT_IN_PRESETS, ...userPresets];
}

/** Persist the active theme. Caller must pre-validate. */
export async function saveActiveTheme(colors: ThemeColors, updatedBy?: string): Promise<void> {
  const value = JSON.stringify(colors);
  await prisma.setting.upsert({
    where: { key: ACTIVE_KEY },
    create: { key: ACTIVE_KEY, category: 'theme', value, updatedBy: updatedBy ?? null },
    update: { value, updatedBy: updatedBy ?? null },
  });
}

/** Replace the user-presets array in one upsert. Caller assembles the array. */
export async function saveUserPresets(presets: UserPreset[], updatedBy?: string): Promise<void> {
  const value = JSON.stringify(presets);
  await prisma.setting.upsert({
    where: { key: PRESETS_KEY },
    create: { key: PRESETS_KEY, category: 'theme', value, updatedBy: updatedBy ?? null },
    update: { value, updatedBy: updatedBy ?? null },
  });
}
