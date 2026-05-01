import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetBus,
  _subscriberCount,
  emitThemeChanged,
  subscribeThemeChanged,
} from '@/lib/theme-bus';
import { DEFAULT_THEME } from '@/lib/theme';

afterEach(() => { _resetBus(); });

const ALICE = 'alice@v.com';
const BOB   = 'bob@v.com';

describe('theme-bus (per-user)', () => {
  it('starts with zero subscribers for any email', () => {
    expect(_subscriberCount(ALICE)).toBe(0);
    expect(_subscriberCount(BOB)).toBe(0);
  });

  it('subscribe registers a listener for that email; unsubscribe removes it', () => {
    const cb = vi.fn();
    const unsub = subscribeThemeChanged(ALICE, cb);
    expect(_subscriberCount(ALICE)).toBe(1);
    expect(_subscriberCount(BOB)).toBe(0);
    unsub();
    expect(_subscriberCount(ALICE)).toBe(0);
  });

  it('emit only fires subscribers registered under the SAME email', () => {
    const aliceA = vi.fn();
    const aliceB = vi.fn();
    const bob = vi.fn();
    subscribeThemeChanged(ALICE, aliceA);
    subscribeThemeChanged(ALICE, aliceB);
    subscribeThemeChanged(BOB, bob);

    emitThemeChanged(ALICE, DEFAULT_THEME);
    expect(aliceA).toHaveBeenCalledTimes(1);
    expect(aliceB).toHaveBeenCalledTimes(1);
    expect(bob).not.toHaveBeenCalled();

    emitThemeChanged(BOB, DEFAULT_THEME);
    expect(bob).toHaveBeenCalledTimes(1);
    expect(aliceA).toHaveBeenCalledTimes(1); // unchanged
  });

  it('email matching is case-insensitive', () => {
    const cb = vi.fn();
    subscribeThemeChanged('Alice@V.com', cb);
    emitThemeChanged('alice@v.com', DEFAULT_THEME);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire after unsubscribe', () => {
    const cb = vi.fn();
    const unsub = subscribeThemeChanged(ALICE, cb);
    unsub();
    emitThemeChanged(ALICE, DEFAULT_THEME);
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles multiple emits in order', () => {
    const seen: string[] = [];
    subscribeThemeChanged(ALICE, c => { seen.push(c.blue); });
    emitThemeChanged(ALICE, { ...DEFAULT_THEME, blue: '#FF0000' });
    emitThemeChanged(ALICE, { ...DEFAULT_THEME, blue: '#00FF00' });
    emitThemeChanged(ALICE, { ...DEFAULT_THEME, blue: '#0000FF' });
    expect(seen).toEqual(['#FF0000', '#00FF00', '#0000FF']);
  });

  it('one subscriber unsubscribing does not affect others under the same email', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeThemeChanged(ALICE, a);
    subscribeThemeChanged(ALICE, b);
    unsubA();
    emitThemeChanged(ALICE, DEFAULT_THEME);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('persists across re-imports via globalThis (singleton check)', async () => {
    const cb = vi.fn();
    subscribeThemeChanged(ALICE, cb);
    expect(_subscriberCount(ALICE)).toBe(1);
    const reimport = await import('@/lib/theme-bus');
    expect(reimport._subscriberCount(ALICE)).toBe(1);
    reimport.emitThemeChanged(ALICE, DEFAULT_THEME);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
