'use client';

/**
 * Client-side feature flag hook. Fetches /api/features once on mount and
 * caches the result on the module so subsequent uses on the same page
 * don't re-fetch. Returns `undefined` while loading so callers can render
 * a fallback if they want — most callers just check truthy/falsy.
 *
 *   const tagsOn = useFeatureFlag('orderTags');
 *   if (tagsOn) { ...render tag UI... }
 *
 * Caveat: the cache is per-page-load; navigation away & back re-fetches.
 * Good enough for admin-side toggles which change rarely.
 */

import { useEffect, useState } from 'react';
import { FLAG_BY_ID } from '@/lib/featureFlags';

interface CacheState {
  flags: Record<string, boolean> | null;
  inflight: Promise<Record<string, boolean>> | null;
}

const cache: CacheState = { flags: null, inflight: null };

async function fetchFlags(): Promise<Record<string, boolean>> {
  if (cache.flags) return cache.flags;
  if (cache.inflight) return cache.inflight;
  cache.inflight = fetch('/api/features', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : { flags: [] })
    .then(d => {
      const map: Record<string, boolean> = {};
      for (const f of (d.flags || [])) map[f.id] = !!f.enabled;
      cache.flags = map;
      cache.inflight = null;
      return map;
    })
    .catch(() => {
      // Network/parse failure → fall back to per-flag defaults so the UI
      // still renders something sensible.
      const map: Record<string, boolean> = {};
      for (const id of Object.keys(FLAG_BY_ID)) map[id] = FLAG_BY_ID[id].defaultValue;
      cache.flags = map;
      cache.inflight = null;
      return map;
    });
  return cache.inflight;
}

export function useFeatureFlag(id: string): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean | undefined>(() => cache.flags?.[id]);
  useEffect(() => {
    let cancelled = false;
    fetchFlags().then(map => { if (!cancelled) setEnabled(!!map[id]); });
    return () => { cancelled = true; };
  }, [id]);
  return enabled;
}

/** For use right after a successful POST /api/features — keeps the cache fresh. */
export function bustFeatureFlagCache(): void {
  cache.flags = null;
  cache.inflight = null;
}
