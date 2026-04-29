'use client';

/**
 * Subscribes to /api/theme/stream and applies pushed theme updates to the
 * document's <html> :root inline styles. Mounted once in RootLayout so every
 * page on the site (admin + customer) re-paints when an admin saves a new
 * palette — no manual refresh needed.
 *
 * SUPPRESSED on /admin/theme: that page manages :root directly for live
 * editing/preview and we don't want SSE updates fighting the draft state.
 * The page itself emits the canonical save via the API, so when the admin
 * navigates away, every other tab will already be in sync.
 *
 * EventSource auto-reconnects on transient errors (it's part of the spec),
 * so we don't need manual retry logic. We close it on unmount or path
 * change so we don't pile up duplicate connections.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { THEME_KEYS, type ThemeColors, type ThemeKey } from '@/lib/theme';

const SUPPRESSED_PATHS = ['/admin/theme'];

function applyToRoot(colors: Partial<ThemeColors>): void {
  const root = document.documentElement;
  for (const k of THEME_KEYS) {
    const v = colors[k];
    if (typeof v === 'string') {
      root.style.setProperty(`--${k}`, v);
    }
  }
}

export function ThemeWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (SUPPRESSED_PATHS.some(p => pathname?.startsWith(p))) return;
    if (typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/theme/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as Partial<ThemeColors>;
        if (data && typeof data === 'object') applyToRoot(data);
      } catch {
        // Malformed payload — ignore. Next event will re-sync.
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects per WHATWG spec. Nothing to do — if the
      // server is genuinely gone the browser will keep trying with backoff.
    };
    return () => { es.close(); };
  }, [pathname]);

  return null;
}
