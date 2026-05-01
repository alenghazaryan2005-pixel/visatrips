/**
 * Tests for /api/features:
 *   GET  — returns every flag in the catalog with its current enabled value
 *   POST — admin-only flip; rejects unknown ids and non-boolean values
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { makeMockPrisma, type MockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
const mockAuth = { getAdminSession: vi.fn() };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
// Auth: route uses requireOwner — re-implement here so tests can drive
// the session shape via mockAuth.getAdminSession.
vi.mock('@/lib/auth', () => ({
  getAdminSession: mockAuth.getAdminSession,
  requireOwner: async () => {
    const sess = await mockAuth.getAdminSession();
    if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (sess.role !== 'owner') return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
    return sess;
  },
  isErrorResponse: (r: any) => r instanceof NextResponse,
}));

const { GET, POST } = await import('@/app/api/features/route');

function asReq(body: any): any { return { json: async () => body }; }
function reqEmpty(): any { return {}; }
function reset(p: MockPrisma) {
  Object.values(p).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset?.()));
  mockAuth.getAdminSession.mockReset();
}

describe('GET /api/features', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns each catalog flag with default value when no Setting rows exist', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([]);
    const res = await GET(reqEmpty());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.flags)).toBe(true);
    const orderTags = data.flags.find((f: any) => f.id === 'orderTags');
    expect(orderTags).toBeDefined();
    // orderTags catalog default is false → no Setting row → returns false.
    expect(orderTags.enabled).toBe(false);
    expect(orderTags.label).toBe('Order Tags');
  });

  it('reflects the stored Setting value when present', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'features.orderTags', value: JSON.stringify(true) },
    ]);
    const res = await GET(reqEmpty());
    const data = await res.json();
    const orderTags = data.flags.find((f: any) => f.id === 'orderTags');
    expect(orderTags.enabled).toBe(true);
  });

  it('falls back to default when stored value is malformed JSON', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'features.orderTags', value: 'not-json' },
    ]);
    const data = await (await GET(reqEmpty())).json();
    expect(data.flags.find((f: any) => f.id === 'orderTags').enabled).toBe(false);
  });
});

describe('POST /api/features', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await POST(asReq({ id: 'orderTags', enabled: true }));
    expect(res.status).toBe(401);
  });

  it('rejects unknown flag ids with 400', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '', role: 'owner' });
    const res = await POST(asReq({ id: 'totallyMadeUp', enabled: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown/i);
  });

  it('rejects non-boolean enabled values with 400', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '', role: 'owner' });
    const res = await POST(asReq({ id: 'orderTags', enabled: 'yes' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/boolean/i);
  });

  it('upserts the Setting row with category=features and stamps updatedBy', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '', role: 'owner' });
    mockPrisma.setting.upsert.mockResolvedValue({});
    const res = await POST(asReq({ id: 'orderTags', enabled: true }));
    expect(res.status).toBe(200);
    const call = mockPrisma.setting.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ key: 'features.orderTags' });
    expect(call.create).toMatchObject({
      key: 'features.orderTags',
      category: 'features',
      value: JSON.stringify(true),
      updatedBy: 'Alice',
    });
    expect(call.update).toMatchObject({ value: JSON.stringify(true), updatedBy: 'Alice' });
  });

  it('persists "false" the same way', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Bob', email: '', role: 'owner' });
    mockPrisma.setting.upsert.mockResolvedValue({});
    await POST(asReq({ id: 'orderTags', enabled: false }));
    const call = mockPrisma.setting.upsert.mock.calls[0][0];
    expect(call.update.value).toBe(JSON.stringify(false));
  });
});
