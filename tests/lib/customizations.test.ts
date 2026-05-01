import { describe, expect, it } from 'vitest';
import {
  EDITABLE_PROPERTIES,
  GROUP_LABELS,
  PROPERTIES_BY_GROUP,
  PROPERTY_GROUPS,
  SITE_WIDE,
  buildCustomizationCSS,
  isEditableProperty,
  pathMatches,
  validatePagePath,
  validateSelector,
  validateValue,
} from '@/lib/customizations';

describe('EDITABLE_PROPERTIES', () => {
  it('contains every property listed across PROPERTIES_BY_GROUP exactly once', () => {
    const flattened: string[] = [];
    for (const list of Object.values(PROPERTIES_BY_GROUP)) flattened.push(...list);
    // Same length + same set as EDITABLE_PROPERTIES.
    expect(flattened.length).toBe(EDITABLE_PROPERTIES.length);
    expect(new Set(flattened).size).toBe(EDITABLE_PROPERTIES.length);
    expect(new Set(flattened)).toEqual(new Set(EDITABLE_PROPERTIES));
  });
  it('catalog covers the major Phase 2.5 additions', () => {
    // Sample-check the new properties added in Phase 2.5 — the panel UI
    // and the runtime applier both rely on these being in the catalog.
    expect(EDITABLE_PROPERTIES).toContain('width');
    expect(EDITABLE_PROPERTIES).toContain('height');
    expect(EDITABLE_PROPERTIES).toContain('font-family');
    expect(EDITABLE_PROPERTIES).toContain('display');
    expect(EDITABLE_PROPERTIES).toContain('flex-direction');
    expect(EDITABLE_PROPERTIES).toContain('order');
    expect(EDITABLE_PROPERTIES).toContain('position');
    expect(EDITABLE_PROPERTIES).toContain('transform');
    expect(EDITABLE_PROPERTIES).toContain('z-index');
  });
  it('every property has a group assigned', () => {
    for (const p of EDITABLE_PROPERTIES) {
      const group = PROPERTY_GROUPS[p];
      expect(group).toBeDefined();
      expect(GROUP_LABELS[group]).toBeTruthy();
    }
  });
});

describe('isEditableProperty', () => {
  it('accepts every property in the catalog', () => {
    for (const p of EDITABLE_PROPERTIES) expect(isEditableProperty(p)).toBe(true);
  });
  it('rejects unknown properties', () => {
    expect(isEditableProperty('content')).toBe(false);            // CSS pseudo-element prop, not in catalog
    expect(isEditableProperty('background-attachment')).toBe(false); // not in catalog
    expect(isEditableProperty('')).toBe(false);
    expect(isEditableProperty('script')).toBe(false);
  });
});

describe('validatePagePath', () => {
  it('accepts the SITE_WIDE wildcard', () => {
    expect(validatePagePath('*')).toBe('*');
    expect(SITE_WIDE).toBe('*');
  });
  it('accepts paths starting with /', () => {
    expect(validatePagePath('/admin')).toBe('/admin');
    expect(validatePagePath('/admin/orders')).toBe('/admin/orders');
    expect(validatePagePath('/india')).toBe('/india');
  });
  it('trims whitespace', () => {
    expect(validatePagePath('  /admin  ')).toBe('/admin');
  });
  it('rejects relative paths and bare strings', () => {
    expect(validatePagePath('admin')).toBeNull();
    expect(validatePagePath('foo bar')).toBeNull();
    expect(validatePagePath('')).toBeNull();
  });
  it('rejects paths with query / fragment to keep storage keys clean', () => {
    expect(validatePagePath('/admin?section=foo')).toBeNull();
    expect(validatePagePath('/admin#hash')).toBeNull();
  });
  it('rejects non-string input', () => {
    expect(validatePagePath(null)).toBeNull();
    expect(validatePagePath(123)).toBeNull();
    expect(validatePagePath({})).toBeNull();
  });
  it('rejects very long paths', () => {
    expect(validatePagePath('/' + 'a'.repeat(250))).toBeNull();
  });
});

