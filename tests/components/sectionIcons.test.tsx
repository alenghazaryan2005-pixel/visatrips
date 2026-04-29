// @vitest-environment jsdom
/**
 * Tests for lib/sectionIcons.tsx — icon registry + <SectionIcon/> fallback chain.
 *
 * SectionIcon falls through in this order:
 *   1. icon name (looked up in SECTION_ICONS)
 *   2. emoji (if provided)
 *   3. default Sparkles icon
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SectionIcon, getSectionIcon, SECTION_ICONS } from '@/lib/sectionIcons';

describe('SECTION_ICONS registry', () => {
  it('has unique names across the whole registry', () => {
    const names = SECTION_ICONS.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every entry has a label, Icon, and group', () => {
    for (const e of SECTION_ICONS) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.group.length).toBeGreaterThan(0);
      // Lucide components can be plain functions OR forwardRef objects
      expect(['function', 'object']).toContain(typeof e.Icon);
      expect(e.Icon).toBeTruthy();
    }
  });

  it('every entry shares a small set of groups (no typos)', () => {
    const groups = new Set(SECTION_ICONS.map(e => e.group));
    expect(groups.size).toBeLessThanOrEqual(10); // sanity bound
  });
});

describe('getSectionIcon', () => {
  it('returns the matching entry by exact name', () => {
    const entry = getSectionIcon('User');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('User');
  });

  it('returns null for missing name', () => {
    expect(getSectionIcon('Gobbledygook')).toBeNull();
  });

  it('returns null for falsy input', () => {
    expect(getSectionIcon(null)).toBeNull();
    expect(getSectionIcon(undefined)).toBeNull();
    expect(getSectionIcon('')).toBeNull();
  });
});

describe('<SectionIcon>', () => {
  it('renders a Lucide icon (SVG) when icon name is known', () => {
    const { container } = render(<SectionIcon icon="User" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Lucide icons ship with a lucide class
    expect(svg!.getAttribute('class') || '').toMatch(/lucide/);
  });

  it('renders the emoji fallback when icon is unknown but emoji is given', () => {
    render(<SectionIcon icon="NopeSuchIcon" emoji="📱" />);
    expect(screen.getByText('📱')).toBeInTheDocument();
  });

  it('renders emoji when no icon name provided', () => {
    render(<SectionIcon emoji="✈️" />);
    expect(screen.getByText('✈️')).toBeInTheDocument();
  });

  it('falls back to default Sparkles icon when neither is given', () => {
    const { container } = render(<SectionIcon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('passes size prop through to the svg', () => {
    const { container } = render(<SectionIcon icon="User" size={32} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('passes strokeWidth through', () => {
    const { container } = render(<SectionIcon icon="User" strokeWidth={3} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke-width')).toBe('3');
  });
});
