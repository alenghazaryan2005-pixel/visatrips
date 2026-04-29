import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetBus,
  _subscriberCount,
  emitThemeChanged,
  subscribeThemeChanged,
} from '@/lib/theme-bus';
import { DEFAULT_THEME } from '@/lib/theme';

afterEach(() => { _resetBus(); });

describe('theme-bus', () => {
  it('starts with zero subscribers', () => {
    expect(_subscriberCount()).toBe(0);
  });

  it('subscribe registers a listener and unsubscribe removes it', () => {
    const cb = vi.fn();
    const unsub = subscribeThemeChanged(cb);
    expect(_subscriberCount()).toBe(1);
    unsub();
    expect(_subscriberCount()).toBe(0);
  });

  it('emit fires every active subscriber', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeThemeChanged(a);
    subscribeThemeChanged(b);
    emitThemeChanged(DEFAULT_THEME);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(DEFAULT_THEME);
    expect(b).toHaveBeenCalledWith(DEFAULT_THEME);
  });

  it('does not fire after unsubscribe', () => {
    const cb = vi.fn();
    const unsub = subscribeThemeChanged(cb);
    unsub();
    emitThemeChanged(DEFAULT_THEME);
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles multiple emits in order', () => {
    const seen: string[] = [];
    subscribeThemeChanged(c => { seen.push(c.blue); });
    emitThemeChanged({ ...DEFAULT_THEME, blue: '#FF0000' });
    emitThemeChanged({ ...DEFAULT_THEME, blue: '#00FF00' });
    emitThemeChanged({ ...DEFAULT_THEME, blue: '#0000FF' });
    expect(seen).toEqual(['#FF0000', '#00FF00', '#0000FF']);
  });

  it('one subscriber unsubscribing does not affect others', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeThemeChanged(a);
    subscribeThemeChanged(b);
    unsubA();
    emitThemeChanged(DEFAULT_THEME);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('persists across re-imports via globalThis (singleton check)', async () => {
    const cb = vi.fn();
    subscribeThemeChanged(cb);
    expect(_subscriberCount()).toBe(1);
    // Re-import the module — the emitter should be the same instance.
    const reimport = await import('@/lib/theme-bus');
    expect(reimport._subscriberCount()).toBe(1);
    reimport.emitThemeChanged(DEFAULT_THEME);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