describe('validateSelector', () => {
  it('accepts typical CSS selectors', () => {
    expect(validateSelector('body > main > h1')).toBe('body > main > h1');
    expect(validateSelector('#hero')).toBe('#hero');
    expect(validateSelector('body > div:nth-of-type(2)')).toBe('body > div:nth-of-type(2)');
  });
  it('rejects empty / non-string', () => {
    expect(validateSelector('')).toBeNull();
    expect(validateSelector('   ')).toBeNull();
    expect(validateSelector(null)).toBeNull();
  });
  it('rejects selectors with curly braces / left-angle / semicolons (CSS injection)', () => {
    expect(validateSelector('body { color: red; }')).toBeNull();
    expect(validateSelector('h1; font: x')).toBeNull();
    expect(validateSelector('<script>')).toBeNull();
  });
  it('allows the CSS child combinator (>) and sibling combinators (+, ~)', () => {
    expect(validateSelector('body > main > h1')).toBe('body > main > h1');
    expect(validateSelector('h1 + p')).toBe('h1 + p');
    expect(validateSelector('h1 ~ p')).toBe('h1 ~ p');
  });
  it('rejects selectors that target everything / the whole document', () => {
    // These would let one customization (e.g. display:none) trash the
    // entire site without an obvious undo path.
    expect(validateSelector('*')).toBeNull();
    expect(validateSelector('body')).toBeNull();
    expect(validateSelector('html')).toBeNull();
    expect(validateSelector(':root')).toBeNull();
    expect(validateSelector('main')).toBeNull();
    expect(validateSelector('head')).toBeNull();
    expect(validateSelector('div')).toBeNull();
  });
  it('still allows specific nested selectors that start at body', () => {
    // The editor's selector generator emits `body > main > section…` —
    // those should pass even though they start with body.
    expect(validateSelector('body > main > h1')).toBe('body > main > h1');
    expect(validateSelector('body > div:nth-of-type(2)')).toBe('body > div:nth-of-type(2)');
  });
  it('rejects > 500 chars', () => {
    expect(validateSelector('div > '.repeat(150))).toBeNull();
  });
});

describe('validateValue', () => {
  it('accepts arbitrary CSS strings', () => {
    expect(validateValue('#FF0000')).toBe('#FF0000');
    expect(validateValue('1.25rem')).toBe('1.25rem');
    expect(validateValue('rgba(255, 0, 0, 0.5)')).toBe('rgba(255, 0, 0, 0.5)');
  });
  it('accepts text content (any-string)', () => {
    expect(validateValue('Hello world')).toBe('Hello world');
    expect(validateValue('')).toBe('');
  });
  it('rejects values containing braces / angle brackets', () => {
    expect(validateValue('red; } body { background: blue;')).toBeNull();
    expect(validateValue('<img src=x>')).toBeNull();
  });
  it('rejects non-string and over-long values', () => {
    expect(validateValue(null)).toBeNull();
    expect(validateValue(123)).toBeNull();
    expect(validateValue('a'.repeat(2001))).toBeNull();
  });
});

describe('buildCustomizationCSS', () => {
  it('emits one block per selector with all properties grouped', () => {
    const css = buildCustomizationCSS([
      { selector: '#hero', property: 'color',            value: '#ff0000' },
      { selector: '#hero', property: 'background-color', value: '#000000' },
      { selector: '.btn',  property: 'font-size',        value: '20px' },
    ]);
    expect(css).toContain('#hero {');
    expect(css).toContain('color: #ff0000 !important;');
    expect(css).toContain('background-color: #000000 !important;');
    expect(css).toContain('.btn {');
    expect(css).toContain('font-size: 20px !important;');
  });
  it('skips synthetic properties (text, hidden) — those are DOM-mutated', () => {
    const css = buildCustomizationCSS([
      { selector: '#h', property: 'color',  value: '#fff' },
      { selector: '#h', property: 'text',   value: 'hi' },
      { selector: '#h', property: 'hidden', value: 'true' },
    ]);
    expect(css).toContain('color: #fff');
    expect(css).not.toContain('text:');
    expect(css).not.toContain('hidden:');
  });
  it('uses !important so customizations win over component CSS', () => {
    const css = buildCustomizationCSS([{ selector: '.x', property: 'color', value: '#000' }]);
    expect(css).toContain('!important');
  });
  it('returns empty string when given no rows', () => {
    expect(buildCustomizationCSS([])).toBe('');
  });
});

describe('pathMatches', () => {
  it('SITE_WIDE matches every path', () => {
    expect(pathMatches('*', '/anywhere')).toBe(true);
    expect(pathMatches('*', '/admin/orders')).toBe(true);
    expect(pathMatches('*', '/')).toBe(true);
  });
  it('exact-path matches itself only', () => {
    expect(pathMatches('/admin', '/admin')).toBe(true);
    expect(pathMatches('/admin', '/admin/orders')).toBe(false);
    expect(pathMatches('/admin/orders', '/admin')).toBe(false);
  });
});
