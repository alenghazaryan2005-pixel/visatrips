/**
 * Tests for /api/settings/application-schema — GET (public) + PUT (admin).
 *
 * Focus: the merge-on-GET behavior (stored overrides + current code defaults),
 * Phase 1 → Phase 2 migration (customSections → sections), and the PUT
 * normalisation + sanitization (label trim, key sanitizer, enum coercion).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
const mockAuth = { getAdminSession: vi.fn() };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',   () => mockAuth);

const { GET, PUT } = await import('@/app/api/settings/application-schema/route');

function asReq(url: string, body?: any): any {
  return {
    url,
    json: async () => body,
  };
}

beforeEach(() => {
  mockPrisma.setting.findUnique.mockReset();
  mockPrisma.setting.upsert.mockReset();
  mockAuth.getAdminSession.mockReset();
});

describe('GET /api/settings/application-schema', () => {
  it('returns the built-in India defaults when nothing is stored', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);

    const res = await GET(asReq('http://x/api/settings/application-schema?country=INDIA'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.country).toBe('INDIA');
    expect(body.sections.length).toBeGreaterThan(0);
    // Built-ins like `passport` section must be present
    expect(body.sections.some((s: any) => s.key === 'passport')).toBe(true);
  });

  it('uppercases the country query param', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    await GET(asReq('http://x/api/settings/application-schema?country=india'));
    expect(mockPrisma.setting.findUnique).toHaveBeenCalledWith({
      where: { key: 'application.schema.INDIA' },
    });
  });

  it('defaults to INDIA when no country param given', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    await GET(asReq('http://x/api/settings/application-schema'));
    expect(mockPrisma.setting.findUnique).toHaveBeenCalledWith({
      where: { key: 'application.schema.INDIA' },
    });
  });

  it('applies admin label overrides on top of built-ins', async () => {
    const stored = {
      country: 'INDIA',
      sections: [
        {
          key: 'personal',
          title: 'Personal',
          builtIn: true,
          fields: [{ key: 'firstName', label: 'Given name', type: 'text', builtIn: true }],
        },
      ],
    };
    mockPrisma.setting.findUnique.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: JSON.stringify(stored),
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });

    const res = await GET(asReq('http://x/api/settings/application-schema?country=INDIA'));
    const body = await res.json();
    const personal = body.sections.find((s: any) => s.key === 'personal');
    expect(personal.fields.find((f: any) => f.key === 'firstName').label).toBe('Given name');
    // And the rest of personal still has lastName etc.
    expect(personal.fields.some((f: any) => f.key === 'lastName')).toBe(true);
  });

  it('migrates legacy Phase-1 customSections into sections', async () => {
    // Before the unified sections field existed, admins stored custom-only sections
    // under `customSections` with no builtIn flag. GET should migrate + mark as custom.
    const legacy = {
      country: 'INDIA',
      customSections: [
        {
          key: 'legacy_extra',
          title: 'Extras',
          fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
        },
      ],
    };
    mockPrisma.setting.findUnique.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: JSON.stringify(legacy),
      updatedAt: new Date(),
    });

    const res = await GET(asReq('http://x/api/settings/application-schema?country=INDIA'));
    const body = await res.json();
    const legacySection = body.sections.find((s: any) => s.key === 'legacy_extra');
    expect(legacySection).toBeDefined();
    expect(legacySection.builtIn).not.toBe(true); // migrated as custom
    expect(legacySection.fields[0].key).toBe('notes');
  });

  it('tolerates a corrupt stored value and falls back to defaults', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{{{{not json',
      updatedAt: new Date(),
    });

    const res = await GET(asReq('http://x/api/settings/application-schema?country=INDIA'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Defaults still returned — no crash
    expect(body.sections.some((s: any) => s.key === 'passport')).toBe(true);
  });

  it('returns 500 when the db throws', async () => {
    mockPrisma.setting.findUnique.mockRejectedValue(new Error('db down'));
    const res = await GET(asReq('http://x/api/settings/application-schema?country=INDIA'));
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/settings/application-schema', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await PUT(asReq('http://x/api/settings/application-schema', { country: 'INDIA', sections: [] }));
    expect(res.status).toBe(401);
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('sanitises section/field keys and drops sections with no title', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });

    const body = {
      country: 'INDIA',
      sections: [
        {
          key: 'bad key!!  with spaces 💥',
          title: '  My Extras  ',
          fields: [
            { key: '9starts-with-number', label: 'Good field', type: 'text' },
            { key: 'empty-label', label: '   ', type: 'text' },      // dropped
            { key: 'bogus-type', label: 'x', type: 'rocket' as any }, // coerced to text
            { key: 'sel', label: 'Pick', type: 'select', options: ['A', '', 42, 'B'] }, // filters non-strings
          ],
        },
        { title: 'No key section', fields: [] },  // should get fallback key
        { key: 'no_title', fields: [] },          // no title → dropped entirely
      ],
    };

    await PUT(asReq('http://x', body));
    expect(mockPrisma.setting.upsert).toHaveBeenCalledTimes(1);

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    // Section without a title is dropped
    expect(saved.sections.find((s: any) => s.key === 'no_title')).toBeUndefined();
    // Section with sanitised key
    const first = saved.sections[0];
    // 4 underscores in middle (!!  → __ __), 3 trailing (space + emoji surrogate pair)
    expect(first.key).toBe('bad_key____with_spaces___');
    expect(first.title).toBe('My Extras');
    // Fields: good field kept, empty-label dropped, bogus type → text, select options filtered
    expect(first.fields.length).toBe(3);
    const goodField = first.fields.find((f: any) => f.label === 'Good field');
    expect(goodField.key).toBe('starts_with_number'); // leading digits stripped
    const bogus = first.fields.find((f: any) => f.label === 'x');
    expect(bogus.type).toBe('text'); // coerced
    const sel = first.fields.find((f: any) => f.key === 'sel');
    expect(sel.options).toEqual(['A', 'B']);
  });

  it('defaults pages=[finish] when none provided', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date(),
    });

    await PUT(asReq('http://x', {
      country: 'INDIA',
      sections: [{ key: 's1', title: 'T', fields: [] }],
    }));

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    expect(saved.sections[0].pages).toEqual(['finish']);
  });

  it('filters pages to only valid values', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date(),
    });

    await PUT(asReq('http://x', {
      country: 'INDIA',
      sections: [
        { key: 's1', title: 'T', pages: ['apply', 'nope', 'finish'] as any, fields: [] },
      ],
    }));

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    expect(saved.sections[0].pages).toEqual(['apply', 'finish']);
  });

  it('round-trips deletedBuiltIns tombstones', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date(),
    });

    await PUT(asReq('http://x', {
      country: 'INDIA',
      sections: [],
      deletedBuiltIns: ['accommodation', 'passport.otherPassportNumber', 'family'],
    }));

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    expect(saved.deletedBuiltIns).toEqual([
      'accommodation', 'passport.otherPassportNumber', 'family',
    ]);
  });

  it('rejects malformed deletedBuiltIns entries (non-strings, weird chars)', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date(),
    });

    await PUT(asReq('http://x', {
      country: 'INDIA',
      sections: [],
      deletedBuiltIns: [
        'good_section',                  // ✓ valid
        'good_section.good_field',       // ✓ valid
        42 as any,                       // ✗ not a string
        'has spaces',                    // ✗ regex rejects
        'has.too.many.dots',             // ✗ regex rejects
        '<script>alert(1)</script>',     // ✗ regex rejects
        'good_section',                  // duplicate — should be deduped
      ],
    }));

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    expect(saved.deletedBuiltIns).toEqual(['good_section', 'good_section.good_field']);
  });

  it('round-trips visibleForVisaTypes', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date(),
    });

    await PUT(asReq('http://x', {
      country: 'INDIA',
      sections: [
        { key: 'biz_only',  title: 'Business only',  fields: [], visibleForVisaTypes: ['BUSINESS_1Y'] },
        { key: 'multi',     title: 'Two visas',      fields: [], visibleForVisaTypes: ['BUSINESS_1Y', 'MEDICAL_60', 'BUSINESS_1Y'] },
        { key: 'all_visas', title: 'No restriction', fields: [], visibleForVisaTypes: [] },
        { key: 'no_field',  title: 'Missing field',  fields: [] },
      ],
    }));

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    const sections = saved.sections;

    const bizOnly = sections.find((s: any) => s.key === 'biz_only');
    expect(bizOnly.visibleForVisaTypes).toEqual(['BUSINESS_1Y']);

    // Duplicates deduped
    const multi = sections.find((s: any) => s.key === 'multi');
    expect(multi.visibleForVisaTypes).toEqual(['BUSINESS_1Y', 'MEDICAL_60']);

    // Empty array becomes "no restriction" — field omitted from saved payload
    const allVisas = sections.find((s: any) => s.key === 'all_visas');
    expect('visibleForVisaTypes' in allVisas).toBe(false);

    // Missing — also omitted
    const noField = sections.find((s: any) => s.key === 'no_field');
    expect('visibleForVisaTypes' in noField).toBe(false);
  });

  it('rejects non-string + over-long visa codes in visibleForVisaTypes', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date(),
    });

    await PUT(asReq('http://x', {
      country: 'INDIA',
      sections: [
        {
          key: 's', title: 'T',
          fields: [],
          visibleForVisaTypes: ['BUSINESS_1Y', 42, '', '   ', 'a'.repeat(70)],
        },
      ],
    }));

    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value);
    expect(saved.sections[0].visibleForVisaTypes).toEqual(['BUSINESS_1Y']);
  });

  it('returns the merged result — not just the saved input', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.setting.upsert.mockResolvedValue({
      key: 'application.schema.INDIA',
      value: '{}',
      updatedAt: new Date('2026-04-01T00:00:00Z'),
    });

    const res = await PUT(asReq('http://x', { country: 'INDIA', sections: [] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Even though admin saved an empty sections array, the merged result
    // includes all built-in defaults (so nothing gets lost in the UI).
    expect(body.sections.some((s: any) => s.key === 'passport')).toBe(true);
  });
});
