import { describe, it, expect } from 'vitest';
import {
  botMappingSettingKey,
  defaultBotMapping,
  getBotCatalog,
  normaliseBotSource,
  BUILT_IN_INDIA_BOT_STEPS,
  type BotSource,
} from '@/lib/botMapping';

describe('botMappingSettingKey', () => {
  it('uppercases the country code', () => {
    expect(botMappingSettingKey('india')).toBe('bot.mapping.INDIA');
    expect(botMappingSettingKey('INDIA')).toBe('bot.mapping.INDIA');
    expect(botMappingSettingKey('egypt')).toBe('bot.mapping.EGYPT');
  });
});

describe('defaultBotMapping', () => {
  it('returns an empty overrides map keyed to the uppercased country', () => {
    const m = defaultBotMapping('india');
    expect(m.country).toBe('INDIA');
    expect(m.overrides).toEqual({});
  });
});

describe('getBotCatalog', () => {
  it('returns the built-in India catalog for INDIA (any casing)', () => {
    expect(getBotCatalog('INDIA')).toBe(BUILT_IN_INDIA_BOT_STEPS);
    expect(getBotCatalog('india')).toBe(BUILT_IN_INDIA_BOT_STEPS);
  });

  it('returns an empty array for unsupported countries', () => {
    expect(getBotCatalog('TURKEY')).toEqual([]);
    expect(getBotCatalog('ZZ')).toEqual([]);
  });
});

describe('BUILT_IN_INDIA_BOT_STEPS integrity', () => {
  it('has unique step keys', () => {
    const keys = BUILT_IN_INDIA_BOT_STEPS.map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has unique field keys within each step', () => {
    for (const step of BUILT_IN_INDIA_BOT_STEPS) {
      const keys = step.fields.map(f => f.key);
      expect(new Set(keys).size, `duplicate field keys in step ${step.key}`).toBe(keys.length);
    }
  });

  it('every field has a non-empty selector, label, action, and defaultSource', () => {
    for (const step of BUILT_IN_INDIA_BOT_STEPS) {
      for (const f of step.fields) {
        expect(f.key, `field.key in ${step.key}`).toMatch(/^\w+$/);
        expect(f.label.length).toBeGreaterThan(0);
        expect(f.selector.length).toBeGreaterThan(0);
        expect(['fill', 'select', 'click', 'upload', 'check']).toContain(f.action);
        expect(f.defaultSource).toBeDefined();
      }
    }
  });

  it('defaultSource shapes are valid BotSource discriminants', () => {
    for (const step of BUILT_IN_INDIA_BOT_STEPS) {
      for (const f of step.fields) {
        const s = f.defaultSource;
        switch (s.type) {
          case 'schema':
            expect(s.fieldKey.length).toBeGreaterThan(0);
            break;
          case 'hardcoded':
            expect(typeof s.value).toBe('string');
            break;
          case 'skip':
          case 'manual':
            // no extra fields
            break;
          default:
            throw new Error(`unexpected source type on ${step.key}.${f.key}`);
        }
      }
    }
  });
});

describe('normaliseBotSource', () => {
  it('accepts the four valid shapes', () => {
    expect(normaliseBotSource({ type: 'skip' })).toEqual<BotSource>({ type: 'skip' });
    expect(normaliseBotSource({ type: 'manual' })).toEqual<BotSource>({ type: 'manual' });
    expect(normaliseBotSource({ type: 'schema', fieldKey: 'firstName' })).toEqual<BotSource>({
      type: 'schema',
      fieldKey: 'firstName',
    });
    expect(normaliseBotSource({ type: 'hardcoded', value: 'ORDINARY' })).toEqual<BotSource>({
      type: 'hardcoded',
      value: 'ORDINARY',
    });
  });

  it('trims whitespace on schema fieldKey', () => {
    expect(normaliseBotSource({ type: 'schema', fieldKey: '  passportNumber  ' })).toEqual<BotSource>({
      type: 'schema',
      fieldKey: 'passportNumber',
    });
  });

  it('allows empty hardcoded strings (they are still valid — could mean "clear the field")', () => {
    expect(normaliseBotSource({ type: 'hardcoded', value: '' })).toEqual<BotSource>({
      type: 'hardcoded',
      value: '',
    });
  });

  it('rejects non-object input', () => {
    expect(normaliseBotSource(null)).toBeNull();
    expect(normaliseBotSource(undefined)).toBeNull();
    expect(normaliseBotSource('skip')).toBeNull();
    expect(normaliseBotSource(42)).toBeNull();
  });

  it('rejects unknown type', () => {
    expect(normaliseBotSource({ type: 'weird' })).toBeNull();
    expect(normaliseBotSource({ type: '' })).toBeNull();
    expect(normaliseBotSource({})).toBeNull();
  });

  it('rejects schema without a usable fieldKey', () => {
    expect(normaliseBotSource({ type: 'schema' })).toBeNull();
    expect(normaliseBotSource({ type: 'schema', fieldKey: '' })).toBeNull();
    expect(normaliseBotSource({ type: 'schema', fieldKey: '   ' })).toBeNull();
    expect(normaliseBotSource({ type: 'schema', fieldKey: 42 })).toBeNull();
  });

  it('rejects hardcoded without a string value', () => {
    expect(normaliseBotSource({ type: 'hardcoded' })).toBeNull();
    expect(normaliseBotSource({ type: 'hardcoded', value: 42 })).toBeNull();
    expect(normaliseBotSource({ type: 'hardcoded', value: null })).toBeNull();
  });
});
