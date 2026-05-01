'use client';

/**
 * Subscribes to /api/theme/stream and applies pushed theme updates to the
 * document's <html> :root inline styles. Mounted once in AdminLayout so
 * every admin page (and only admin pages) repaints when an admin saves a
 * new palette — no manual refresh needed. Customer-facing pages don't
 * mount this and never see the theme.
 *
 * SUPPRESSED on /admin/theme: that page manages :root directly for live
 * editing/preview and we don't want SSE updates fighting the draft state.
 * The page itself emits the canonical save via the API, so when the admin
 * navigates away, every other admin tab will already be in sync.
 *
 * EventSource auto-reconnects on transient errors (it's part of the spec),
 * so we don't need manual retry logic. We close it on unmount or path
 * change so we don't pile up duplicate connections.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DEFAULT_THEME, THEME_KEYS, applyThemeToDocument, type ThemeColors } from '@/lib/theme';

const SUPPRESSED_PATHS = ['/admin/theme'];

/**
 * Build a complete ThemeColors from a (potentially partial) push payload —
 * any missing key falls back to DEFAULT_THEME so applyThemeToDocument always
 * gets a fully-populated palette.
 */
function ensureCompleteTheme(partial: Partial<ThemeColors>): ThemeColors {
  const out = { ...DEFAULT_THEME };
  for (const k of THEME_KEYS) {
    const v = partial[k];
    if (typeof v === 'string') out[k] = v;
  }
  return out;
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
        if (data && typeof data === 'object') {
          // Update BOTH the inline :root styles (for instant repaint) AND
          // the persistent <style id="theme-active"> block (so the change
          // survives intra-admin navigations where the shared layout
          // doesn't re-render).
          applyThemeToDocument(ensureCompleteTheme(data));
        }
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
