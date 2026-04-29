import { describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS,
  FLAG_BY_ID,
  flagSettingKey,
  parseFlagValue,
} from '@/lib/featureFlags';

describe('FEATURE_FLAGS catalog', () => {
  it('has unique ids', () => {
    const ids = FEATURE_FLAGS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every entry has a label and a description', () => {
    for (const f of FEATURE_FLAGS) {
      expect(f.label).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(typeof f.defaultValue).toBe('boolean');
    }
  });
  it('FLAG_BY_ID maps every catalog entry by id', () => {
    for (const f of FEATURE_FLAGS) expect(FLAG_BY_ID[f.id]).toBe(f);
    expect(Object.keys(FLAG_BY_ID).length).toBe(FEATURE_FLAGS.length);
  });
  it('orderTags flag exists and defaults to off', () => {
    const f = FLAG_BY_ID.orderTags;
    expect(f).toBeDefined();
    expect(f!.defaultValue).toBe(false);
  });
});

describe('flagSettingKey', () => {
  it('prefixes with "features."', () => {
    expect(flagSettingKey('orderTags')).toBe('features.orderTags');
    expect(flagSettingKey('foo')).toBe('features.foo');
  });
});

describe('parseFlagValue', () => {
  it('returns parsed boolean from JSON-serialized true/false', () => {
    expect(parseFlagValue('true', false)).toBe(true);
    expect(parseFlagValue('false', true)).toBe(false);
  });
  it('returns default when value is null/undefined', () => {
    expect(parseFlagValue(null, true)).toBe(true);
    expect(parseFlagValue(undefined, false)).toBe(false);
  });
  it('returns default when JSON is invalid', () => {
    expect(parseFlagValue('not-json', true)).toBe(true);
    expect(parseFlagValue('}{', false)).toBe(false);
  });
  it('coerces string "true"/"false" (defensive)', () => {
    expect(parseFlagValue(JSON.stringify('true'),  false)).toBe(true);
    expect(parseFlagValue(JSON.stringify('false'), true)).toBe(false);
  });
  it('returns default when JSON is non-boolean (number, object)', () => {
    expect(parseFlagValue(JSON.stringify(1),       false)).toBe(false);
    expect(parseFlagValue(JSON.stringify({ a: 1 }),true)).toBe(true);
  });
});
