'use client';

/**
 * Applies PUBLISHED page customizations to the live DOM. Mounted in the
 * root layout so it runs on every page — published owner customizations
 * reach every visitor.
 *
 * Two paths:
 *   1. CSS-driven properties (color, padding, etc.) → injected as a
 *      <style id="page-customizations"> block. Browser does the work.
 *   2. Synthetic properties ('text', 'hidden', 'src', 'href', 'target') →
 *      DOM mutations applied after page hydration + on every navigation.
 *
 * Drafts (owner work-in-progress) are deliberately NOT loaded here. The
 * SiteEditor takes care of showing them via applyLocal during the
 * active editing session — meaning a refresh always renders the page
 * from published-only state, which is the user-facing semantic of
 * "refresh discards pending changes".
 *
 * Re-fetches on path change so navigations between admin/customer pages
 * pick up the right per-page overrides.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  applySyntheticMutation,
  buildCustomizationCSS,
  type EditableProperty,
} from '@/lib/customizations';

interface CustomizationRow {
  id: string;
  pagePath: string;
  selector: string;
  property: EditableProperty;
  value: string;
  status: 'draft' | 'published';
}

const STYLE_ELEMENT_ID = 'page-customizations';

export function CustomizationApplier() {
  const pathname = usePathname() || '/';

  useEffect(() => {
    let cancelled = false;
    let mutationObserver: MutationObserver | null = null;

    (async () => {
      try {
        // Published only — drafts are handled live by the SiteEditor so
        // a page refresh always returns to the published state.
        const res = await fetch(`/api/customizations?path=${encodeURIComponent(pathname)}`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const rows: CustomizationRow[] = Array.isArray(data.customizations) ? data.customizations : [];
        if (cancelled) return;
        // Defensive filter — the API already excludes drafts when we
        // didn't pass `drafts=1`, but if anything ever leaks through we
        // still don't want it here.
        const published = rows.filter(r => r.status === 'published');

        // 1. CSS block for real properties (everything except DOM-attribute
        //    synthetic props).
        const cssRows = published.filter(r =>
          r.property !== 'text' && r.property !== 'hidden' && r.property !== 'src' &&
          r.property !== 'href' && r.property !== 'target',
        );
        const css = buildCustomizationCSS(cssRows);
        let styleEl = document.getElementById(STYLE_ELEMENT_ID);
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = STYLE_ELEMENT_ID;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;

        // 2. DOM mutations for synthetic properties. Re-applied on
        // navigation (above) and on DOM mutations (Mutation Observer
        // below) so React re-renders don't wipe out our text overrides.
        //
        // Loop-prevention: applySyntheticMutation is a no-op when state
        // already matches the override, so our own writes don't trigger
        // a fresh observer event. We additionally throttle the reapply
        // via a 100ms timer to absorb React reconciliation bursts —
        // without this, a fast mid-render sequence could still lock up
        // the main thread on a long page.
        const synthRows = published.filter(r =>
          r.property === 'text' || r.property === 'hidden' || r.property === 'src' ||
          r.property === 'href' || r.property === 'target',
        );
        const reapply = () => {
          for (const r of synthRows) applySyntheticMutation(r);
        };
        reapply();

        if (synthRows.length > 0 && typeof MutationObserver !== 'undefined') {
          let scheduled = false;
          mutationObserver = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => { scheduled = false; reapply(); }, 100);
          });
          mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
      } catch {
        // Silent — customizations are an enhancement, not core path.
      }
    })();

    return () => {
      cancelled = true;
      mutationObserver?.disconnect();
    };
  }, [pathname]);

  return null;
}
