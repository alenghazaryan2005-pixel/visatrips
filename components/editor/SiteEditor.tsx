'use client';

/**
 * Floating site editor — Phase 2 of the customization system. Mounted in
 * the root layout but renders only when the calling user is logged in as
 * an owner. The button sits top-left across the entire site (admin pages
 * and customer pages).
 *
 * Edit mode flow:
 *   1. Owner clicks "✏️ Customize" → enters edit mode.
 *   2. Hovering elements draws a blue outline; clicking selects.
 *   3. Property panel (right drawer) opens with the selected element's
 *      editable properties pre-filled from computed style.
 *   4. Editing a property → applied locally for instant preview AND saved
 *      to the DB as a draft (debounced).
 *   5. Owner clicks Publish → drafts → published → all visitors see it.
 *
 * Constraints we deliberately don't try to solve:
 *   - Layout reflow (move section A above section B)
 *   - New components (insert a new card here)
 *   - Image swap (no upload flow yet)
 *
 * Selectors are position-based (tag + nth-of-type back to body) so they
 * survive class-name churn but break if structural order changes. Owner
 * can re-edit if a deploy moves things around.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  EDITABLE_PROPERTIES,
  GROUP_LABELS,
  PROPERTIES_BY_GROUP,
  SITE_WIDE,
  buildSelector,
  type EditableProperty,
  type PropertyGroup,
} from '@/lib/customizations';

interface DraftRow {
  id: string;
  pagePath: string;
  selector: string;
  property: EditableProperty;
  value: string;
  status: 'draft' | 'published';
}

type Scope = 'page' | 'site';

const HIGHLIGHT_BORDER_ID = 'site-editor-highlight';
const SELECTED_BORDER_ID  = 'site-editor-selected';

export function SiteEditor() {
  const pathname = usePathname() || '/';
  const [role, setRole] = useState<'owner' | 'employee' | null>(null);

  // On mount, ask the server who we are. Non-owner / unauthenticated → null.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.role === 'owner') setRole('owner');
        else setRole('employee');
      } catch { /* not authed; stay null */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (role !== 'owner') return null;
  return <EditorRuntime pathname={pathname} />;
}

/* ── Inner runtime — only mounted for owners ─────────────────────────── */

type SelectedItem = { el: Element; selector: string; tag: string };

/* ── Undo / Redo ─────────────────────────────────────────────────────────
 * One drag, one panel edit, one image upload = ONE Action. An Action
 * bundles all the mutations that should rewind together (e.g. a free-move
 * drag changes position+top+left+width+height for every selected element
 * — undo should rewind all of that, not just one property).
 *
 * A Mutation captures the state BEFORE the change so undo can restore:
 *   - prevInline:      the literal inline-style value pre-edit ('' if unset)
 *   - prevDraftValue:  the draft row's value pre-edit (null if no draft)
 * Redo is symmetric — when you undo, we capture the current state into a
 * fresh Mutation pushed onto the redo stack. */
type Mutation = {
  pagePath: string;
  el: Element;
  selector: string;
  property: EditableProperty;
  prevInline: string;
  prevDraftValue: string | null;
};
type Action = { mutations: Mutation[] };
const UNDO_STACK_LIMIT = 50;

/** Resolve the containing-block origin (in viewport coords) used by
 *  `position: absolute` top/left. This is:
 *    - The nearest ancestor with `position != static`, taking that
 *      ancestor's bounding-rect as origin (border edge — close enough
 *      for our purposes; we don't subtract border widths because the
 *      drift is sub-pixel for typical page chrome).
 *    - Otherwise, the initial containing block, which is the document
 *      origin (= -scrollY / -scrollX in viewport coords).
 *
 *  We use this to translate viewport-space coordinates into top/left
 *  values appropriate for `position: absolute`, so that on drop the
 *  element sits exactly where the cursor released — and stays there as
 *  the page scrolls. */
function getContainingBlockViewportOrigin(el: Element): { top: number; left: number } {
  let ancestor: Element | null = el.parentElement;
  while (ancestor) {
    if (ancestor === document.documentElement || ancestor === document.body) break;
    const cs = window.getComputedStyle(ancestor);
    if (cs.position !== 'static') {
      const r = ancestor.getBoundingClientRect();
      return { top: r.top, left: r.left };
    }
    ancestor = ancestor.parentElement;
  }
  // Reached the root with no positioned ancestor → initial containing
  // block sits at the document origin (in viewport coords, that's
  // negative the current scroll offset).
  return { top: -window.scrollY, left: -window.scrollX };
}

/** Read the editor-relevant pre-edit value for a property, in the same
 *  shape applyLocal would write back. Used to capture the "before" half
 *  of a Mutation. */
function readInlineForProp(el: Element, property: EditableProperty): string {
  if (property === 'text')   return el.textContent ?? '';
  if (property === 'hidden') return (el as HTMLElement).style.display === 'none' ? 'true' : 'false';
  if (property === 'src')    return (el as HTMLElement).getAttribute('src') ?? '';
  if (property === 'href')   return (el as HTMLElement).getAttribute('href') ?? '';
  if (property === 'target') return (el as HTMLElement).getAttribute('target') ?? '';
  return (el as HTMLElement).style.getPropertyValue(property) ?? '';
}

/** Write `value` to the inline-style slot for `property`, mirroring
 *  applyLocal's logic. Empty string → remove the inline override entirely. */
function setInlineForProp(el: Element, property: EditableProperty, value: string) {
  if (property === 'text') {
    if (el.textContent !== value) el.textContent = value;
    return;
  }
  if (property === 'hidden') {
    if (value === 'true') (el as HTMLElement).style.display = 'none';
    else (el as HTMLElement).style.removeProperty('display');
    return;
  }
  if (property === 'src') {
    // src can't be cleared meaningfully ("" produces a broken image), so
    // we only restore non-empty values. Pre-edit empty src is rare anyway.
    if (value) (el as HTMLElement).setAttribute('src', value);
    return;
  }
  if (property === 'href') {
    if (value) (el as HTMLElement).setAttribute('href', value);
    else       el.removeAttribute('href');
    return;
  }
  if (property === 'target') {
    if (value) (el as HTMLElement).setAttribute('target', value);
    else       el.removeAttribute('target');
    return;
  }
  if (value) (el as HTMLElement).style.setProperty(property, value, 'important');
  else       (el as HTMLElement).style.removeProperty(property);
}

