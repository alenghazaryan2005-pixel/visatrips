/**
 * In-process pub/sub for live theme changes — used by the SSE endpoint at
 * /api/theme/stream to push updates to every connected page the moment an
 * admin saves a new palette.
 *
 * The emitter is stashed on `globalThis` so it survives Next.js hot reloads
 * in dev (otherwise every reload would orphan the existing subscribers).
 *
 * SCALE NOTE: this is single-process. If we ever run multiple Next.js
 * instances behind a load balancer (e.g. multi-region serverless), saves
 * routed to instance A won't notify subscribers on instance B. To scale
 * across instances, swap this for Redis pub/sub or similar. For a single
 * Vercel deployment / single Node process, in-process is fine.
 */

import { EventEmitter } from 'events';
import type { ThemeColors } from '@/lib/theme';

const KEY = '__visatrips_theme_bus__';

type GlobalWithBus = typeof globalThis & { [KEY]?: EventEmitter };
const g = globalThis as GlobalWithBus;

function getEmitter(): EventEmitter {
  if (!g[KEY]) {
    const e = new EventEmitter();
    e.setMaxListeners(0); // every connected SSE client adds a listener
    g[KEY] = e;
  }
  return g[KEY]!;
}

const EVENT = 'theme:changed';

/** Broadcast a theme change to every active subscriber. */
export function emitThemeChanged(colors: ThemeColors): void {
  getEmitter().emit(EVENT, colors);
}

/**
 * Subscribe to theme changes. Returns an unsubscribe function — callers MUST
 * call it on connection close to avoid leaking listeners.
 */
export function subscribeThemeChanged(cb: (colors: ThemeColors) => void): () => void {
  const e = getEmitter();
  e.on(EVENT, cb);
  return () => { e.off(EVENT, cb); };
}

/** For tests — number of currently registered subscribers. */
export function _subscriberCount(): number {
  return getEmitter().listenerCount(EVENT);
}

/** For tests — clear all subscribers. */
export function _resetBus(): void {
  getEmitter().removeAllListeners(EVENT);
}
