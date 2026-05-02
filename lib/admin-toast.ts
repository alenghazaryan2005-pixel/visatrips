/**
 * Tiny toast notification system for the admin panel.
 *
 * Module-level singleton store + a `useToasts()` hook + a `toast.*`
 * imperative API. No provider required — components import `toast` and
 * call it from any handler / async callback. The renderer
 * (<AdminToaster />, mounted in admin/layout.tsx) subscribes via the
 * hook and renders the active stack.
 *
 * Why not a context provider? Toasts get fired from imperative code
 * paths (handlers, fetch chains, undo callbacks). A module-level store
 * means we don't have to thread context through every async closure.
 *
 * Toast types:
 *   - 'success' (green) — "Marked #1567 COMPLETED"
 *   - 'error'   (red)   — "Couldn't update status — retry?"
 *   - 'info'    (blue)  — "Order #1567 saved"
 *
 * Optional undo: pass `{ undo: () => void }` and a button appears next
 * to the message. Clicking it calls the function and dismisses the toast.
 * Undo extends the dismiss timer to 8s (vs the default 4s) since the
 * user explicitly needs time to react.
 */

import { useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Optional undo handler — when provided, toast renders an "Undo"
   *  button. Calling it dismisses the toast immediately. */
  undo?: () => void;
  /** Internal — when the toast was created (epoch ms). Used by the
   *  renderer to compute remaining time / animation phase. */
  createdAt: number;
  /** Total ms before auto-dismiss. */
  durationMs: number;
}

const DEFAULT_DURATION = 4000;
const UNDO_DURATION = 8000;
const MAX_TOASTS = 5; // hard cap so a flood doesn't tile the screen

type Listener = (toasts: Toast[]) => void;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn(toasts);
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function add(kind: ToastKind, message: string, opts?: { undo?: () => void; durationMs?: number }): string {
  const id = genId();
  const t: Toast = {
    id,
    kind,
    message,
    undo: opts?.undo,
    createdAt: Date.now(),
    durationMs: opts?.durationMs ?? (opts?.undo ? UNDO_DURATION : DEFAULT_DURATION),
  };
  // Drop the oldest if we're at cap. Newer toasts win — assumption is the
  // most recent action is what the user cares about.
  toasts = [...toasts, t].slice(-MAX_TOASTS);
  notify();
  return id;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter(t => t.id !== id);
  notify();
}

export const toast = {
  success: (message: string, opts?: { undo?: () => void; durationMs?: number }) => add('success', message, opts),
  error:   (message: string, opts?: { undo?: () => void; durationMs?: number }) => add('error',   message, opts),
  info:    (message: string, opts?: { undo?: () => void; durationMs?: number }) => add('info',    message, opts),
};

/** React hook — subscribes to toast changes and returns the current
 *  active stack. Use only inside the renderer; imperative code should
 *  call `toast.*` directly. */
export function useToasts(): Toast[] {
  const [snapshot, setSnapshot] = useState<Toast[]>(toasts);
  useEffect(() => {
    const listener: Listener = next => setSnapshot(next);
    listeners.add(listener);
    // Pull current state in case it changed between mount and effect.
    setSnapshot(toasts);
    return () => { listeners.delete(listener); };
  }, []);
  return snapshot;
}