function EditorRuntime({ pathname }: { pathname: string }) {
  const [editMode, setEditMode] = useState(false);
  // Selection is an array so the user can Shift-click to add/remove elements.
  // selecteds[0] is the "primary" — the panel header shows its tag/selector,
  // and single-element-only operations (resize, reorder) anchor on it.
  const [selecteds, setSelecteds] = useState<SelectedItem[]>([]);
  const selected = selecteds[0] ?? null;
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [toast, setToast] = useState<string>('');
  const [toastKind, setToastKind] = useState<'ok' | 'err'>('ok');
  // True while the user is editing text in place. Suppresses hover
  // highlight + click capture so they can position the caret freely
  // inside the contenteditable element.
  const [inlineEditing, setInlineEditing] = useState<{ el: Element; original: string } | null>(null);

  // Highlight + selected outlines as floating divs (positioned: fixed)
  // — keeps them off the source DOM tree so :hover and accessibility on
  // the underlying elements aren't disturbed.
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLDivElement | null>(null);

  /* ── Load drafts on edit mode entry + on path change ─────────────── */
  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/customizations?path=${encodeURIComponent(pathname)}&drafts=1`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const rows: DraftRow[] = Array.isArray(data.customizations) ? data.customizations : [];
      setDrafts(rows.filter(r => r.status === 'draft'));
    } catch {}
  }, [pathname]);

  useEffect(() => { if (editMode) loadDrafts(); }, [editMode, loadDrafts]);

  /* ── Show transient toast ────────────────────────────────────────── */
  const flash = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast(msg); setToastKind(kind);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  /* ── Discard drafts on every fresh page load ─────────────────────────
   * Refresh = clean slate. The `<CustomizationApplier>` no longer loads
   * drafts at all (it only renders published rows), so the page reflects
   * the published state immediately on load — there's no flash of stale
   * draft work. This effect then sweeps the DB to delete those orphan
   * draft rows so the panel doesn't resurface them when the owner
   * re-enters edit mode.
   *
   * The didDiscardRef guard makes this idempotent across React 19
   * Strict-Mode dev double-fires (which would otherwise either skip the
   * delete via a stale `cancelled` flag, or fire twice). */
  const didDiscardRef = useRef(false);
  useEffect(() => {
    // Show post-reload notice from a previous discard, if any.
    try {
      const discarded = sessionStorage.getItem('site-editor-drafts-discarded');
      if (discarded) {
        sessionStorage.removeItem('site-editor-drafts-discarded');
        const n = Number(discarded);
        if (n > 0) flash(`Discarded ${n} pending draft${n === 1 ? '' : 's'} on refresh.`);
      }
    } catch { /* sessionStorage unavailable — non-fatal */ }

    if (didDiscardRef.current) return;
    didDiscardRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/customizations?status=draft', { method: 'DELETE' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const count = Number(data?.deleted ?? 0);
        if (count > 0) {
          // Stash for the post-reload toast. The reload is what guarantees
          // the property panel and the editor's local `drafts` state both
          // start fresh — without it, an owner who stays on the page after
          // a save would still see panel inputs reflecting the deleted
          // drafts until they navigate.
          try { sessionStorage.setItem('site-editor-drafts-discarded', String(count)); } catch {}
          window.location.reload();
        }
      } catch { /* best-effort — refresh-to-discard isn't critical path */ }
    })();
    // flash is a stable useCallback — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Apply drafts to the live DOM when editing ────────────────────────
   * CustomizationApplier no longer pushes drafts into the page. So when
   * the owner enters edit mode (or navigates between pages while editing,
   * or new drafts come back from the API), we walk the drafts list and
   * paint them on the page via applyLocal. This way the editor's
   * preview matches what they're working on — but ONLY during the active
   * editing session, never after a refresh. */
  useEffect(() => {
    if (!editMode || drafts.length === 0) return;
    for (const d of drafts) {
      try {
        const el = document.querySelector(d.selector);
        if (el) applyLocal(el, d.property, d.value);
      } catch { /* bad selector — skip */ }
    }
  }, [editMode, drafts]);

  /* ── Undo / Redo stacks ──────────────────────────────────────────────
   * Action stack mirroring native editor undo. Every save path captures
   * its prev-state as a Mutation[] and pushes one Action via recordAction.
   * Cmd+Z (or Ctrl+Z on Windows/Linux) rewinds the most recent Action;
   * Cmd+Shift+Z (or Ctrl+Y) replays the most recently rewound one.
   *
   * draftsRef mirrors `drafts` so undo/redo (which run inside event
   * handlers / async callbacks) can read fresh draft rows without
   * waiting for state to settle through React. */
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  const draftsRef = useRef<DraftRow[]>(drafts);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);

  const recordAction = useCallback((mutations: Mutation[]) => {
    if (mutations.length === 0) return;
    setUndoStack(prev => {
      const next = [...prev, { mutations }];
      // Cap the stack — old actions fall off the front.
      return next.length > UNDO_STACK_LIMIT ? next.slice(next.length - UNDO_STACK_LIMIT) : next;
    });
    // Any new user action invalidates the redo branch — same as VS Code,
    // browsers, etc. The user explicitly chose a different path forward.
    setRedoStack([]);
  }, []);

  /** Apply a list of Mutations as the "prev" state. Updates the inline
   *  DOM in-place and reconciles the draft DB to match (POST upsert OR
   *  DELETE if no prior draft existed). */
  const applyMutations = useCallback(async (mutations: Mutation[]) => {
    const ops: Promise<unknown>[] = [];
    for (const m of mutations) {
      // Inline DOM revert.
      try { setInlineForProp(m.el, m.property, m.prevInline); } catch {}

      if (m.prevDraftValue !== null) {
        // Restore prior draft via upsert (POST upserts on the unique slot).
        ops.push(fetch('/api/customizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagePath: m.pagePath, selector: m.selector, property: m.property, value: m.prevDraftValue }),
        }));
      } else {
        // No prior draft existed — delete the one we just made.
        const existing = draftsRef.current.find(d =>
          d.pagePath === m.pagePath && d.selector === m.selector && d.property === m.property,
        );
        if (existing) {
          ops.push(fetch(`/api/customizations?id=${existing.id}`, { method: 'DELETE' }));
        }
      }
    }
    await Promise.allSettled(ops);
    await loadDrafts();
  }, [loadDrafts]);

  /** Capture the current state of the same (selector, property) slots as
   *  a fresh Mutation[], for pushing onto the redo stack as we undo (and
   *  vice versa). We re-read the inline + draft state because BOTH have
   *  moved on since the recordAction call. */
  const captureCurrentMutations = useCallback((mutations: Mutation[]): Mutation[] => {
    return mutations.map(m => ({
      pagePath: m.pagePath,
      el: m.el,
      selector: m.selector,
      property: m.property,
      prevInline: readInlineForProp(m.el, m.property),
      prevDraftValue: draftsRef.current.find(d =>
        d.pagePath === m.pagePath && d.selector === m.selector && d.property === m.property,
      )?.value ?? null,
    }));
  }, []);

  const undo = useCallback(async () => {
    setUndoStack(prev => {
      if (prev.length === 0) { flash('Nothing to undo.'); return prev; }
      const action = prev[prev.length - 1];
      // Snapshot CURRENT state into a redo entry before reverting.
      const redoMuts = captureCurrentMutations(action.mutations);
      setRedoStack(rprev => [...rprev, { mutations: redoMuts }]);
      // Fire-and-await the revert outside of state setter.
      void applyMutations(action.mutations).then(() => flash('Undone.'));
      return prev.slice(0, -1);
    });
  }, [applyMutations, captureCurrentMutations, flash]);

  const redo = useCallback(async () => {
    setRedoStack(prev => {
      if (prev.length === 0) { flash('Nothing to redo.'); return prev; }
      const action = prev[prev.length - 1];
      const undoMuts = captureCurrentMutations(action.mutations);
      setUndoStack(uprev => [...uprev, { mutations: undoMuts }]);
      void applyMutations(action.mutations).then(() => flash('Redone.'));
      return prev.slice(0, -1);
    });
  }, [applyMutations, captureCurrentMutations, flash]);

  /* ── Keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd+Shift+Z / Ctrl+Y (redo) */
  useEffect(() => {
    if (!editMode) return;
    const onKey = (ev: KeyboardEvent) => {
      // Don't hijack the native undo on inputs/textareas/contenteditable —
      // typing into the property panel should still let Cmd+Z undo TEXT.
      const t = ev.target as Element | null;
      if (t) {
        const tag = t.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if ((t as HTMLElement).isContentEditable) return;
      }
      const meta = ev.metaKey || ev.ctrlKey;
      if (!meta) return;
      const key = ev.key.toLowerCase();
      // Cmd+Shift+Z OR Ctrl+Y → redo
      if ((key === 'z' && ev.shiftKey) || key === 'y') {
        ev.preventDefault();
        redo();
        return;
      }
      // Cmd+Z / Ctrl+Z → undo
      if (key === 'z') {
        ev.preventDefault();
        undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editMode, undo, redo]);

  /* ── Hover highlight wiring ─────────────────────────────────────── */
  useEffect(() => {
    if (!editMode) {
      // clean up highlight overlay if any
      highlightRef.current?.remove(); highlightRef.current = null;
      return;
    }

    // Create overlay element for hover highlight (separate from selected ring).
    const el = document.createElement('div');
    el.id = HIGHLIGHT_BORDER_ID;
    Object.assign(el.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483645',
      border: '2px dashed #6c8aff', borderRadius: '4px',
      transition: 'all 0.06s ease', background: 'rgba(108,138,255,0.08)',
      display: 'none',
    } as CSSStyleDeclaration);
    document.body.appendChild(el);
    highlightRef.current = el;

    const handleMove = (ev: MouseEvent) => {
      // While the user is inline-editing text, don't draw the hover ring
      // — they're typing, not browsing for a target.
      if (inlineEditing) { el.style.display = 'none'; return; }
      // Skip elements inside the editor UI itself.
      const target = (ev.target as Element) || null;
      if (!target || isEditorChrome(target)) {
        el.style.display = 'none';
        return;
      }
      // Hovering the body / html — no useful target.
      if (target === document.body || target === document.documentElement) {
        el.style.display = 'none';
        return;
      }
      const r = target.getBoundingClientRect();
      el.style.display = 'block';
      el.style.top = `${r.top - 2}px`;
      el.style.left = `${r.left - 2}px`;
      el.style.width = `${r.width + 4}px`;
      el.style.height = `${r.height + 4}px`;
    };
    const handleLeave = () => { el.style.display = 'none'; };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseout', handleLeave);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseout', handleLeave);
      el.remove();
      highlightRef.current = null;
    };
  }, [editMode, inlineEditing]);

  /* ── Selection click capture (use capture-phase so we beat React) ── */
  useEffect(() => {
    if (!editMode) return;
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (!target) return;
      if (isEditorChrome(target)) return; // clicks inside our UI go through normally
      // If the user is editing text inline, let clicks pass through (so they
      // can position the caret, select words, etc.). A click outside the
      // editing element exits inline edit via blur.
      if (inlineEditing && target.closest('[contenteditable="true"]')) return;
      ev.preventDefault();
      ev.stopPropagation();
      const sel = buildSelector(target);
      if (!sel) return;
      const item: SelectedItem = { el: target, selector: sel, tag: target.tagName.toLowerCase() };

      if (ev.shiftKey) {
        // Shift+click toggles this element's membership in the selection.
        // Click an already-selected element again with Shift to remove it.
        setSelecteds(prev => {
          const idx = prev.findIndex(s => s.el === target);
          if (idx >= 0) {
            const next = [...prev]; next.splice(idx, 1); return next;
          }
          return [...prev, item];
        });
      } else {
        // Plain click replaces the entire selection.
        setSelecteds([item]);
      }
    };
    document.addEventListener('click', onClick, true); // capture
    return () => document.removeEventListener('click', onClick, true);
  }, [editMode, inlineEditing]);

  /* ── Double-click → in-place text editing ─────────────────────────────
   * Click on the page once to select; double-click to start editing the
   * text directly on the element. While editing, the element is set to
   * contenteditable="true" so the user can type / paste / select / use
   * cursor keys natively. Enter saves; Escape reverts. Blurring the
   * element (clicking outside) saves.
   *
   * We avoid double-binding inputs / textareas / form controls because
   * those have their own native editing behaviour. */
  useEffect(() => {
    if (!editMode) return;
    const onDblClick = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (!target || isEditorChrome(target)) return;
      // Skip native form fields — they have their own editing.
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      ev.preventDefault();
      ev.stopPropagation();

      const htmlEl = target as HTMLElement;
      const original = htmlEl.textContent ?? '';
      htmlEl.contentEditable = 'true';
      htmlEl.spellcheck = false;
      htmlEl.focus();
      // Place caret at end so typing appends rather than replacing the
      // selection; admins can Cmd+A if they want to overwrite everything.
      const range = document.createRange();
      range.selectNodeContents(htmlEl);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      setInlineEditing({ el: target, original });
    };
    document.addEventListener('dblclick', onDblClick, true);
    return () => document.removeEventListener('dblclick', onDblClick, true);
  }, [editMode]);

  /* ── Inline editing keyboard / blur lifecycle ─────────────────────── */
  useEffect(() => {
    if (!inlineEditing) return;
    const { el, original } = inlineEditing;
    const htmlEl = el as HTMLElement;

    const finish = (save: boolean) => {
      // Tear down contenteditable + listeners regardless.
      htmlEl.contentEditable = 'false';
      htmlEl.removeEventListener('blur', onBlur);
      htmlEl.removeEventListener('keydown', onKey);

      const newText = htmlEl.textContent ?? '';
      if (save && newText !== original) {
        const sel = buildSelector(el);
        if (sel) {
          // Record undo BEFORE saving — prev inline = `original` (captured
          // when inline editing started), prev draft = whatever's in the
          // current drafts state for this slot.
          const prevDraftValue = draftsRef.current.find(d =>
            d.pagePath === pagePath && d.selector === sel && d.property === 'text',
          )?.value ?? null;
          recordAction([{
            pagePath, el, selector: sel, property: 'text',
            prevInline: original,
            prevDraftValue,
          }]);
          // Always save text edits as page-scoped drafts. Site-wide text
          // makes very little sense — a "Welcome" string on /admin is
          // unrelated to a "Welcome" string elsewhere.
          saveDraft({ pagePath, selector: sel, property: 'text', value: newText });
        }
      } else if (!save) {
        // Revert visually so admin sees their cancel took effect.
        htmlEl.textContent = original;
      }
      setInlineEditing(null);
    };

    const onBlur = () => finish(true);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      } else if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        finish(true);
        htmlEl.blur();
      }
    };

    htmlEl.addEventListener('blur', onBlur);
    htmlEl.addEventListener('keydown', onKey);
    return () => {
      // Defensive cleanup if the component unmounts mid-edit.
      htmlEl.contentEditable = 'false';
      htmlEl.removeEventListener('blur', onBlur);
      htmlEl.removeEventListener('keydown', onKey);
    };
    // saveDraft + pathname are referenced in finish() — when they change
    // we want a fresh closure so saves write to the right path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineEditing]);

  // Computed pagePath — text edits always save page-scoped (see comment above).
  const pagePath = pathname;

  /* ── Selected outline + 8 resize handles ─────────────────────────────
   * The outline is a fixed-position div sized to match the selected
   * element. Eight small handle divs (nw, n, ne, w, e, sw, s, se) sit at
   * the corners + edges. Each handle has pointer-events: auto and
   * mousedown listeners that drag-update the selected element's width/
   * height inline style, saving the final values as drafts on mouseup.
   *
   * Handle drag math:
   *   E / SE / NE → width += dx
   *   W / SW / NW → width -= dx
   *   S / SE / SW → height += dy
   *   N / NE / NW → height -= dy
   * (Positioned elements won't reposition — only width/height change.) */
  useEffect(() => {
    if (selecteds.length === 0) {
      selectedRef.current?.remove(); selectedRef.current = null; return;
    }

    const isMulti = selecteds.length > 1;
    const primary = selecteds[0];

    // Master container — invisible, parents every overlay chrome element.
    // We always recreate it per effect run rather than reuse, because the
    // structure (per-element outlines, group bbox, handles) varies with
    // selection count and multi vs single mode.
    const container = document.createElement('div');
    container.id = SELECTED_BORDER_ID;
    container.classList.add('site-editor-chrome');
    Object.assign(container.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483646',
      top: '0', left: '0', width: '0', height: '0',
    } as CSSStyleDeclaration);
    document.body.appendChild(container);
    selectedRef.current?.remove();
    selectedRef.current = container;

    // One thin outline per selected element — always rendered, regardless
    // of count, so the user sees exactly which elements are in scope.
    const elementOutlines: HTMLDivElement[] = selecteds.map(() => {
      const o = document.createElement('div');
      Object.assign(o.style, {
        position: 'fixed', pointerEvents: 'none',
        border: '2px solid #16a34a', borderRadius: '4px',
        background: 'rgba(22,163,74,0.04)',
      } as CSSStyleDeclaration);
      container.appendChild(o);
      return o;
    });

    // Group bounding box — dashed amber, only when 2+ elements selected.
    // Visually cues the user that ops apply to the whole group.
    const groupBbox = isMulti
      ? (() => {
          const b = document.createElement('div');
          Object.assign(b.style, {
            position: 'fixed', pointerEvents: 'none',
            border: '2px dashed #f59e0b', borderRadius: '8px',
            background: 'rgba(245,158,11,0.04)',
          } as CSSStyleDeclaration);
          container.appendChild(b);
          return b;
        })()
      : null;

    // Anchor — overlays the single element OR the group bbox. Resize
    // handles + drag bar are children of this anchor.
    const anchor = document.createElement('div');
    Object.assign(anchor.style, {
      position: 'fixed', pointerEvents: 'none',
    } as CSSStyleDeclaration);
    container.appendChild(anchor);

    const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
    type Dir = typeof HANDLE_DIRS[number];

    const cursorFor: Record<Dir, string> = {
      nw: 'nwse-resize', se: 'nwse-resize',
      ne: 'nesw-resize', sw: 'nesw-resize',
      n:  'ns-resize',   s:  'ns-resize',
      e:  'ew-resize',   w:  'ew-resize',
    };

    const positionFor: Record<Dir, { top: string; left: string; transform: string }> = {
      nw: { top: '0',    left: '0',    transform: 'translate(-50%, -50%)' },
      n:  { top: '0',    left: '50%',  transform: 'translate(-50%, -50%)' },
      ne: { top: '0',    left: '100%', transform: 'translate(-50%, -50%)' },
      e:  { top: '50%',  left: '100%', transform: 'translate(-50%, -50%)' },
      se: { top: '100%', left: '100%', transform: 'translate(-50%, -50%)' },
      s:  { top: '100%', left: '50%',  transform: 'translate(-50%, -50%)' },
      sw: { top: '100%', left: '0',    transform: 'translate(-50%, -50%)' },
      w:  { top: '50%',  left: '0',    transform: 'translate(-50%, -50%)' },
    };

    // Resize handles — single-select only. Multi-resize would have to
    // decide whether to scale uniformly or assign the same width/height
    // to every element, both of which are unpredictable without UX work.
    if (!isMulti) {
      for (const dir of HANDLE_DIRS) {
        const h = document.createElement('div');
        h.classList.add('site-editor-chrome');
        h.dataset.dir = dir;
        const pos = positionFor[dir];
        Object.assign(h.style, {
          position: 'absolute',
          top: pos.top, left: pos.left, transform: pos.transform,
          width: '10px', height: '10px',
          background: 'white', border: '2px solid #16a34a', borderRadius: '50%',
          pointerEvents: 'auto', cursor: cursorFor[dir],
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        } as CSSStyleDeclaration);

        h.addEventListener('mousedown', (ev) => onResizeStart(ev, dir));
        anchor.appendChild(h);
      }
    }

    /* ── Drag bar — two move modes, always present ──────────────────────
     * "↕ Move" → drag-to-reorder among siblings (uses CSS `order`).
     *           Single-element only — multi-select reorder is ambiguous.
     * "✥ Free" → switches the element(s) to position:fixed and lets you
     *           drop anywhere with top/left. Multi-select moves all
     *           selected elements together (delta-applied). */
    const bar = document.createElement('div');
    bar.classList.add('site-editor-chrome');
    Object.assign(bar.style, {
      position: 'absolute',
      top: '0', left: '50%', transform: 'translate(-50%, calc(-100% - 6px))',
      display: 'inline-flex', gap: '0.25rem', alignItems: 'center',
      pointerEvents: 'auto',
      whiteSpace: 'nowrap',
    } as CSSStyleDeclaration);

    const makePill = (label: string, title: string, onDown: (ev: MouseEvent) => void, dimmed = false) => {
      const b = document.createElement('div');
      b.classList.add('site-editor-chrome');
      b.textContent = label;
      b.title = title;
      Object.assign(b.style, {
        background: dimmed ? 'rgba(22,163,74,0.45)' : '#16a34a', color: 'white',
        fontSize: '0.7rem', fontWeight: '700',
        padding: '0.25rem 0.55rem', borderRadius: '999px',
        cursor: dimmed ? 'not-allowed' : 'grab', userSelect: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
      } as CSSStyleDeclaration);
      b.addEventListener('mousedown', onDown);
      return b;
    };
    bar.appendChild(makePill(
      '↕ Move',
      isMulti ? 'Reorder works one element at a time. Shift-click again to reduce to a single selection.' : 'Drag to reorder among siblings (uses CSS order)',
      onReorderStart,
      isMulti,
    ));
    bar.appendChild(makePill('✥ Free', 'Drag to place anywhere on the page (uses position:fixed + top/left)', onFreeMoveStart));
    if (isMulti) {
      // Selection-count chip on the bar so the user knows ops are batched.
      const chip = document.createElement('div');
      chip.classList.add('site-editor-chrome');
      chip.textContent = `${selecteds.length} selected`;
      Object.assign(chip.style, {
        background: '#f59e0b', color: '#451a03',
        fontSize: '0.65rem', fontWeight: '700',
        padding: '0.2rem 0.5rem', borderRadius: '999px',
        userSelect: 'none', marginLeft: '0.2rem',
      } as CSSStyleDeclaration);
      bar.appendChild(chip);
    }
    anchor.appendChild(bar);

    function onResizeStart(ev: MouseEvent, dir: Dir) {
      ev.preventDefault();
      ev.stopPropagation();

      // Resize is single-select only (handles aren't even rendered for
      // multi). Belt-and-braces: bail if somehow invoked while multi.
      if (isMulti) return;

      const targetEl = primary.el as HTMLElement;
      const startRect = targetEl.getBoundingClientRect();
      const startX = ev.clientX;
      const startY = ev.clientY;
      // Capture original inline width/height so we can restore on cancel.
      const origWidth = targetEl.style.width;
      const origHeight = targetEl.style.height;

      const onMove = (mv: MouseEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        let newW = startRect.width;
        let newH = startRect.height;
        if (dir.includes('e')) newW = startRect.width + dx;
        if (dir.includes('w')) newW = startRect.width - dx;
        if (dir.includes('s')) newH = startRect.height + dy;
        if (dir.includes('n')) newH = startRect.height - dy;
        newW = Math.max(20, Math.round(newW));
        newH = Math.max(20, Math.round(newH));

        // Update only the dimensions the user is actually dragging — don't
        // touch height when dragging E/W only, and vice versa.
        if (dir.includes('e') || dir.includes('w')) {
          targetEl.style.setProperty('width', `${newW}px`, 'important');
        }
        if (dir.includes('n') || dir.includes('s')) {
          targetEl.style.setProperty('height', `${newH}px`, 'important');
        }

        // Live-update the outline + handles.
        update();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        // Save the final values as drafts. Read them back from inline
        // style so we capture exactly what onMove last wrote. Resize
        // drags always save as page-scoped — site-wide width changes
        // rarely make sense, and admins can switch to site-wide via the
        // panel's scope toggle if they really want it.
        const finalW = targetEl.style.width;
        const finalH = targetEl.style.height;

        // Record undo BEFORE saving (prev inline = pre-drag origWidth/
        // origHeight; prev draft = current drafts state for the slot).
        const findDraft = (prop: EditableProperty) =>
          draftsRef.current.find(d =>
            d.pagePath === pathname && d.selector === primary.selector && d.property === prop,
          )?.value ?? null;
        const muts: Mutation[] = [];
        if ((dir.includes('e') || dir.includes('w')) && finalW && finalW !== origWidth) {
          muts.push({ pagePath: pathname, el: targetEl, selector: primary.selector, property: 'width',
                      prevInline: origWidth, prevDraftValue: findDraft('width') });
        }
        if ((dir.includes('n') || dir.includes('s')) && finalH && finalH !== origHeight) {
          muts.push({ pagePath: pathname, el: targetEl, selector: primary.selector, property: 'height',
                      prevInline: origHeight, prevDraftValue: findDraft('height') });
        }
        recordAction(muts);

        if ((dir.includes('e') || dir.includes('w')) && finalW && finalW !== origWidth) {
          saveDraft({ pagePath: pathname, selector: primary.selector, property: 'width', value: finalW });
        }
        if ((dir.includes('n') || dir.includes('s')) && finalH && finalH !== origHeight) {
          saveDraft({ pagePath: pathname, selector: primary.selector, property: 'height', value: finalH });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    /* ── Drag-to-reorder ────────────────────────────────────────────────
     * Snapshots the parent + siblings, follows the cursor to find the
     * nearest insertion slot, draws a thick blue line between siblings to
     * indicate where the element will land, and on drop saves a fresh
     * `order: N*10` draft for every sibling that moved. The *10 spacing
     * lets future single-click Move Up/Down adjustments slip between
     * siblings without immediately needing a re-shuffle of every value. */
    function onReorderStart(ev: MouseEvent) {
      ev.preventDefault();
      ev.stopPropagation();
      if (isMulti) {
        flash('Reorder works one element at a time. Use ✥ Free to move multiple elements together.', 'err');
        return;
      }
      const targetEl = primary.el as HTMLElement;
      const parent = targetEl.parentElement;
      if (!parent) return;

      const siblings = Array.from(parent.children) as HTMLElement[];
      if (siblings.length < 2) {
        flash('Element has no siblings to reorder against.', 'err');
        return;
      }
      const siblingRects = siblings.map(s => s.getBoundingClientRect());

      // Detect layout direction by comparing centers of the first two
      // siblings. If they differ more in X than Y, layout is horizontal.
      const isHorizontal = (() => {
        const a = siblingRects[0], b = siblingRects[1];
        return Math.abs(b.left - a.left) > Math.abs(b.top - a.top);
      })();

      // Insertion guide — thick blue line between siblings.
      const guide = document.createElement('div');
      guide.classList.add('site-editor-chrome');
      Object.assign(guide.style, {
        position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
        background: '#3b82f6', borderRadius: '999px',
        boxShadow: '0 0 12px rgba(59,130,246,0.7)',
        transition: 'all 0.05s ease',
      } as CSSStyleDeclaration);
      document.body.appendChild(guide);

      // Dim the dragging element so the guide is the focal point.
      const origOpacity = targetEl.style.opacity;
      targetEl.style.opacity = '0.35';
      document.body.style.cursor = 'grabbing';

      const currentIdx = siblings.indexOf(targetEl);
      let dropIndex = currentIdx;

      const onMove = (mv: MouseEvent) => {
        // Find the sibling whose center is closest to the cursor on the
        // primary axis, then decide whether we're inserting before or
        // after it.
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < siblingRects.length; i++) {
          const r = siblingRects[i];
          const center = isHorizontal ? r.left + r.width / 2 : r.top + r.height / 2;
          const cur = isHorizontal ? mv.clientX : mv.clientY;
          const d = Math.abs(cur - center);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const r = siblingRects[bestIdx];
        const center = isHorizontal ? r.left + r.width / 2 : r.top + r.height / 2;
        const cur = isHorizontal ? mv.clientX : mv.clientY;
        const after = cur > center;
        dropIndex = bestIdx + (after ? 1 : 0);

        // Position the guide.
        if (isHorizontal) {
          const x = after ? r.left + r.width : r.left;
          Object.assign(guide.style, {
            top: `${r.top}px`, left: `${x - 2}px`,
            width: '4px', height: `${r.height}px`,
          });
        } else {
          const y = after ? r.top + r.height : r.top;
          Object.assign(guide.style, {
            top: `${y - 2}px`, left: `${r.left}px`,
            width: `${r.width}px`, height: '4px',
          });
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        guide.remove();
        targetEl.style.opacity = origOpacity;
        document.body.style.cursor = '';

        // No-op if dropped at the same logical slot.
        if (dropIndex === currentIdx || dropIndex === currentIdx + 1) return;

        // Build the new sibling order in memory.
        const newOrder = [...siblings];
        newOrder.splice(currentIdx, 1);
        const adjusted = dropIndex > currentIdx ? dropIndex - 1 : dropIndex;
        newOrder.splice(adjusted, 0, targetEl);

        // Capture pre-edit state for undo — every sibling whose order is
        // about to change becomes a Mutation. We snapshot inline `order`
        // BEFORE writing the new value below.
        const preMutations: Mutation[] = [];
        for (const sib of newOrder) {
          const sel = buildSelector(sib);
          if (!sel) continue;
          preMutations.push({
            pagePath: pathname, el: sib, selector: sel, property: 'order',
            prevInline: sib.style.getPropertyValue('order') ?? '',
            prevDraftValue: draftsRef.current.find(d =>
              d.pagePath === pathname && d.selector === sel && d.property === 'order',
            )?.value ?? null,
          });
        }
        recordAction(preMutations);

        // Save `order` drafts for every sibling. Spacing of 10 leaves
        // headroom for future Move Up/Down ±10 nudges.
        newOrder.forEach((sib, idx) => {
          const sel = buildSelector(sib);
          if (!sel) return;
          // Apply locally for instant preview.
          sib.style.setProperty('order', String(idx * 10), 'important');
          saveDraft({ pagePath: pathname, selector: sel, property: 'order', value: String(idx * 10) });
        });

        // Hint if the parent isn't flex/grid — `order` won't visually
        // affect non-flex/grid layouts.
        const pd = window.getComputedStyle(parent).display;
        if (!/\b(flex|grid|inline-flex|inline-grid)\b/.test(pd)) {
          flash(`Saved, but parent is ${pd} — order only takes effect inside flex/grid. Click the parent → Layout → Display → flex.`, 'err');
        } else {
          flash('Reordered.');
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    /* ── Drag-to-anywhere (free position) ───────────────────────────────
     * Switches the element to position:absolute (relative to the nearest
     * positioned ancestor, or the document if none) and updates top/left
     * as the user drags. Using `absolute` instead of `fixed` means the
     * element is part of the document — when the user scrolls, it
     * scrolls with the page, which is what "place it anywhere" actually
     * means. (`fixed` would pin it to the viewport, which we shipped
     * first by mistake — that's the bug this fixes.)
     *
     * The math: `position: absolute` interprets `top` / `left` relative
     * to the containing block's padding edge. We compute that edge in
     * viewport coords via getContainingBlockViewportOrigin(), then
     * subtract from the element's viewport rect to get top/left values
     * that pin it where it currently is. Drag deltas add to that.
     *
     * Trade-off: position:absolute removes the element from layout flow,
     * so siblings reflow. The toast warns about this. */
    function onFreeMoveStart(ev: MouseEvent) {
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const startY = ev.clientY;

      // Snapshot every selected element's starting state — we apply the
      // same (dx, dy) delta to each so they move as a rigid group.
      // Each snapshot also captures origInline so undo can reverse the
      // pin / position / dimensions exactly.
      type Snapshot = {
        item: SelectedItem;
        el: HTMLElement;
        wasPositioned: boolean;     // already abs/fixed/relative/sticky pre-drag
        setWidth: boolean;          // we pinned width defensively
        setHeight: boolean;         // we pinned height defensively
        startTop: number;           // top value (relative to containing block) at drag start
        startLeft: number;          // left value (relative to containing block) at drag start
        origInline: { position: string; top: string; left: string; width: string; height: string };
      };
      const snapshots: Snapshot[] = selecteds.map(item => {
        const el = item.el as HTMLElement;
        const viewportRect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const wasPositioned = cs.position !== 'static';

        // Capture pre-drag inline values for undo.
        const origInline = {
          position: el.style.position,
          top:      el.style.top,
          left:     el.style.left,
          width:    el.style.width,
          height:   el.style.height,
        };

        // Resolve where the containing block sits in viewport coords —
        // this is the (0,0) origin for `position: absolute` top/left.
        // For an unpositioned ancestor chain it's the document origin
        // adjusted for scroll. (See helper below.)
        const cb = getContainingBlockViewportOrigin(el);
        const startTop  = viewportRect.top  - cb.top;
        const startLeft = viewportRect.left - cb.left;

        // Switch to absolute (so the element scrolls with the page) and
        // pin to the computed top/left so the element doesn't visually
        // jump on mousedown.
        if (cs.position !== 'absolute') {
          el.style.setProperty('position', 'absolute', 'important');
        }
        el.style.setProperty('top',  `${startTop}px`,  'important');
        el.style.setProperty('left', `${startLeft}px`, 'important');

        // Pin width/height so an element switched out of flow doesn't
        // collapse to its content's intrinsic size.
        const setWidth  = !el.style.width;
        const setHeight = !el.style.height;
        if (setWidth)  el.style.setProperty('width',  `${viewportRect.width}px`,  'important');
        if (setHeight) el.style.setProperty('height', `${viewportRect.height}px`, 'important');

        return { item, el, wasPositioned, setWidth, setHeight, startTop, startLeft, origInline };
      });

      document.body.style.cursor = 'grabbing';

      const onMove = (mv: MouseEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        for (const s of snapshots) {
          s.el.style.setProperty('top',  `${s.startTop  + dy}px`, 'important');
          s.el.style.setProperty('left', `${s.startLeft + dx}px`, 'important');
        }
        update();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';

        // Build the undo Action — one Mutation per (selector, property)
        // we're about to write. We use origInline (captured pre-drag) as
        // prevInline so undo restores the original position/top/left and
        // the original width/height if we pinned them defensively.
        const findDraft = (sel: string, prop: EditableProperty) =>
          draftsRef.current.find(d =>
            d.pagePath === pathname && d.selector === sel && d.property === prop,
          )?.value ?? null;
        const muts: Mutation[] = [];
        for (const s of snapshots) {
          // We always set position (since we forced absolute). Only record
          // a position mutation when we actually changed something.
          if (s.origInline.position !== 'absolute') {
            muts.push({ pagePath: pathname, el: s.el, selector: s.item.selector, property: 'position',
                        prevInline: s.origInline.position, prevDraftValue: findDraft(s.item.selector, 'position') });
          }
          if (s.el.style.top) {
            muts.push({ pagePath: pathname, el: s.el, selector: s.item.selector, property: 'top',
                        prevInline: s.origInline.top, prevDraftValue: findDraft(s.item.selector, 'top') });
          }
          if (s.el.style.left) {
            muts.push({ pagePath: pathname, el: s.el, selector: s.item.selector, property: 'left',
                        prevInline: s.origInline.left, prevDraftValue: findDraft(s.item.selector, 'left') });
          }
          if (s.setWidth && s.el.style.width) {
            muts.push({ pagePath: pathname, el: s.el, selector: s.item.selector, property: 'width',
                        prevInline: s.origInline.width, prevDraftValue: findDraft(s.item.selector, 'width') });
          }
          if (s.setHeight && s.el.style.height) {
            muts.push({ pagePath: pathname, el: s.el, selector: s.item.selector, property: 'height',
                        prevInline: s.origInline.height, prevDraftValue: findDraft(s.item.selector, 'height') });
          }
        }
        recordAction(muts);

        // Save drafts for each. Sequential POSTs are fine for typical
        // selection sizes (≤ a handful of elements per drag).
        for (const s of snapshots) {
          if (s.origInline.position !== 'absolute') {
            saveDraft({ pagePath: pathname, selector: s.item.selector, property: 'position', value: 'absolute' });
          }
          if (s.el.style.top)  saveDraft({ pagePath: pathname, selector: s.item.selector, property: 'top',  value: s.el.style.top  });
          if (s.el.style.left) saveDraft({ pagePath: pathname, selector: s.item.selector, property: 'left', value: s.el.style.left });
          if (s.setWidth  && s.el.style.width)  saveDraft({ pagePath: pathname, selector: s.item.selector, property: 'width',  value: s.el.style.width  });
          if (s.setHeight && s.el.style.height) saveDraft({ pagePath: pathname, selector: s.item.selector, property: 'height', value: s.el.style.height });
        }
        flash(snapshots.length > 1 ? `Placed ${snapshots.length} elements.` : 'Placed.');
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    const update = () => {
      // Per-element thin outlines.
      selecteds.forEach((s, i) => {
        const r = s.el.getBoundingClientRect();
        const o = elementOutlines[i];
        o.style.top    = `${r.top - 2}px`;
        o.style.left   = `${r.left - 2}px`;
        o.style.width  = `${r.width + 4}px`;
        o.style.height = `${r.height + 4}px`;
      });

      if (isMulti) {
        // Group bbox = union of all selected element rects.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of selecteds) {
          const r = s.el.getBoundingClientRect();
          if (r.left   < minX) minX = r.left;
          if (r.top    < minY) minY = r.top;
          if (r.right  > maxX) maxX = r.right;
          if (r.bottom > maxY) maxY = r.bottom;
        }
        if (groupBbox) {
          groupBbox.style.top    = `${minY - 4}px`;
          groupBbox.style.left   = `${minX - 4}px`;
          groupBbox.style.width  = `${maxX - minX + 8}px`;
          groupBbox.style.height = `${maxY - minY + 8}px`;
        }
        anchor.style.top    = `${minY - 4}px`;
        anchor.style.left   = `${minX - 4}px`;
        anchor.style.width  = `${maxX - minX + 8}px`;
        anchor.style.height = `${maxY - minY + 8}px`;
      } else {
        const r = primary.el.getBoundingClientRect();
        anchor.style.top    = `${r.top - 2}px`;
        anchor.style.left   = `${r.left - 2}px`;
        anchor.style.width  = `${r.width + 4}px`;
        anchor.style.height = `${r.height + 4}px`;
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      container.remove();
      if (selectedRef.current === container) selectedRef.current = null;
    };
  }, [selecteds]);

  /* ── Save a draft (called from the property panel) ───────────────── */
  const saveDraft = useCallback(async (params: {
    pagePath: string;
    selector: string;
    property: EditableProperty;
    value: string;
  }) => {
    try {
      const res = await fetch('/api/customizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Save failed.', 'err');
        return;
      }
      // Reload drafts so the count chip stays accurate.
      loadDrafts();
    } catch {
      flash('Network error saving draft.', 'err');
    }
  }, [flash, loadDrafts]);

  /* ── Publish all drafts ───────────────────────────────────────────
   * After a successful publish we reload the page rather than clear local
   * state in JS. Reason: while editing, the property panel writes inline
   * styles directly to the selected element via applyLocal() so the
   * preview is instant. Those inline overrides aren't tracked anywhere
   * to remove cleanly — they'd otherwise stick around until next nav,
   * making it look like the editor "leaked" changes. A reload wipes the
   * editor's draft DOM mutations and lets the runtime applier re-render
   * the page from the (now-published) <style> block as the single source
   * of truth. */
  const publish = useCallback(async () => {
    if (!confirm(`Publish ${drafts.length} pending change${drafts.length === 1 ? '' : 's'} to every visitor?`)) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/customizations/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || 'Publish failed.', 'err');
        setPublishing(false);
        return;
      }
      flash(`Published ${data.published ?? 0} change${data.published === 1 ? '' : 's'} live. Reloading…`);
      // Brief delay so the toast is readable before the page reloads.
      setTimeout(() => window.location.reload(), 700);
    } catch {
      flash('Network error publishing.', 'err');
      setPublishing(false);
    }
  }, [drafts.length, flash]);

  /* ── Discard all drafts ─────────────────────────────────────────── */
  const discardAll = useCallback(async () => {
    if (!confirm(`Discard ${drafts.length} unpublished draft${drafts.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    setDiscarding(true);
    try {
      const res = await fetch('/api/customizations?status=draft', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { flash(data.error || 'Discard failed.', 'err'); return; }
      setDrafts([]);
      flash('Drafts discarded.');
      // Reload the page so the runtime applier picks up the (now-only-published) state.
      window.location.reload();
    } catch {
      flash('Network error discarding.', 'err');
    } finally { setDiscarding(false); }
  }, [drafts.length, flash]);

  return (
    <>
      {/* Floating "Customize" launcher — pinned top-left */}
      {!editMode && (
        <button
          type="button"
          onClick={() => setEditMode(true)}
          className="site-editor-chrome"
          style={{
            position: 'fixed', top: '12px', left: '12px', zIndex: 2147483640,
            background: 'rgba(15,23,42,0.92)', color: 'white', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '0.5rem', padding: '0.4rem 0.75rem',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)',
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
          title="Customize this site (owner only)"
        >
          ✏️ Customize
        </button>
      )}

      {/* Edit-mode top banner */}
      {editMode && (
        <div
          className="site-editor-chrome"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483641,
            background: 'rgba(15,23,42,0.95)', color: 'white', backdropFilter: 'blur(10px)',
            padding: '0.55rem 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📝 Editing</span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700,
              padding: '0.1rem 0.4rem', borderRadius: '999px',
              background: drafts.length > 0 ? '#f59e0b' : 'rgba(255,255,255,0.12)',
              color: drafts.length > 0 ? '#451a03' : 'rgba(255,255,255,0.7)',
            }}>
              {drafts.length} draft{drafts.length === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>
              · Click any element to edit it
            </span>
          </span>
          <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            {/* Undo / Redo — Cmd+Z / Cmd+Shift+Z keyboard shortcuts also work. */}
            <button
              type="button"
              onClick={undo}
              disabled={undoStack.length === 0}
              className="site-editor-chrome"
              title={undoStack.length > 0 ? `Undo last change (${undoStack.length} in history) — Cmd/Ctrl+Z` : 'Nothing to undo'}
              style={{
                background: 'transparent',
                color: undoStack.length > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.4rem',
                padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 700,
                cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              ↶
              {undoStack.length > 0 && (
                <span style={{ fontSize: '0.65rem', opacity: 0.8, fontWeight: 600 }}>{undoStack.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={redoStack.length === 0}
              className="site-editor-chrome"
              title={redoStack.length > 0 ? `Redo (${redoStack.length} in history) — Cmd+Shift+Z / Ctrl+Y` : 'Nothing to redo'}
              style={{
                background: 'transparent',
                color: redoStack.length > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.4rem',
                padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 700,
                cursor: redoStack.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              }}
            >
              ↷
              {redoStack.length > 0 && (
                <span style={{ fontSize: '0.65rem', opacity: 0.8, fontWeight: 600 }}>{redoStack.length}</span>
              )}
            </button>

            {/* Visual divider */}
            <span style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />

            <button
              type="button"
              onClick={publish}
              disabled={publishing || drafts.length === 0}
              className="site-editor-chrome"
              style={{
                background: drafts.length > 0 ? '#16a34a' : 'rgba(255,255,255,0.08)',
                color: drafts.length > 0 ? 'white' : 'rgba(255,255,255,0.4)',
                border: 'none', borderRadius: '0.4rem',
                padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 700,
                cursor: drafts.length === 0 ? 'not-allowed' : (publishing ? 'wait' : 'pointer'),
              }}
            >
              {publishing ? 'Publishing…' : '✓ Publish'}
            </button>
            <button
              type="button"
              onClick={discardAll}
              disabled={discarding || drafts.length === 0}
              className="site-editor-chrome"
              style={{
                background: 'transparent',
                color: drafts.length > 0 ? '#fca5a5' : 'rgba(255,255,255,0.3)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.4rem',
                padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600,
                cursor: drafts.length === 0 ? 'not-allowed' : (discarding ? 'wait' : 'pointer'),
              }}
            >
              {discarding ? 'Discarding…' : 'Discard'}
            </button>
          </span>
        </div>
      )}

      {/* Property panel (right drawer) when one or more elements selected.
          Keyed on the joined selector list so it remounts (resetting field
          state) whenever the selection changes shape. */}
      {editMode && selecteds.length > 0 && (
        <PropertyPanel
          key={selecteds.map(s => s.selector).join('|')}
          selecteds={selecteds}
          pathname={pathname}
          drafts={drafts}
          onClose={() => setSelecteds([])}
          onSaveDraft={saveDraft}
          onRecordAction={recordAction}
          onFlash={flash}
        />
      )}

      {/* Inline-edit hint — shows while the user is editing text directly
          on the page. Tells them how to save (Enter) and cancel (Esc). */}
      {inlineEditing && (
        <div
          className="site-editor-chrome"
          style={{
            position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            zIndex: 2147483647,
            background: 'rgba(15,23,42,0.95)', color: 'white', backdropFilter: 'blur(8px)',
            padding: '0.55rem 1rem', borderRadius: '999px',
            fontSize: '0.78rem', fontWeight: 600,
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            display: 'inline-flex', alignItems: 'center', gap: '0.85rem',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            ✏️ <span>Editing text in place</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
            <kbd style={kbdStyle}>Enter</kbd> save
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.7)' }}>
            <kbd style={kbdStyle}>Esc</kbd> cancel
          </span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="site-editor-chrome"
          style={{
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 2147483647,
            background: toastKind === 'ok' ? '#16a34a' : '#dc2626', color: 'white',
            padding: '0.6rem 1rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: 600,
            boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            maxWidth: '420px',
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

/* ── Property panel (right drawer) ─────────────────────────────────── */

function PropertyPanel({
  selecteds,
  pathname,
  drafts,
  onClose,
  onSaveDraft,
  onRecordAction,
  onFlash,
}: {
  selecteds: SelectedItem[];
  pathname: string;
  drafts: DraftRow[];
  onClose: () => void;
  onSaveDraft: (params: { pagePath: string; selector: string; property: EditableProperty; value: string }) => Promise<void>;
  onRecordAction: (mutations: Mutation[]) => void;
  onFlash: (msg: string, kind?: 'ok' | 'err') => void;
}) {
  const [scope, setScope] = useState<Scope>('page');
  // Primary selection — drives single-element-only UI like the type chip,
  // image preview, and the Reorder buttons (which don't make sense for
  // multi). All property-edit ops still apply to every selected element.
  const primary = selecteds[0];
  const isMulti = selecteds.length > 1;

  // Read computed style of the primary as initial values. We don't try
  // to detect "mixed" values across selecteds — keeping the panel simple.
  // First edit propagates to every selected element regardless.
  const initial = useMemo(() => readInitialValues(primary.el), [primary.el]);
  const [values, setValues] = useState<Record<EditableProperty, string>>(initial);

  // Saved draft values for THIS selector — re-derive whenever drafts
  // change so undo (which deletes/restores drafts) also rewinds the
  // panel's input values, not just the DOM. We start from the element's
  // current computed style (which has been live-reverted by the undo
  // path) and overlay any matching drafts on top.
  useEffect(() => {
    const fresh = readInitialValues(primary.el);
    for (const d of drafts) {
      if (d.selector === primary.selector) fresh[d.property] = d.value;
    }
    setValues(fresh);
  }, [drafts, primary.selector, primary.el]);

  const pagePath = scope === 'site' ? SITE_WIDE : pathname;

  const apply = useCallback((property: EditableProperty, value: string) => {
    // Record the BEFORE state for undo. Capture each selected element's
    // current inline + draft value separately so undo can rewind every
    // element's slot back to where it was.
    const mutations: Mutation[] = selecteds.map(s => ({
      pagePath, el: s.el, selector: s.selector, property,
      prevInline: readInlineForProp(s.el, property),
      prevDraftValue: drafts.find(d => d.pagePath === pagePath && d.selector === s.selector && d.property === property)?.value ?? null,
    }));
    onRecordAction(mutations);

    setValues(prev => ({ ...prev, [property]: value }));
    // Apply locally for instant preview AND persist as draft — for every
    // selected element, not just the primary. Each gets its own draft row
    // (slot key is per (pagePath, selector, property), so this works).
    for (const s of selecteds) {
      applyLocal(s.el, property, value);
      onSaveDraft({ pagePath, selector: s.selector, property, value });
    }
  }, [pagePath, selecteds, drafts, onRecordAction, onSaveDraft]);

  /* ── Reorder support ──────────────────────────────────────────────────
   * "Move up" / "Move down" reorder the primary element among its
   * siblings via CSS `order`. Works only when the parent is a flex or
   * grid container — that's a CSS engine constraint, not ours. When
   * multi-select is active, reorder is disabled (one element at a time). */
  const reorderInfo = useMemo(() => {
    if (isMulti) return { canReorder: false, reason: 'Reorder works one element at a time.', isFirst: true, isLast: true };
    const parent = primary.el.parentElement;
    if (!parent) return { canReorder: false, reason: 'Element has no parent.', isFirst: true, isLast: true };
    const parentDisplay = window.getComputedStyle(parent).display;
    const isFlexOrGrid = /\b(flex|grid|inline-flex|inline-grid)\b/.test(parentDisplay);
    const siblings = Array.from(parent.children);
    const idx = siblings.indexOf(primary.el);
    return {
      canReorder: isFlexOrGrid,
      reason: isFlexOrGrid ? '' : `Parent <${parent.tagName.toLowerCase()}> isn't flex/grid (it's ${parentDisplay}). Click the parent → Layout → Display → flex to enable reordering.`,
      isFirst: idx <= 0,
      isLast:  idx >= siblings.length - 1,
      siblingCount: siblings.length,
    };
  }, [primary.el, isMulti]);

  const moveBy = useCallback((delta: -1 | 1) => {
    // Read the element's current `order` (saved draft, then computed style).
    // Use the larger absolute jump (10) so each click clearly clears the
    // neighbouring sibling's order — a click feels like one logical step
    // even when sibling defaults overlap at 0.
    const currentRaw = values.order || (window.getComputedStyle(primary.el).order || '0');
    const current = Number.isFinite(parseInt(currentRaw, 10)) ? parseInt(currentRaw, 10) : 0;
    const next = current + (delta === -1 ? -10 : 10);
    apply('order', String(next));
  }, [apply, primary.el, values.order]);

  return (
    <div
      className="site-editor-chrome"
      style={{
        position: 'fixed', top: '52px', right: '12px', bottom: '12px', width: '320px', zIndex: 2147483641,
        background: 'white', borderRadius: '0.75rem', boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
        border: '1px solid #e5e7eb',
      }}
    >
      {/* Header */}
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>{primary.tag}</span>
              {isMulti && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700,
                  padding: '0.1rem 0.4rem', borderRadius: '999px',
                  background: '#fef3c7', color: '#92400e',
                  textTransform: 'none', letterSpacing: 0,
                }}>
                  +{selecteds.length - 1} more
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {primary.selector}
            </div>
            {isMulti && (
              <div style={{ fontSize: '0.66rem', color: '#92400e', marginTop: '0.25rem', lineHeight: 1.4 }}>
                Edits apply to all {selecteds.length} selected elements. Shift-click to add/remove.
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="site-editor-chrome"
            style={{ background: 'transparent', border: 'none', fontSize: '1rem', cursor: 'pointer', color: '#9ca3af', padding: '0.2rem 0.4rem' }}
            title="Close panel"
          >×</button>
        </div>

        {/* Move Up / Down toolbar — front-and-centre so reordering feels
            obvious. Disabled with a hint when the parent isn't flex/grid
            (CSS `order` only takes effect inside flex/grid containers). */}
        <div style={{ marginTop: '0.7rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={() => moveBy(-1)}
              disabled={!reorderInfo.canReorder || reorderInfo.isFirst}
              className="site-editor-chrome"
              title={!reorderInfo.canReorder ? reorderInfo.reason : reorderInfo.isFirst ? 'Already first.' : 'Move this element earlier among its siblings.'}
              style={{
                flex: 1, fontSize: '0.74rem', fontWeight: 700,
                padding: '0.4rem 0.5rem', borderRadius: '0.35rem', cursor: (!reorderInfo.canReorder || reorderInfo.isFirst) ? 'not-allowed' : 'pointer',
                background: (!reorderInfo.canReorder || reorderInfo.isFirst) ? '#f3f4f6' : '#eef2ff',
                color:      (!reorderInfo.canReorder || reorderInfo.isFirst) ? '#9ca3af' : '#3730a3',
                border: '1px solid ' + ((!reorderInfo.canReorder || reorderInfo.isFirst) ? '#e5e7eb' : '#c7d2fe'),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              }}
            >↑ Move up</button>
            <button
              type="button"
              onClick={() => moveBy(1)}
              disabled={!reorderInfo.canReorder || reorderInfo.isLast}
              className="site-editor-chrome"
              title={!reorderInfo.canReorder ? reorderInfo.reason : reorderInfo.isLast ? 'Already last.' : 'Move this element later among its siblings.'}
              style={{
                flex: 1, fontSize: '0.74rem', fontWeight: 700,
                padding: '0.4rem 0.5rem', borderRadius: '0.35rem', cursor: (!reorderInfo.canReorder || reorderInfo.isLast) ? 'not-allowed' : 'pointer',
                background: (!reorderInfo.canReorder || reorderInfo.isLast) ? '#f3f4f6' : '#eef2ff',
                color:      (!reorderInfo.canReorder || reorderInfo.isLast) ? '#9ca3af' : '#3730a3',
                border: '1px solid ' + ((!reorderInfo.canReorder || reorderInfo.isLast) ? '#e5e7eb' : '#c7d2fe'),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              }}
            >↓ Move down</button>
          </div>
          {!reorderInfo.canReorder && (
            <div style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '0.3rem', lineHeight: 1.4 }}>
              {reorderInfo.reason}
            </div>
          )}
        </div>

        {/* Scope toggle */}
        <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.25rem', background: '#f3f4f6', borderRadius: '0.4rem', padding: '0.15rem' }}>
          {(['page', 'site'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className="site-editor-chrome"
              style={{
                flex: 1, fontSize: '0.72rem', fontWeight: 700,
                padding: '0.3rem 0.45rem', borderRadius: '0.3rem', cursor: 'pointer',
                background: scope === s ? 'white' : 'transparent',
                color: scope === s ? '#111827' : '#6b7280',
                border: 'none',
                boxShadow: scope === s ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {s === 'page' ? 'This page only' : 'Site-wide'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.4rem', lineHeight: 1.4 }}>
          {scope === 'page'
            ? <>Edits apply on <code style={{ background: '#f3f4f6', padding: '0 0.25rem', borderRadius: '0.2rem' }}>{pathname}</code> only.</>
            : <>Edits apply to <strong>every page</strong> matching this element.</>}
        </div>
      </div>

      {/* Property fields — grouped into collapsible sections so the panel
          isn't an overwhelming wall of inputs. Default-expanded groups are
          the most-used (Content, Color, Typography). The rest are collapsed
          but one click away. */}
      <div style={{ padding: '0.25rem 0 1rem', display: 'flex', flexDirection: 'column' }}>
        {(Object.keys(PROPERTIES_BY_GROUP) as PropertyGroup[]).map(group => {
          const props = PROPERTIES_BY_GROUP[group];
          if (props.length === 0) return null;
          const defaultOpen = group === 'content' || group === 'color' || group === 'typography';
          return (
            <CollapsibleGroup key={group} label={GROUP_LABELS[group]} defaultOpen={defaultOpen}>
              {props.map(prop => (
                <PropertyField
                  key={prop}
                  property={prop}
                  value={values[prop] ?? ''}
                  onChange={apply}
                  selected={primary}
                />
              ))}
            </CollapsibleGroup>
          );
        })}
      </div>
    </div>
  );
}

/* ── Collapsible group wrapper ─────────────────────────────────────── */
function CollapsibleGroup({ label, defaultOpen, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid #f3f4f6' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="site-editor-chrome"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.55rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: '0.85rem', color: '#9ca3af', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
      </button>
      {open && (
        <div style={{ padding: '0 1rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Property dispatcher — picks the right input type per property ── */

const SIZE_SUGGEST   = ['auto', '50%', '100%', '200px', '320px', '480px', '640px', '960px', '1200px'];
const SPACING_SUGGEST = ['0', '0.25rem', '0.5rem', '1rem', '1.5rem', '2rem', '3rem'];
const FONT_FAMILIES  = [
  'inherit',
  'system-ui, sans-serif',
  '"Plus Jakarta Sans", system-ui, sans-serif',
  'Sora, system-ui, sans-serif',
  '"DM Serif Display", Georgia, serif',
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  '"Courier New", Courier, monospace',
];

function PropertyField({ property, value, onChange, selected }: {
  property: EditableProperty;
  value: string;
  onChange: (p: EditableProperty, v: string) => void;
  selected: { el: Element; selector: string; tag: string };
}) {
  switch (property) {
    case 'text':
      return (
        <Field label="Text" help="Tip: double-click the element on the page to edit text in place.">
          <textarea
            value={value}
            onChange={e => onChange('text', e.target.value)}
            placeholder={selected.el.textContent?.slice(0, 80) || ''}
            rows={Math.min(6, Math.max(2, (value.match(/\n/g)?.length ?? 0) + 2))}
            style={{ ...panelInputStyle, fontFamily: 'inherit', resize: 'vertical', minHeight: '4rem' }}
          />
        </Field>
      );
    case 'hidden':
      return (
        <Field label="Visibility">
          <select value={value} onChange={e => onChange('hidden', e.target.value)} style={panelInputStyle}>
            <option value="false">Visible</option>
            <option value="true">Hidden (display:none)</option>
          </select>
        </Field>
      );
    case 'href': {
      const tag = selected.tag;
      const isLink = tag === 'a' || tag === 'area';
      if (!isLink) {
        return (
          <Field label="Link URL (href)">
            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              This isn't a link element. href only applies to &lt;a&gt; / &lt;area&gt;.
              Click the &lt;a&gt; ancestor to edit the link, or wrap this element in one.
            </div>
          </Field>
        );
      }
      return (
        <Field
          label="Link URL (href)"
          help="Use a full URL (https://…), a path (/contact), an anchor (#section), or mailto:/tel: schemes."
        >
          <input
            type="text"
            value={value}
            onChange={e => onChange('href', e.target.value)}
            placeholder="/contact   |   https://example.com   |   #section"
            style={panelInputStyle}
          />
          {/* External-link quick check — gentle hint, not a hard validation.
              Helps catch typos like missing 'https:' on external URLs. */}
          {value && /^[A-Za-z][\w+.-]*:/.test(value) && !/^(https?:|mailto:|tel:|sms:|ftp:|#|\/)/i.test(value) && (
            <div style={{ fontSize: '0.66rem', color: '#b45309', marginTop: '0.25rem' }}>
              Heads up: that doesn't look like a recognised URL scheme. Did you mean https://?
            </div>
          )}
        </Field>
      );
    }
    case 'target': {
      const tag = selected.tag;
      const isLinkLike = tag === 'a' || tag === 'area' || tag === 'form' || tag === 'base';
      if (!isLinkLike) {
        return (
          <Field label="Open in">
            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              `target` only applies to &lt;a&gt;, &lt;area&gt;, &lt;form&gt;, or &lt;base&gt;.
            </div>
          </Field>
        );
      }
      // Common target values + a friendly "Same tab / New tab" toggle.
      // Custom values (named windows / iframes) are still allowed via the
      // raw text input so admins targeting a specific iframe aren't locked out.
      const isBlank = value === '_blank';
      return (
        <Field
          label="Open in"
          help="_self = same tab (default). _blank = new tab. Custom names target a named iframe."
        >
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.3rem' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isBlank}
                onChange={e => onChange('target', e.target.checked ? '_blank' : '')}
              />
              <span>Open in new tab</span>
            </label>
          </div>
          <select
            value={['', '_self', '_blank', '_parent', '_top'].includes(value) ? value : '_custom'}
            onChange={e => {
              const v = e.target.value;
              if (v === '_custom') return; // leave the text input unchanged
              onChange('target', v === '' ? '' : v);
            }}
            style={panelInputStyle}
          >
            <option value="">— default (_self) —</option>
            <option value="_self">_self (same tab)</option>
            <option value="_blank">_blank (new tab)</option>
            <option value="_parent">_parent (parent frame)</option>
            <option value="_top">_top (top frame)</option>
            <option value="_custom">Custom (named target)…</option>
          </select>
          {!['', '_self', '_blank', '_parent', '_top'].includes(value) && (
            <input
              type="text"
              value={value}
              onChange={e => onChange('target', e.target.value)}
              placeholder="Named iframe target"
              style={{ ...panelInputStyle, marginTop: '0.3rem' }}
            />
          )}
        </Field>
      );
    }
    case 'src': {
      const tag = selected.tag;
      const isImageTag = tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'iframe';
      if (!isImageTag) {
        return (
          <Field label="Image source">
            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              This isn't an &lt;img&gt; / &lt;video&gt; / &lt;iframe&gt; element. Use the
              <strong> Background image</strong> field below instead, or click an actual
              image element on the page.
            </div>
          </Field>
        );
      }
      return (
        <ImageField
          label={`${tag} source`}
          property="src"
          value={value}
          onChange={onChange}
          help="Replace the image. New image gets uploaded; we save the URL as your customization."
        />
      );
    }
    case 'background-image':
      return (
        <ImageField
          label="Background image"
          property="background-image"
          value={value}
          onChange={onChange}
          asBackground
          help='Use "" (empty) to clear. CSS-style: url("/uploads/…"), or paste any URL.'
        />
      );
    case 'color':
      return <ColorField label="Text colour"     property={property} value={value} onChange={onChange} />;
    case 'background-color':
      return <ColorField label="Background"      property={property} value={value} onChange={onChange} />;
    case 'font-family':
      return <SelectField label="Font family"    property={property} value={value} onChange={onChange} options={FONT_FAMILIES} />;
    case 'font-size':
      return <UnitField label="Font size"        property={property} value={value} onChange={onChange} suggest={['12px', '14px', '16px', '20px', '24px', '32px', '48px', '64px']} />;
    case 'font-weight':
      return <SelectField label="Font weight"    property={property} value={value} onChange={onChange} options={['300', '400', '500', '600', '700', '800', '900']} />;
    case 'font-style':
      return <SelectField label="Font style"     property={property} value={value} onChange={onChange} options={['normal', 'italic']} />;
    case 'line-height':
      return <UnitField label="Line height"      property={property} value={value} onChange={onChange} suggest={['1', '1.2', '1.5', '1.75', '2']} />;
    case 'letter-spacing':
      return <UnitField label="Letter spacing"   property={property} value={value} onChange={onChange} suggest={['normal', '-0.02em', '0.01em', '0.05em', '0.1em']} />;
    case 'text-align':
      return <SelectField label="Text align"     property={property} value={value} onChange={onChange} options={['left', 'center', 'right', 'justify']} />;
    case 'text-transform':
      return <SelectField label="Text transform" property={property} value={value} onChange={onChange} options={['none', 'uppercase', 'lowercase', 'capitalize']} />;
    case 'text-decoration':
      return <SelectField label="Text decoration" property={property} value={value} onChange={onChange} options={['none', 'underline', 'line-through', 'overline']} />;
    case 'width':
    case 'max-width':
    case 'min-width':
    case 'height':
    case 'max-height':
    case 'min-height':
      return <UnitField label={property} property={property} value={value} onChange={onChange} suggest={SIZE_SUGGEST} />;
    case 'padding':
    case 'margin':
    case 'gap':
      return <UnitField label={property} property={property} value={value} onChange={onChange} suggest={SPACING_SUGGEST} />;
    case 'display':
      return <SelectField label="Display"        property={property} value={value} onChange={onChange} options={['', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none']} />;
    case 'flex-direction':
      return <SelectField label="Flex direction" property={property} value={value} onChange={onChange} options={['row', 'row-reverse', 'column', 'column-reverse']} />;
    case 'justify-content':
      return <SelectField label="Justify"        property={property} value={value} onChange={onChange} options={['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']} />;
    case 'align-items':
      return <SelectField label="Align items"    property={property} value={value} onChange={onChange} options={['stretch', 'flex-start', 'center', 'flex-end', 'baseline']} />;
    case 'order':
      return (
        <Field label="Order"
               help="Within a flex/grid parent, lower order = earlier. Effectively reorders sibling sections.">
          <input
            type="number"
            value={value}
            onChange={e => onChange('order', e.target.value)}
            placeholder="0"
            style={panelInputStyle}
          />
        </Field>
      );
    case 'position':
      return <SelectField label="Position"       property={property} value={value} onChange={onChange} options={['static', 'relative', 'absolute', 'fixed', 'sticky']} />;
    case 'top':
    case 'left':
    case 'right':
    case 'bottom':
      return <UnitField label={property}         property={property} value={value} onChange={onChange} suggest={['auto', '0', '50%', '100%']} />;
    case 'z-index':
      return (
        <Field label="z-index">
          <input
            type="number"
            value={value}
            onChange={e => onChange('z-index', e.target.value)}
            placeholder="auto"
            style={panelInputStyle}
          />
        </Field>
      );
    case 'transform':
      return (
        <Field label="Transform" help="e.g. translate(10px, -20px) rotate(5deg) scale(0.9)">
          <input
            type="text"
            value={value}
            onChange={e => onChange('transform', e.target.value)}
            placeholder="none"
            style={panelInputStyle}
          />
        </Field>
      );
    case 'border-radius':
      return <UnitField label="Border radius"    property={property} value={value} onChange={onChange} suggest={['0', '4px', '8px', '12px', '24px', '999px']} />;
    case 'opacity':
      return <UnitField label="Opacity"          property={property} value={value} onChange={onChange} suggest={['0.25', '0.5', '0.75', '1']} />;
    default:
      // Type-exhaustive guard — TS will flag any new property added to
      // EDITABLE_PROPERTIES but missing a case here.
      return null;
  }
}

/* ── Field components ──────────────────────────────────────────────── */

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', marginBottom: '0.25rem' }}>{label}</label>
      {children}
      {help && <div style={{ fontSize: '0.66rem', color: '#9ca3af', marginTop: '0.2rem' }}>{help}</div>}
    </div>
  );
}

function ImageField({
  label, property, value, onChange, help, asBackground,
}: {
  label: string;
  property: EditableProperty;
  value: string;
  onChange: (p: EditableProperty, v: string) => void;
  help?: string;
  /** When true, value is wrapped as `url("…")` for CSS background-image. */
  asBackground?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>('');

  /** Pull the inner URL out of `url("…")` so the preview can render it,
   *  while we keep the raw `url(…)` form for CSS. */
  const previewSrc = (() => {
    if (!value) return '';
    const m = value.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    return m ? m[1] : value;
  })();

  const onFile = useCallback(async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/customizations/upload-image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed.');
        return;
      }
      // For background-image, wrap in url("…"); otherwise save raw URL.
      const next = asBackground ? `url("${data.url}")` : data.url;
      onChange(property, next);
    } catch {
      setError('Network error during upload.');
    } finally {
      setUploading(false);
    }
  }, [asBackground, onChange, property]);

  return (
    <Field label={label} help={help}>
      {/* Thumbnail preview — uses background-image so transparent PNGs
          show against a fallback colour. */}
      {previewSrc && (
        <div style={{
          marginBottom: '0.4rem',
          width: '100%', aspectRatio: '16 / 9',
          backgroundColor: '#f9fafb',
          backgroundImage: `url("${previewSrc.replace(/"/g, '\\"')}")`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          border: '1px solid #e5e7eb', borderRadius: '0.35rem',
        }} />
      )}

      {/* URL paste */}
      <input
        type="text"
        value={value}
        onChange={e => onChange(property, e.target.value)}
        placeholder={asBackground ? 'url("/path/to/image.jpg") or none' : '/uploads/site/abc.png'}
        style={panelInputStyle}
      />

      {/* Upload action */}
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="site-editor-chrome"
          style={{
            fontSize: '0.72rem', fontWeight: 700,
            padding: '0.35rem 0.7rem', borderRadius: '0.3rem',
            background: uploading ? '#e5e7eb' : '#1f2937',
            color: uploading ? '#6b7280' : 'white',
            border: 'none', cursor: uploading ? 'wait' : 'pointer',
          }}
        >
          {uploading ? 'Uploading…' : (value ? 'Replace image' : 'Upload image')}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(property, '')}
            className="site-editor-chrome"
            style={{
              fontSize: '0.7rem', fontWeight: 600,
              padding: '0.3rem 0.55rem', borderRadius: '0.3rem',
              background: 'transparent', color: '#6b7280',
              border: '1px solid #e5e7eb', cursor: 'pointer',
            }}
          >Clear</button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: '#dc2626' }}>{error}</div>
      )}
    </Field>
  );
}

function ColorField({ label, property, value, onChange }: { label: string; property: EditableProperty; value: string; onChange: (p: EditableProperty, v: string) => void }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input
          type="color"
          value={normaliseHex(value)}
          onChange={e => onChange(property, e.target.value)}
          style={{ width: '36px', height: '32px', border: '1px solid #d1d5db', borderRadius: '0.3rem', cursor: 'pointer', padding: 0, background: 'transparent' }}
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(property, e.target.value)}
          placeholder="#1E293B / rgb() / transparent"
          style={{ ...panelInputStyle, flex: 1 }}
        />
      </div>
    </Field>
  );
}

function UnitField({ label, property, value, onChange, suggest }: { label: string; property: EditableProperty; value: string; onChange: (p: EditableProperty, v: string) => void; suggest: string[] }) {
  return (
    <Field label={label}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(property, e.target.value)}
        placeholder={suggest[0]}
        style={panelInputStyle}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.3rem' }}>
        {suggest.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(property, s)}
            className="site-editor-chrome"
            style={{
              fontSize: '0.66rem', fontWeight: 600,
              padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
              background: '#f3f4f6', border: '1px solid #e5e7eb',
              color: '#374151', cursor: 'pointer',
            }}
          >{s}</button>
        ))}
      </div>
    </Field>
  );
}

function SelectField({ label, property, value, onChange, options }: { label: string; property: EditableProperty; value: string; onChange: (p: EditableProperty, v: string) => void; options: string[] }) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(property, e.target.value)} style={panelInputStyle}>
        <option value="">— inherit —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.7rem', fontWeight: 700,
  background: 'rgba(255,255,255,0.12)', color: 'white',
  padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
  border: '1px solid rgba(255,255,255,0.18)',
  marginRight: '0.15rem',
};

const panelInputStyle: React.CSSProperties = {
  width: '100%', padding: '0.4rem 0.55rem',
  border: '1px solid #d1d5db', borderRadius: '0.3rem',
  fontSize: '0.82rem', fontFamily: 'inherit', background: 'white', color: '#111827',
  boxSizing: 'border-box',
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function isEditorChrome(el: Element): boolean {
  // Walk up the DOM looking for our own UI markers.
  let cur: Element | null = el;
  while (cur) {
    if (cur.classList?.contains('site-editor-chrome')) return true;
    if (cur.id === HIGHLIGHT_BORDER_ID || cur.id === SELECTED_BORDER_ID) return true;
    cur = cur.parentElement;
  }
  return false;
}

function readInitialValues(el: Element): Record<EditableProperty, string> {
  // Start every property at empty string (or 'false' for the Boolean
  // synthetic). EDITABLE_PROPERTIES is the source of truth for what keys
  // must exist; the loop in PropertyField iterates that catalog so any
  // missing key falls back gracefully.
  const out: Record<EditableProperty, string> = Object.fromEntries(
    EDITABLE_PROPERTIES.map(k => [k, k === 'hidden' ? 'false' : '']),
  ) as Record<EditableProperty, string>;

  // Pre-populate `text` with the element's current textContent so admins
  // can edit it in place rather than retyping from scratch. Only saved as
  // a draft when the user actually changes it (the panel only calls apply
  // on user input, not on initial render).
  out.text = el.textContent ?? '';

  // For images, pre-fill the current src so the panel preview shows the
  // existing image and the input is editable.
  const tag = el.tagName.toLowerCase();
  if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'iframe') {
    out.src = (el as HTMLImageElement).getAttribute('src') ?? '';
  }
  // For hyperlinks, pre-fill href + target so the panel reflects current state.
  if (tag === 'a' || tag === 'area') {
    out.href   = (el as HTMLAnchorElement).getAttribute('href')   ?? '';
    out.target = (el as HTMLAnchorElement).getAttribute('target') ?? '';
  }
  if (tag === 'form' || tag === 'base') {
    out.target = (el as HTMLAnchorElement).getAttribute('target') ?? '';
  }

  const cs = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
  if (!cs) return out;

  // background-image — computed value comes back as `url("…")` or `none`.
  out['background-image'] = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';

  // Color properties — convert rgb()/rgba() to hex when possible so the
  // <input type="color"> picker shows the right swatch.
  out['color']            = rgbToHex(cs.color)            || cs.color           || '';
  out['background-color'] = rgbToHex(cs.backgroundColor) || cs.backgroundColor || '';

  // Typography
  out['font-family']      = cs.fontFamily      || '';
  out['font-size']        = cs.fontSize        || '';
  out['font-weight']      = cs.fontWeight      || '';
  out['font-style']       = cs.fontStyle       || '';
  out['line-height']      = cs.lineHeight      || '';
  out['letter-spacing']   = cs.letterSpacing   || '';
  out['text-align']       = cs.textAlign       || '';
  out['text-transform']   = cs.textTransform   || '';
  out['text-decoration']  = cs.textDecorationLine || cs.textDecoration || '';

  // Sizing
  out['width']        = cs.width        || '';
  out['max-width']    = cs.maxWidth     || '';
  out['min-width']    = cs.minWidth     || '';
  out['height']       = cs.height       || '';
  out['max-height']   = cs.maxHeight    || '';
  out['min-height']   = cs.minHeight    || '';

  // Spacing
  out['padding']      = cs.padding      || '';
  out['margin']       = cs.margin       || '';
  out['gap']          = cs.gap          || '';

  // Layout
  out['display']         = cs.display        || '';
  out['flex-direction']  = cs.flexDirection  || '';
  out['justify-content'] = cs.justifyContent || '';
  out['align-items']     = cs.alignItems     || '';
  out['order']           = cs.order           || '';

  // Position
  out['position']  = cs.position  || '';
  out['top']       = cs.top       || '';
  out['left']      = cs.left      || '';
  out['right']     = cs.right     || '';
  out['bottom']    = cs.bottom    || '';
  out['z-index']   = cs.zIndex    || '';
  out['transform'] = cs.transform === 'none' ? '' : (cs.transform || '');

  // Effects
  out['border-radius'] = cs.borderRadius || '';
  out['opacity']       = cs.opacity      || '';

  return out;
}

function applyLocal(el: Element, property: EditableProperty, value: string) {
  if (property === 'text') {
    el.textContent = value;
    return;
  }
  if (property === 'hidden') {
    if (value === 'true') (el as HTMLElement).style.display = 'none';
    else (el as HTMLElement).style.removeProperty('display');
    return;
  }
  if (property === 'src') {
    // Image replacement — same DOM-attribute path as the runtime applier.
    const tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'iframe') {
      (el as HTMLImageElement).setAttribute('src', value);
      if (tag === 'img' && el.hasAttribute('srcset')) el.removeAttribute('srcset');
    }
    return;
  }
  if (property === 'href') {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area') {
      (el as HTMLAnchorElement).setAttribute('href', value);
    }
    return;
  }
  if (property === 'target') {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area' || tag === 'form' || tag === 'base') {
      if (value) (el as HTMLAnchorElement).setAttribute('target', value);
      else       el.removeAttribute('target');
    }
    return;
  }
  // Real CSS property — apply via inline style so it wins over external CSS.
  (el as HTMLElement).style.setProperty(property, value, 'important');
}

function normaliseHex(value: string): string {
  if (!value) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  // Try parsing rgb(a) → hex. Only handles the common 3-channel case.
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
    return hex;
  }
  return '#000000';
}

function rgbToHex(rgb: string): string | null {
  if (!rgb) return null;
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}
