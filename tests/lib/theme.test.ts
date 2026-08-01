import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESETS,
  DEFAULT_THEME,
  GROUP_META,
  KEYS_BY_GROUP,
  THEME_KEYS,
  TOKEN_META,
  generateThemeCSS,
  generateUserPresetId,
  isBuiltInPresetId,
  isValidHex,
  normalizeTheme,
  validateThemeStrict,
} from '@/lib/theme';

describe('isValidHex', () => {
  it('accepts 6-digit hex', () => {
    expect(isValidHex('#FFAABB')).toBe(true);
    expect(isValidHex('#000000')).toBe(true);
    expect(isValidHex('#abcdef')).toBe(true);
  });
  it('accepts 3-digit hex shorthand', () => {
    expect(isValidHex('#FAB')).toBe(true);
    expect(isValidHex('#000')).toBe(true);
  });
  it('rejects bare strings without #', () => {
    expect(isValidHex('FFAABB')).toBe(false);
    expect(isValidHex('abc')).toBe(false);
  });
  it('rejects rgb/named/garbage', () => {
    expect(isValidHex('rgb(0,0,0)')).toBe(false);
    expect(isValidHex('red')).toBe(false);
    expect(isValidHex('#GGGGGG')).toBe(false);
    expect(isValidHex('#1234567')).toBe(false);
    expect(isValidHex('#12')).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(isValidHex(null)).toBe(false);
    expect(isValidHex(undefined)).toBe(false);
    expect(isValidHex(123)).toBe(false);
    expect(isValidHex({})).toBe(false);
  });
});

describe('DEFAULT_THEME + TOKEN_META', () => {
  it('has an entry for every token', () => {
    for (const k of THEME_KEYS) {
      expect(DEFAULT_THEME[k]).toBeDefined();
      expect(isValidHex(DEFAULT_THEME[k])).toBe(true);
      expect(TOKEN_META[k]).toBeDefined();
      expect(TOKEN_META[k].label).toBeTruthy();
      expect(TOKEN_META[k].description).toBeTruthy();
    }
  });
  it('exposes the expected token catalog (14 tokens across 4 groups)', () => {
    expect(THEME_KEYS).toHaveLength(14);
    // Snapshot the keys so accidental removals get caught loudly.
    expect(THEME_KEYS).toEqual([
      'ink', 'slate', 'blue', 'blue2', 'navy',
      'sky', 'white', 'cloud', 'mist',
      'sidebar',
      'success', 'warning', 'danger', 'info',
    ]);
  });

  it('every token has a group assigned', () => {
    for (const k of THEME_KEYS) {
      const meta = TOKEN_META[k];
      expect(['brand', 'surface', 'admin', 'status']).toContain(meta.group);
    }
  });

  /**
   * Drift guard. ThemeStyleInjector renders DEFAULT_THEME as a `:root{…}`
   * <style> in the body of every admin page — after globals.css in document
   * order — so at equal specificity these values win. When a token drifts,
   * the admin panel silently reverts to the stale colour and the built-in
   * "Default Blue" preset (which spreads DEFAULT_THEME) stops matching the
   * brand. That regression shipped once already during the navy/blue
   * migration, when globals.css moved blue/blue2/navy and lib/theme.ts
   * didn't. This parses the real stylesheet so the two can't diverge again.
   */
  it('matches the :root palette in app/globals.css', () => {
    const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');

    // Pick the `:root` block that actually declares the brand palette.
    // globals.css has more than one: an earlier shadcn-style block using
    // HSL triplets (--background: 228 60% 98%), then the brand hex block.
    // We also must NOT match `.legacy-palette`, which deliberately
    // redefines blue/blue2/navy with the old marketing periwinkles for
    // /india, /aruba and /legacy.
    let rootBlock = '';
    for (const m of css.matchAll(/:root\s*\{/g)) {
      const from = m.index! + m[0].length;
      const body = css.slice(from, css.indexOf('}', from));
      if (body.includes('--ink')) { rootBlock = body; break; }
    }
    expect(rootBlock, 'could not find the :root block declaring --ink in globals.css').not.toBe('');

    const cssTokens: Record<string, string> = {};
    for (const m of rootBlock.matchAll(/--([a-z0-9]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) {
      if (!(m[1] in cssTokens)) cssTokens[m[1]] = m[2].toUpperCase();
    }

    // Sanity-check the parse itself, so a globals.css restructure that
    // breaks extraction fails loudly instead of vacuously passing.
    expect(Object.keys(cssTokens).length).toBeGreaterThanOrEqual(THEME_KEYS.length);

    for (const k of THEME_KEYS) {
      expect(cssTokens[k], `--${k} missing from the :root block in globals.css`).toBeDefined();
      expect(
        DEFAULT_THEME[k].toUpperCase(),
        `DEFAULT_THEME.${k} (${DEFAULT_THEME[k]}) !== globals.css --${k} (${cssTokens[k]}). ` +
        `Change it in BOTH places — otherwise the admin panel renders the stale value.`,
      ).toBe(cssTokens[k]);
    }
  });
});

describe('normalizeTheme', () => {
  it('returns DEFAULT_THEME for non-objects', () => {
    expect(normalizeTheme(null)).toEqual(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(normalizeTheme('garbage')).toEqual(DEFAULT_THEME);
    expect(normalizeTheme(123)).toEqual(DEFAULT_THEME);
  });
  it('keeps valid tokens, falls back to defaults for invalid ones', () => {
    const result = normalizeTheme({ blue: '#FF0000', navy: 'not-a-color', extra: 'ignore me' });
    expect(result.blue).toBe('#FF0000');
    expect(result.navy).toBe(DEFAULT_THEME.navy);
    expect(result).not.toHaveProperty('extra');
  });
  it('uppercases hex values', () => {
    expect(normalizeTheme({ blue: '#abcdef' }).blue).toBe('#ABCDEF');
  });
  it('returns full token set even with empty input', () => {
    const result = normalizeTheme({});
    for (const k of THEME_KEYS) {
      expect(result[k]).toBeDefined();
    }
  });
});

describe('validateThemeStrict', () => {
  it('passes for full valid theme', () => {
    const result = validateThemeStrict(DEFAULT_THEME);
    expect(result).toEqual(DEFAULT_THEME);
  });
  it('throws when input is not an object', () => {
    expect(() => validateThemeStrict(null)).toThrow(/Theme must be an object/);
    expect(() => validateThemeStrict('string')).toThrow();
  });
  it('throws when a token is missing', () => {
    const partial = { ...DEFAULT_THEME };
    delete (partial as any).blue;
    expect(() => validateThemeStrict(partial)).toThrow(/blue/);
  });
  it('throws when a token is invalid', () => {
    expect(() => validateThemeStrict({ ...DEFAULT_THEME, blue: 'not-hex' })).toThrow(/blue/);
  });
  it('uppercases output', () => {
    const lower = Object.fromEntries(THEME_KEYS.map(k => [k, '#aabbcc']));
    const result = validateThemeStrict(lower);
    for (const k of THEME_KEYS) expect(result[k]).toBe('#AABBCC');
  });
});

describe('generateThemeCSS', () => {
  it('produces a :root block with every catalog token', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toMatch(/^:root\{/);
    expect(css).toMatch(/\}\n$/);
    for (const k of THEME_KEYS) {
      expect(css).toContain(`--${k}: ${DEFAULT_THEME[k]};`);
    }
  });
  it('reflects custom colors', () => {
    const custom = { ...DEFAULT_THEME, blue: '#FF0000' };
    const css = generateThemeCSS(custom);
    expect(css).toContain('--blue: #FF0000;');
    expect(css).not.toContain('--blue: #6C8AFF;');
  });
  it('emits one declaration per token (matches THEME_KEYS length)', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    const declLines = css.split('\n').filter(l => /^\s*--/.test(l));
    expect(declLines).toHaveLength(THEME_KEYS.length);
  });
  it('emits the new admin/status tokens', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    expect(css).toContain('--sidebar:');
    expect(css).toContain('--success:');
    expect(css).toContain('--warning:');
    expect(css).toContain('--danger:');
    expect(css).toContain('--info:');
  });
});

describe('BUILT_IN_PRESETS', () => {
  it('every preset has a complete, valid color set', () => {
    for (const p of BUILT_IN_PRESETS) {
      for (const k of THEME_KEYS) {
        expect(p.colors[k]).toBeDefined();
        expect(isValidHex(p.colors[k])).toBe(true);
      }
    }
  });
  it('uses unique ids prefixed with "builtin:"', () => {
    const ids = BUILT_IN_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('builtin:')).toBe(true);
  });
  it('marks every preset as builtIn:true', () => {
    for (const p of BUILT_IN_PRESETS) expect(p.builtIn).toBe(true);
  });
  it('Default Blue preset matches DEFAULT_THEME', () => {
    const dflt = BUILT_IN_PRESETS.find(p => p.id === 'builtin:default-blue');
    expect(dflt).toBeDefined();
    expect(dflt!.colors).toEqual(DEFAULT_THEME);
  });
});

