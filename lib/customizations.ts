/**
 * Page customizations — Phase 2 of the site editor. Owner accounts use
 * the floating "✏️ Customize" button to enter edit mode, click any element,
 * and tweak a small set of visual properties. Edits are saved as drafts;
 * a separate Publish action promotes drafts → published so visitors see
 * them.
 *
 * Storage model: each row in the PageCustomization table is ONE
 * (pagePath, selector, property, value, status) tuple. pagePath = '*'
 * means site-wide. The same (path, selector, property) slot can have BOTH
 * a draft and a published row at once — visitors see published; the owner
 * in edit mode sees the draft.
 *
 * This file is the pure data layer — types, validation, selector
 * generation, value sanitisation. Server-only DB helpers live in
 * lib/customizations-server.ts.
 */

/* ── Types ───────────────────────────────────────────────────────────── */

/** Sentinel pagePath value for "applies on every page". */
export const SITE_WIDE: string = '*';

/** Status of a stored customization. */
export type CustomizationStatus = 'draft' | 'published';

/**
 * Editable properties. Each entry maps to either a real CSS property
 * (color / font-size / padding / etc.) or one of these synthetic keys:
 *   - 'text'   → Element.textContent
 *   - 'hidden' → display: none vs original
 *   - 'src'    → <img>.src / <source>.src attribute
 *   - 'href'   → <a>.href attribute (and <area>)
 *   - 'target' → <a>.target attribute (_self / _blank / etc.)
 *
 * Synthetic keys can't go into the generated <style> block; they're
 * applied via DOM mutation. Keep this list tightly scoped — every entry
 * here needs UI in the property panel + apply logic in the runtime.
 */
export const EDITABLE_PROPERTIES = [
  // Content / visibility / hyperlinks
  'text',
  'hidden',
  'href',
  'target',
  // Media — image replacement (synthetic 'src' + real CSS 'background-image')
  'src',
  'background-image',
  // Color
  'color',
  'background-color',
  // Typography
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  // Sizing
  'width',
  'max-width',
  'min-width',
  'height',
  'max-height',
  'min-height',
  // Spacing
  'padding',
  'margin',
  'gap',
  // Layout
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'order',
  // Position
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'z-index',
  'transform',
  // Effects
  'border-radius',
  'opacity',
] as const;

export type EditableProperty = typeof EDITABLE_PROPERTIES[number];

export function isEditableProperty(p: string): p is EditableProperty {
  return (EDITABLE_PROPERTIES as readonly string[]).includes(p);
}

/* ── Property groups (for the editor UI) ────────────────────────────── */

export type PropertyGroup = 'content' | 'media' | 'color' | 'typography' | 'sizing' | 'spacing' | 'layout' | 'position' | 'effects';

export const GROUP_LABELS: Record<PropertyGroup, string> = {
  content:    'Content',
  media:      'Image / Media',
  color:      'Colours',
  typography: 'Typography',
  sizing:     'Sizing',
  spacing:    'Spacing',
  layout:     'Layout',
  position:   'Position',
  effects:    'Effects',
};

export const PROPERTY_GROUPS: Record<EditableProperty, PropertyGroup> = {
  // Content / hyperlinks
  text:               'content',
  hidden:             'content',
  href:               'content',
  target:             'content',
  // Media
  src:                'media',
  'background-image': 'media',
  // Color
  color:              'color',
  'background-color': 'color',
  // Typography
  'font-family':      'typography',
  'font-size':        'typography',
  'font-weight':      'typography',
  'font-style':       'typography',
  'line-height':      'typography',
  'letter-spacing':   'typography',
  'text-align':       'typography',
  'text-transform':   'typography',
  'text-decoration':  'typography',
  // Sizing
  width:              'sizing',
  'max-width':        'sizing',
  'min-width':        'sizing',
  height:             'sizing',
  'max-height':       'sizing',
  'min-height':       'sizing',
  // Spacing
  padding:            'spacing',
  margin:             'spacing',
  gap:                'spacing',
  // Layout
  display:            'layout',
  'flex-direction':   'layout',
  'justify-content':  'layout',
  'align-items':      'layout',
  order:              'layout',
  // Position
  position:           'position',
  top:                'position',
  left:               'position',
  right:              'position',
  bottom:             'position',
  'z-index':          'position',
  transform:          'position',
  // Effects
  'border-radius':    'effects',
  opacity:            'effects',
};

