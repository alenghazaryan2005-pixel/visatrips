import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins simple strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('filters falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('handles conditional objects', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b');
  });

  it('de-dupes conflicting tailwind classes (twMerge behavior)', () => {
    // twMerge keeps the last conflicting class
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-600')).toBe('text-blue-600');
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });
});