describe('KEYS_BY_GROUP + GROUP_META', () => {
  it('every key in THEME_KEYS appears under exactly one group', () => {
    const seen = new Set<string>();
    for (const keys of Object.values(KEYS_BY_GROUP)) {
      for (const k of keys) {
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    expect(seen.size).toBe(THEME_KEYS.length);
  });
  it('every group has metadata (label + description)', () => {
    for (const group of Object.keys(KEYS_BY_GROUP)) {
      const meta = GROUP_META[group as keyof typeof GROUP_META];
      expect(meta).toBeDefined();
      expect(meta.label).toBeTruthy();
      expect(meta.description).toBeTruthy();
    }
  });
  it('admin group contains the sidebar token', () => {
    expect(KEYS_BY_GROUP.admin).toContain('sidebar');
  });
  it('status group contains all four semantic colours', () => {
    expect(KEYS_BY_GROUP.status).toEqual(expect.arrayContaining(['success', 'warning', 'danger', 'info']));
  });
});

describe('isBuiltInPresetId', () => {
  it('recognises builtin: prefix', () => {
    expect(isBuiltInPresetId('builtin:default-blue')).toBe(true);
    expect(isBuiltInPresetId('builtin:anything')).toBe(true);
  });
  it('rejects user: prefix and others', () => {
    expect(isBuiltInPresetId('user:abc123')).toBe(false);
    expect(isBuiltInPresetId('default-blue')).toBe(false);
    expect(isBuiltInPresetId('')).toBe(false);
  });
});

describe('generateUserPresetId', () => {
  it('produces user:-prefixed ids', () => {
    const id = generateUserPresetId();
    expect(id.startsWith('user:')).toBe(true);
  });
  it('produces unique ids on subsequent calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(generateUserPresetId());
    expect(ids.size).toBe(50);
  });
});
