/**
 * Admin order/ticket queue navigation — shared between the list page
 * (which writes the current filter context on row-click) and the detail
 * page (which reads it to render Prev / Next / position controls).
 *
 * Stored in sessionStorage so it survives in-tab navigation but auto-
 * clears on tab close. We deliberately don't use localStorage — a queue
 * left over from yesterday would surface stale orders that may no longer
 * match the current filter.
 *
 * Queue entries also expire after 1 hour as a belt-and-braces measure
 * (e.g. you click into an order, leave the tab open until tomorrow, then
 * come back — the queue we built then is no longer trustworthy because
 * orders may have moved between statuses).
 *
 * The queue is keyed by a "scope" string so multiple lists can each keep
 * their own queue without clobbering one another (orders list, tickets
 * list, etc. — though only orders is wired in initially).
 */

export type AdminQueueScope = 'orders' | 'tickets';

export interface AdminQueue {
  /** Ordered list of identifiers (formatted order numbers, ticket numbers, etc.). */
  ids: string[];
  /** Human-readable description of the filter this queue was built from
   *  ("Needs Correction", "Tagged: VIP", "Search: smith"). Shown in the
   *  detail page's position counter. Null if no filter was active. */
  filterLabel: string | null;
  /** Epoch ms of when this queue was saved. We expire after 1h. */
  savedAt: number;
}

const STORAGE_KEY_PREFIX = 'admin-queue:';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

const key = (scope: AdminQueueScope) => STORAGE_KEY_PREFIX + scope;

/** Persist the current list's order of IDs + filter context. Call this
 *  from the list page right before navigating into a detail view. */
export function writeQueue(scope: AdminQueueScope, queue: Omit<AdminQueue, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: AdminQueue = { ...queue, savedAt: Date.now() };
    sessionStorage.setItem(key(scope), JSON.stringify(payload));
  } catch { /* sessionStorage full / unavailable — non-fatal */ }
}

/** Read the queue for a scope. Returns null when:
 *   - sessionStorage is unavailable
 *   - no queue was ever stored for this scope
 *   - the stored queue is older than MAX_AGE_MS
 *   - the stored payload is malformed
 */
export function readQueue(scope: AdminQueueScope): AdminQueue | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminQueue;
    if (!Array.isArray(parsed.ids) || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch { return null; }
}

/** Build position info for the detail page from the queue + current id.
 *  Returns null if no queue exists or the current id isn't part of it
 *  (e.g. user landed on the page directly via URL rather than from the
 *  list). The detail page hides Prev/Next when this returns null. */
export function getQueuePosition(
  scope: AdminQueueScope,
  currentId: string,
): { index: number; total: number; prevId: string | null; nextId: string | null; filterLabel: string | null } | null {
  const queue = readQueue(scope);
  if (!queue) return null;
  const index = queue.ids.indexOf(currentId);
  if (index === -1) return null;
  return {
    index,
    total: queue.ids.length,
    prevId: index > 0 ? queue.ids[index - 1] : null,
    nextId: index < queue.ids.length - 1 ? queue.ids[index + 1] : null,
    filterLabel: queue.filterLabel,
  };
}
