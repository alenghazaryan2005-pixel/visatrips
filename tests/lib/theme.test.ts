import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESETS,
  DEFAULT_THEME,
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
  it('exposes exactly 9 tokens', () => {
    expect(THEME_KEYS).toHaveLength(9);
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
  it('produces a :root block with all 9 tokens', () => {
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
  it('emits one declaration per token', () => {
    const css = generateThemeCSS(DEFAULT_THEME);
    // Each declaration is on its own line. There should be 9 declaration lines.
    const declLines = css.split('\n').filter(l => /^\s*--/.test(l));
    expect(declLines).toHaveLength(9);
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
