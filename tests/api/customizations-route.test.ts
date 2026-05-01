/**
 * Tests for /api/customizations and /api/customizations/publish.
 *
 * Focus: role gating (owner-only writes; visitors get only published rows
 * on GET), validation (path/selector/property/value), draft-vs-published
 * separation, and the publish flow's per-slot atomic replace.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { makeMockPrisma, type MockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
const mockAuth = { getAdminSession: vi.fn() };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
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

const { GET, POST, DELETE } = await import('@/app/api/customizations/route');
const { POST: PUBLISH } = await import('@/app/api/customizations/publish/route');

const owner = { name: 'Alice', email: 'owner@v.com', role: 'owner' as const };
const employee = { name: 'Bob', email: 'b@v.com', role: 'employee' as const };

function asReq(url: string, body?: any): any {
  return { url, json: async () => body };
}
function reset(p: MockPrisma) {
  Object.values(p).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset?.()));
  mockAuth.getAdminSession.mockReset();
  // adminUser model exists but pageCustomization is added by the test helper;
  // verify it's there by exercising it below.
}

// Add pageCustomization to the mock prisma since it's a new model.
(mockPrisma as any).pageCustomization = {
  findMany:   vi.fn(),
  findUnique: vi.fn(),
  create:     vi.fn(),
  update:     vi.fn(),
  upsert:     vi.fn(),
  delete:     vi.fn(),
  deleteMany: vi.fn(),
};
(mockPrisma as any).$transaction = vi.fn(async (ops: any[]) => Promise.all(ops));

describe('GET /api/customizations', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects requests without a path query param', async () => {
    const res = await GET(asReq('http://x/api/customizations'));
    expect(res.status).toBe(400);
  });

  it('returns published rows only for unauthenticated visitors', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([
      { id: '1', pagePath: '*',          selector: 'body', property: 'color', value: '#000', status: 'published' },
      { id: '2', pagePath: '/admin',     selector: 'h1',   property: 'color', value: '#fff', status: 'published' },
    ]);
    const res = await GET(asReq('http://x/api/customizations?path=/admin'));
    expect(res.status).toBe(200);

    // Verify the where-clause excludes drafts.
    const findCall = (mockPrisma as any).pageCustomization.findMany.mock.calls[0][0];
    const statusFilter = findCall.where.AND.find((c: any) => 'status' in c);
    expect(statusFilter.status.in).toEqual(['published']);
  });

  it('includes drafts only when caller is owner AND drafts=1', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/customizations?path=/admin&drafts=1'));
    const findCall = (mockPrisma as any).pageCustomization.findMany.mock.calls[0][0];
    expect(findCall.where.AND.find((c: any) => 'status' in c).status.in).toEqual(['published', 'draft']);
  });

  it('does NOT include drafts for an employee even when drafts=1 is requested', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/customizations?path=/admin&drafts=1'));
    const findCall = (mockPrisma as any).pageCustomization.findMany.mock.calls[0][0];
    expect(findCall.where.AND.find((c: any) => 'status' in c).status.in).toEqual(['published']);
  });

  it('matches site-wide AND page-specific rows for the requested path', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/customizations?path=/india'));
    const findCall = (mockPrisma as any).pageCustomization.findMany.mock.calls[0][0];
    const pathFilter = findCall.where.AND.find((c: any) => 'OR' in c);
    expect(pathFilter.OR).toEqual([{ pagePath: '*' }, { pagePath: '/india' }]);
  });
});

describe('POST /api/customizations', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects employees with 403', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await POST(asReq('http://x', { pagePath: '/admin', selector: 'h1', property: 'color', value: '#000' }));
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await POST(asReq('http://x', { pagePath: '/admin', selector: 'h1', property: 'color', value: '#000' }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid pagePath / selector / property / value', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    expect((await POST(asReq('http://x', { pagePath: 'invalid', selector: 'h1', property: 'color', value: '#000' }))).status).toBe(400);
    expect((await POST(asReq('http://x', { pagePath: '/admin', selector: '',  property: 'color', value: '#000' }))).status).toBe(400);
    // 'background-attachment' isn't in the editable catalog → rejected.
    expect((await POST(asReq('http://x', { pagePath: '/admin', selector: 'h1', property: 'background-attachment', value: 'fixed' }))).status).toBe(400);
    expect((await POST(asReq('http://x', { pagePath: '/admin', selector: 'h1', property: 'color', value: '<bad>' }))).status).toBe(400);
  });

  it('upserts the draft row using the (pagePath, selector, property, status) compound key', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.upsert.mockImplementation(async ({ create }: any) => ({ id: 'new', ...create }));
    const res = await POST(asReq('http://x', { pagePath: '/admin', selector: 'h1', property: 'color', value: '#ff0000' }));
    expect(res.status).toBe(200);
    const call = (mockPrisma as any).pageCustomization.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      pagePath_selector_property_status: {
        pagePath: '/admin', selector: 'h1', property: 'color', status: 'draft',
      },
    });
    expect(call.create.status).toBe('draft');
  });
});

describe('DELETE /api/customizations', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects employees with 403', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await DELETE(asReq('http://x/api/customizations?id=abc'));
    expect(res.status).toBe(403);
  });

  it('deletes by id when ?id= is provided', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.delete.mockResolvedValue({});
    const res = await DELETE(asReq('http://x/api/customizations?id=row-1'));
    expect(res.status).toBe(200);
    expect((mockPrisma as any).pageCustomization.delete).toHaveBeenCalledWith({ where: { id: 'row-1' } });
  });

  it('bulk-discards drafts when ?status=draft', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.deleteMany.mockResolvedValue({ count: 3 });
    const res = await DELETE(asReq('http://x/api/customizations?status=draft'));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(3);
    expect((mockPrisma as any).pageCustomization.deleteMany).toHaveBeenCalledWith({ where: { status: 'draft' } });
  });

  it('bulk-discards drafts scoped to a path when both params provided', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.deleteMany.mockResolvedValue({ count: 1 });
    await DELETE(asReq('http://x/api/customizations?status=draft&pagePath=/india'));
    expect((mockPrisma as any).pageCustomization.deleteMany).toHaveBeenCalledWith({
      where: { status: 'draft', pagePath: '/india' },
    });
  });

  it('400s when neither id nor status=draft is given', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    const res = await DELETE(asReq('http://x/api/customizations'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/customizations/publish', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects employees with 403', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await PUBLISH(asReq('http://x', {}));
    expect(res.status).toBe(403);
  });

  it('returns published=0 when no drafts exist', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([]);
    const res = await PUBLISH(asReq('http://x', {}));
    expect(res.status).toBe(200);
    expect((await res.json()).published).toBe(0);
  });

  it('promotes each draft, deleting any existing published row at the same slot', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([
      { id: 'd1', pagePath: '/admin', selector: 'h1',  property: 'color', value: '#fff', status: 'draft' },
      { id: 'd2', pagePath: '*',      selector: '.btn',property: 'font-size', value: '20px', status: 'draft' },
    ]);
    (mockPrisma as any).pageCustomization.deleteMany.mockResolvedValue({ count: 0 });
    (mockPrisma as any).pageCustomization.update.mockResolvedValue({});

    const res = await PUBLISH(asReq('http://x', {}));
    expect(res.status).toBe(200);
    expect((await res.json()).published).toBe(2);

    // For each draft, deleteMany called for the published row at the same slot,
    // and update called to flip status to published.
    const deleteCalls = (mockPrisma as any).pageCustomization.deleteMany.mock.calls;
    expect(deleteCalls.length).toBe(2);
    expect(deleteCalls[0][0].where).toMatchObject({
      pagePath: '/admin', selector: 'h1', property: 'color', status: 'published',
    });
    const updateCalls = (mockPrisma as any).pageCustomization.update.mock.calls;
    expect(updateCalls[0][0].data.status).toBe('published');
    expect(updateCalls[1][0].data.status).toBe('published');
  });

  it('scopes to a single path when body.pagePath is provided', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    (mockPrisma as any).pageCustomization.findMany.mockResolvedValue([]);
    await PUBLISH(asReq('http://x', { pagePath: '/admin' }));
    const call = (mockPrisma as any).pageCustomization.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ status: 'draft', pagePath: '/admin' });
  });
});
