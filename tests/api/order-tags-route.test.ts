/**
 * Tests for /api/order-tags catalog (GET, POST) and /api/order-tags/[id]
 * (PATCH, DELETE).
 *
 * Focus: validation (color whitelist, name length, dupes), admin auth,
 * and the cleanup pass that scrubs deleted tag ids out of every order.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma, type MockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
const mockAuth = { getAdminSession: vi.fn() };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',   () => mockAuth);

const { GET, POST }              = await import('@/app/api/order-tags/route');
const { PATCH: PATCH_ID, DELETE: DELETE_ID } = await import('@/app/api/order-tags/[id]/route');

const params = (id: string) => ({ params: Promise.resolve({ id }) });
function req(body: any): any { return { json: async () => body }; }
function reqNoBody(): any { return {}; }

function reset(p: MockPrisma) {
  Object.values(p).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset?.()));
  mockAuth.getAdminSession.mockReset();
}

describe('GET /api/order-tags', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns the catalog ordered by sortOrder then name', async () => {
    mockPrisma.orderTag.findMany.mockResolvedValue([
      { id: 'a', name: 'Alpha', color: 'blue', icon: null, description: null, sortOrder: 10 },
    ]);
    const res = await GET(reqNoBody());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tags).toHaveLength(1);
    expect(mockPrisma.orderTag.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });
});

describe('POST /api/order-tags', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await POST(req({ name: 'VIP' }));
    expect(res.status).toBe(401);
  });

  it('requires a non-empty name', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    const res = await POST(req({ name: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/i);
  });

  it('falls back to color "blue" when an invalid color is supplied', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.count.mockResolvedValue(0);
    mockPrisma.orderTag.findFirst.mockResolvedValue(null);
    mockPrisma.orderTag.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));

    const res = await POST(req({ name: 'VIP', color: 'fuchsia-of-doom' }));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.tag.color).toBe('blue');
  });

  it('accepts whitelisted colors as-is', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.count.mockResolvedValue(0);
    mockPrisma.orderTag.findFirst.mockResolvedValue(null);
    mockPrisma.orderTag.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));

    const res = await POST(req({ name: 'VIP', color: 'emerald' }));
    expect((await res.json()).tag.color).toBe('emerald');
  });

  it('rejects duplicate tag names case-insensitively', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.count.mockResolvedValue(0);
    mockPrisma.orderTag.findFirst.mockResolvedValue({ id: 'existing', name: 'VIP' });
    const res = await POST(req({ name: 'vip' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already exists/i);
  });

  it('refuses to create when catalog is at the soft cap', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.count.mockResolvedValue(50);
    const res = await POST(req({ name: 'New' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limit/i);
  });

  it('truncates icon to 4 chars and description to 200 chars', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.count.mockResolvedValue(0);
    mockPrisma.orderTag.findFirst.mockResolvedValue(null);
    mockPrisma.orderTag.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
    const res = await POST(req({ name: 'X', icon: 'too-long-icon', description: 'a'.repeat(500) }));
    const data = await res.json();
    expect(data.tag.icon!.length).toBeLessThanOrEqual(4);
    expect(data.tag.description!.length).toBe(200);
  });
});

describe('DELETE /api/order-tags/[id]', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await DELETE_ID(reqNoBody(), params('xyz'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when tag does not exist', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.findUnique.mockResolvedValue(null);
    const res = await DELETE_ID(reqNoBody(), params('zzz'));
    expect(res.status).toBe(404);
  });

  it('scrubs the id from every Order.tags array and reports the count', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.findUnique.mockResolvedValue({ id: 'tag-1', name: 'VIP' });
    // Two orders carry the tag, one of them along with another id.
    mockPrisma.order.findMany.mockResolvedValue([
      { id: 'o1', tags: JSON.stringify(['tag-1']) },
      { id: 'o2', tags: JSON.stringify(['tag-1', 'tag-2']) },
    ]);
    mockPrisma.order.update.mockResolvedValue({});
    mockPrisma.orderTag.delete.mockResolvedValue({});

    const res = await DELETE_ID(reqNoBody(), params('tag-1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scrubbedFromOrders).toBe(2);

    // First order: only carried tag-1 → tags should become null.
    const calls = mockPrisma.order.update.mock.calls.map(c => c[0]);
    expect(calls[0]).toEqual({ where: { id: 'o1' }, data: { tags: null } });
    // Second order: still has tag-2 left → tags should be JSON of just that.
    expect(calls[1]).toEqual({ where: { id: 'o2' }, data: { tags: JSON.stringify(['tag-2']) } });
  });

  it('still calls orderTag.delete after scrubbing', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.findUnique.mockResolvedValue({ id: 'tag-x', name: 'X' });
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.orderTag.delete.mockResolvedValue({});
    const res = await DELETE_ID(reqNoBody(), params('tag-x'));
    expect(res.status).toBe(200);
    expect(mockPrisma.orderTag.delete).toHaveBeenCalledWith({ where: { id: 'tag-x' } });
  });
});

describe('PATCH /api/order-tags/[id]', () => {
  beforeEach(() => reset(mockPrisma));

  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await PATCH_ID(req({ name: 'New' }), params('id-1'));
    expect(res.status).toBe(401);
  });

  it('updates name + color when provided', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.findFirst.mockResolvedValue(null);
    mockPrisma.orderTag.update.mockImplementation(async ({ data }: any) => ({ id: 'id-1', ...data }));
    const res = await PATCH_ID(req({ name: 'Renamed', color: 'red' }), params('id-1'));
    expect(res.status).toBe(200);
    const updateCall = mockPrisma.orderTag.update.mock.calls[0][0];
    expect(updateCall.data.name).toBe('Renamed');
    expect(updateCall.data.color).toBe('red');
  });

  it('rejects renaming to an existing tag name', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.orderTag.findFirst.mockResolvedValue({ id: 'other', name: 'Used' });
    const res = await PATCH_ID(req({ name: 'used' }), params('id-1'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already exists/i);
  });

  it('returns 400 if no valid fields supplied', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    const res = await PATCH_ID(req({ unrelated: 'field' }), params('id-1'));
    expect(res.status).toBe(400);
  });
});