/** Properties grouped by group, in display order. */
export const PROPERTIES_BY_GROUP: Record<PropertyGroup, EditableProperty[]> = (() => {
  const out: Record<PropertyGroup, EditableProperty[]> = {
    content: [], media: [], color: [], typography: [], sizing: [], spacing: [],
    layout: [], position: [], effects: [],
  };
  for (const p of EDITABLE_PROPERTIES) out[PROPERTY_GROUPS[p]].push(p);
  return out;
})();

export interface CustomizationRow {
  id: string;
  pagePath: string;
  selector: string;
  property: EditableProperty;
  value: string;
  status: CustomizationStatus;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

/* ── Validation ──────────────────────────────────────────────────────── */

const MAX_SELECTOR = 500;
const MAX_VALUE = 2000;

export function validatePagePath(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const trimmed = p.trim();
  if (!trimmed) return null;
  // Either the wildcard, or a path starting with '/'.
  if (trimmed === SITE_WIDE) return SITE_WIDE;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.length > 200) return null;
  // Reject query / fragment to keep keys clean.
  if (trimmed.includes('?') || trimmed.includes('#')) return null;
  return trimmed;
}

/** Selectors so broad they'd catastrophically affect the page. Saving
 *  e.g. `display: none` against `body` would hide the entire site —
 *  something the editor UX has no good "undo" path for. We block them
 *  at write time so admins can't accidentally trash a page. */
const DANGEROUS_SELECTORS = new Set([
  '*', 'body', 'html', ':root', 'main', 'head', 'div',
]);

export function validateSelector(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed.length > MAX_SELECTOR) return null;
  // Defence-in-depth against CSS injection: block characters that could
  // break out of the selector context inside our generated <style> block.
  // We deliberately ALLOW `>` (the CSS child combinator) and `+`/`~`
  // (sibling combinators) since those are core selector syntax.
  if (/[{}<;]/.test(trimmed)) return null;
  // Block dangerously broad selectors that target the whole document or
  // every element of a top-level type. The editor's selector generator
  // only emits these for body itself (which it shouldn't because it
  // walks UP from the click target), but a hand-crafted POST could.
  if (DANGEROUS_SELECTORS.has(trimmed)) return null;
  return trimmed;
}

export function validateValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length > MAX_VALUE) return null;
  // Block CSS escape attempts. The value gets injected into a CSS
  // declaration (or assigned via DOM mutation for synthetic props).
  if (/[{}<>]/.test(v)) return null;
  return v;
}

/* ── Selector generation (client-side only — guard `document` access) ── */

/**
 * Build a position-based CSS selector for an element. Uses tag +
 * nth-of-type counts back to the body, so selectors survive class-name
 * churn but break if the page's structural order changes (admin can
 * re-edit if that happens).
 *
 * If the element has an `id`, we use that — it's the most stable anchor.
 * Otherwise we walk up the DOM up to MAX_DEPTH levels.
 */
const MAX_DEPTH = 10;

export function buildSelector(target: Element): string {
  if (typeof document === 'undefined') return '';
  if (target.id) return `#${cssEscape(target.id)}`;

  const parts: string[] = [];
  let node: Element = target;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (node === document.body) break;
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const tagName = node.tagName;
    const tag = tagName.toLowerCase();
    const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === tagName);
    const idx = sameTagSiblings.indexOf(node) + 1;
    parts.unshift(sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
    node = parent;
  }
  return 'body > ' + parts.join(' > ');
}

/** Minimal CSS.escape polyfill — covers the characters likely in real ids. */
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/* ── Apply customizations to the live DOM ────────────────────────────── */

/**
 * Build the `<style>` block content from a list of customizations. Only
 * real CSS properties go through here — synthetic ones (text, hidden)
 * are applied via mutateDOM below.
 */
