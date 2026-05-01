/**
 * In-process pub/sub for live theme changes — used by the SSE endpoint at
 * /api/theme/stream to push updates only to the matching admin's open tabs.
 *
 * Themes are per-user, so events are scoped by email: a save by Alice only
 * pushes to Alice's subscribed tabs, never to Bob's. Subscribers register
 * with their email; emit takes an email + colors and only fires callbacks
 * registered under the same email.
 *
 * The emitter is stashed on `globalThis` so it survives Next.js hot reloads
 * in dev (otherwise every reload would orphan the existing subscribers).
 *
 * SCALE NOTE: this is single-process. If we ever run multiple Next.js
 * instances behind a load balancer, saves routed to instance A won't notify
 * subscribers on instance B. Swap for Redis pub/sub (key channels by email)
 * when that becomes relevant. For a single Vercel deployment / Node process,
 * in-process is fine.
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

const eventName = (email: string): string => `theme:changed:${email.toLowerCase()}`;

/** Broadcast a theme change to subscribers registered under the given email. */
export function emitThemeChanged(email: string, colors: ThemeColors): void {
  getEmitter().emit(eventName(email), colors);
}

/**
 * Subscribe to a specific admin's theme changes. Returns an unsubscribe
 * function — callers MUST call it on connection close to avoid leaking
 * listeners.
 */
export function subscribeThemeChanged(email: string, cb: (colors: ThemeColors) => void): () => void {
  const e = getEmitter();
  const event = eventName(email);
  e.on(event, cb);
  return () => { e.off(event, cb); };
}

/** For tests — number of currently registered subscribers for a given email. */
export function _subscriberCount(email: string): number {
  return getEmitter().listenerCount(eventName(email));
}

/** For tests — clear all subscribers across every email channel. */
export function _resetBus(): void {
  getEmitter().removeAllListeners();
}
