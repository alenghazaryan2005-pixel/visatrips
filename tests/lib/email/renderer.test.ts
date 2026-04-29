import { describe, it, expect } from 'vitest';
import { interpolate, renderStructured, STRUCTURED_DEFAULTS } from '@/lib/email/renderer';

describe('interpolate', () => {
  it('replaces {var} placeholders with values', () => {
    expect(interpolate('Hello {name}', { name: 'John' })).toBe('Hello John');
  });

  it('coerces non-string values', () => {
    expect(interpolate('{count} orders', { count: 5 })).toBe('5 orders');
    expect(interpolate('{flag}', { flag: true })).toBe('true');
  });

  it('drops missing placeholders to empty string', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello ');
    expect(interpolate('Hello {name}', { name: null })).toBe('Hello ');
    expect(interpolate('Hello {name}', { name: undefined })).toBe('Hello ');
  });

  it('handles multiple placeholders', () => {
    expect(interpolate('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('ignores unknown brace-ish text that is not \\w+', () => {
    expect(interpolate('Price: $10', {})).toBe('Price: $10');
    expect(interpolate('{}', {})).toBe('{}'); // no \w+ inside
  });

  it('handles empty template', () => {
    expect(interpolate('', { x: 1 })).toBe('');
    expect(interpolate(undefined as any, {})).toBe('');
  });
});

describe('renderStructured — smoke', () => {
  it('renders a minimal email', () => {
    const html = renderStructured({ heading: 'Hello' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Hello');
    expect(html).toContain('VisaTrips');
  });

  it('interpolates variables across all fields', () => {
    const html = renderStructured(
      {
        icon: '✅',
        heading: 'Hello {name}',
        subheading: 'Your order #{orderNumber}',
        paragraphs: ['Paragraph with {name}'],
        card: { title: 'Order', rows: [{ label: 'Order', value: '{orderNumber}' }] },
        button: { text: 'View {name}', url: '/order/{orderNumber}' },
        footnote: 'Thanks {name}',
      },
      { name: 'John', orderNumber: '00042' },
    );
    expect(html).toContain('Hello John');
    expect(html).toContain('Your order #00042');
    expect(html).toContain('Paragraph with John');
    expect(html).toContain('View John');
    expect(html).toContain('/order/00042');
    expect(html).toContain('Thanks John');
  });

  it('escapes user input to prevent HTML injection', () => {
    const html = renderStructured({ heading: 'Hi {name}' }, { name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderStructured — button url handling', () => {
  it('prepends SITE_URL to relative paths', () => {
    const html = renderStructured({ heading: 'x', button: { text: 'Go', url: '/login' } });
    expect(html).toMatch(/href="[^"]*\/login"/);
  });

  it('leaves absolute https URLs untouched', () => {
    const html = renderStructured({
      heading: 'x',
      button: { text: 'Go', url: 'https://external.example.com/x' },
    });
    expect(html).toContain('href="https://external.example.com/x"');
  });

  it('handles url without a leading slash', () => {
    const html = renderStructured({ heading: 'x', button: { text: 'Go', url: 'login' } });
    expect(html).toMatch(/href="[^"]*\/login"/);
  });
});

describe('renderStructured — color handling', () => {
  it('uses named heading colors', () => {
    const html = renderStructured({ heading: 'x', headingColor: 'green' });
    expect(html).toContain('#059669');
  });

  it('accepts custom hex heading color', () => {
    const html = renderStructured({ heading: 'x', headingColor: '#8b5cf6' });
    expect(html).toContain('#8b5cf6');
  });

  it('falls back to default color for unknown preset', () => {
    const html = renderStructured({ heading: 'x', headingColor: 'mauve' });
    expect(html).toContain('#1E293B'); // default heading color
  });
});

describe('renderStructured — highlightBox', () => {
  it('omits the block when highlightBox is absent', () => {
    const html = renderStructured({ heading: 'x' });
    expect(html).not.toContain('YOUR ACCOUNT PIN');
  });

  it('renders the big value with the green theme by default', () => {
    const html = renderStructured({
      heading: 'x',
      highlightBox: { label: 'YOUR PIN', value: '1234', description: 'keep safe' },
    });
    expect(html).toContain('YOUR PIN');
    expect(html).toContain('1234');
    expect(html).toContain('keep safe');
    expect(html).toContain('#F0FDF4'); // green bg
  });

  it('interpolates vars inside the highlight box', () => {
    const html = renderStructured(
      { heading: 'x', highlightBox: { label: 'PIN', value: '{pin}' } },
      { pin: '9876' },
    );
    expect(html).toContain('9876');
  });
});

describe('STRUCTURED_DEFAULTS', () => {
  it('defines a subject and heading for every template', () => {
    for (const [key, tpl] of Object.entries(STRUCTURED_DEFAULTS)) {
      expect(tpl.subject, `subject missing for ${key}`).toBeTruthy();
      expect(tpl.structured.heading, `heading missing for ${key}`).toBeTruthy();
    }
  });

  it('every template renders without throwing', () => {
    const vars = {
      name: 'John',
      orderNumber: '00042',
      destination: 'India',
      visaType: 'Tourist',
      travelers: '1',
      total: '99',
      applicationId: 'ABCD1234',
      status: 'PROCESSING',
      specialistNotes: 'Please re-upload photo.',
      pin: '1234',
    };
    for (const [key, tpl] of Object.entries(STRUCTURED_DEFAULTS)) {
      const html = renderStructured(tpl.structured, vars);
      expect(html, `${key} render output`).toContain('<!DOCTYPE html>');
      // No unresolved placeholders
      expect(html, `${key} has unresolved vars`).not.toMatch(/\{\w+\}/);
    }
  });
});