export function buildCustomizationCSS(rows: Array<{ selector: string; property: EditableProperty; value: string }>): string {
  // Group by selector so we emit one block per element with all properties.
  const bySel = new Map<string, string[]>();
  for (const r of rows) {
    const cssProp = toCssProperty(r.property);
    if (!cssProp) continue;
    const decl = `${cssProp}: ${r.value} !important;`;
    const existing = bySel.get(r.selector) ?? [];
    existing.push(decl);
    bySel.set(r.selector, existing);
  }
  const blocks: string[] = [];
  for (const [sel, decls] of bySel) {
    blocks.push(`${sel} {\n  ${decls.join('\n  ')}\n}`);
  }
  return blocks.join('\n\n');
}

/**
 * Map an editable property to its actual CSS property name, or null for
 * synthetic ones that don't go through CSS (text, hidden, src, href, target).
 *
 * Most editable properties have a 1:1 CSS-property mapping, so this just
 * returns the same string. The synthetic ones are applied via DOM
 * mutation by applySyntheticMutation() instead.
 *
 * Note: 'background-image' IS a real CSS property — it stays here, not
 * synthetic. The synthetics are all DOM attributes / properties.
 */
function toCssProperty(p: EditableProperty): string | null {
  if (p === 'text' || p === 'hidden' || p === 'src' || p === 'href' || p === 'target') return null;
  // Every other editable property is a real CSS property name. Cast keeps
  // the return type stable.
  return p as string;
}

/**
 * Synthetic-property mutations — return a function that re-applies the
 * mutation each time, so callers can run it after page hydration / DOM
 * changes without redoing the full customization fetch.
 *
 * For 'hidden': we set display:none via inline style. For 'text': we
 * replace textContent.
 */
export function applySyntheticMutation(row: { selector: string; property: EditableProperty; value: string }): void {
  if (typeof document === 'undefined') return;
  let elements: Element[];
  try {
    elements = Array.from(document.querySelectorAll(row.selector));
  } catch {
    return; // bad selector — skip
  }
  for (const el of elements) {
    if (row.property === 'hidden') {
      const wantHidden = row.value === 'true';
      const isHidden = (el as HTMLElement).style.display === 'none';
      // Only mutate when state differs — keeps the MutationObserver from
      // catching our own writes and re-firing the apply loop.
      if (wantHidden && !isHidden) {
        (el as HTMLElement).style.display = 'none';
      } else if (!wantHidden && isHidden) {
        (el as HTMLElement).style.removeProperty('display');
      }
    } else if (row.property === 'text') {
      // CRITICAL: skip the write if textContent already matches. Without
      // this guard, React-managed elements ping-pong between us setting
      // the override and React's reconciler restoring the source value
      // — that loop can lock the main thread and freeze the page.
      if (el.textContent !== row.value) {
        el.textContent = row.value;
      }
    } else if (row.property === 'src') {
      // Image replacement. Same no-op guard as text — React reconcilers
      // can fight us if we keep writing identical values. Targets <img>,
      // <source>, <video>, <audio> — anything with a src attribute.
      const tag = el.tagName.toLowerCase();
      if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'iframe') {
        const current = (el as HTMLImageElement).getAttribute('src') ?? '';
        if (current !== row.value) {
          (el as HTMLImageElement).setAttribute('src', row.value);
          // <img srcset> wins over src in modern browsers — clear it so
          // our override actually shows.
          if (tag === 'img' && el.hasAttribute('srcset')) {
            el.removeAttribute('srcset');
          }
        }
      }
    } else if (row.property === 'href') {
      // Hyperlink target. Only applies to elements where href has meaning.
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' || tag === 'area') {
        const current = (el as HTMLAnchorElement).getAttribute('href') ?? '';
        if (current !== row.value) {
          (el as HTMLAnchorElement).setAttribute('href', row.value);
        }
      }
    } else if (row.property === 'target') {
      // Open-in behaviour for links + form submissions.
      const tag = el.tagName.toLowerCase();
      if (tag === 'a' || tag === 'area' || tag === 'form' || tag === 'base') {
        const current = (el as HTMLAnchorElement).getAttribute('target') ?? '';
        if (current !== row.value) {
          if (row.value) (el as HTMLAnchorElement).setAttribute('target', row.value);
          else el.removeAttribute('target');
        }
      }
    }
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Match a customization's pagePath against the current path. */
export function pathMatches(customizationPath: string, currentPath: string): boolean {
  if (customizationPath === SITE_WIDE) return true;
  return customizationPath === currentPath;
}
