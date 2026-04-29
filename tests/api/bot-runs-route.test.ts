/**
 * Tests for /api/bot-runs — list bot runs with per-source count summary.
 *
 * Focus: auth gate, query filters (orderId, limit), and the summary
 * aggregation (ok / failed / manual / skipped / admin buckets).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
const mockAuth = { getAdminSession: vi.fn() };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',   () => mockAuth);

const { GET } = await import('@/app/api/bot-runs/route');

const asReq = (url: string): any => ({ url });

beforeEach(() => {
  mockPrisma.botRun.findMany.mockReset();
  mockPrisma.botRunEntry.groupBy.mockReset();
  mockAuth.getAdminSession.mockReset();
});

describe('GET /api/bot-runs', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await GET(asReq('http://x/api/bot-runs'));
    expect(res.status).toBe(401);
    expect(mockPrisma.botRun.findMany).not.toHaveBeenCalled();
  });

  it('lists runs without filters when no orderId given', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.botRun.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/bot-runs'));
    expect(mockPrisma.botRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined, take: 50 }),
    );
  });

  it('filters by orderId when provided', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.botRun.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/bot-runs?orderId=ord_42'));
    expect(mockPrisma.botRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'ord_42' } }),
    );
  });

  it('clamps limit to 200 to prevent abuse', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.botRun.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/bot-runs?limit=99999'));
    expect(mockPrisma.botRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('falls back to default limit=50 when limit is non-numeric', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.botRun.findMany.mockResolvedValue([]);
    await GET(asReq('http://x/api/bot-runs?limit=banana'));
    expect(mockPrisma.botRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('aggregates per-source counts correctly', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.botRun.findMany.mockResolvedValue([
      {
        id: 'run_1',
        orderId: 'ord_1',
        country: 'INDIA',
        status: 'completed',
        startedAt: new Date('2026-04-01T00:00:00Z'),
        finishedAt: new Date('2026-04-01T00:05:00Z'),
        errorMsg: null,
        _count: { entries: 10 },
      },
    ]);
    mockPrisma.botRunEntry.groupBy.mockResolvedValue([
      // ok: success + schema/hardcoded/default (non-special) source
      { source: 'default', success: true,  _count: { _all: 4 } },
      // admin bucket: success + admin source
      { source: 'admin',   success: true,  _count: { _all: 2 } },
      // manual: success + manual
      { source: 'manual',  success: true,  _count: { _all: 1 } },
      // skipped: success + skip
      { source: 'skip',    success: true,  _count: { _all: 2 } },
      // failed: !success regardless of source
      { source: 'default', success: false, _count: { _all: 1 } },
    ]);

    const res = await GET(asReq('http://x/api/bot-runs'));
    const body = await res.json();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].counts).toEqual({
      ok: 4,
      admin: 2,
      manual: 1,
      skipped: 2,
      failed: 1,
    });
    expect(body.runs[0].entryCount).toBe(10);
  });

  it('returns 500 on db error', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.botRun.findMany.mockRejectedValue(new Error('boom'));
    const res = await GET(asReq('http://x/api/bot-runs'));
    expect(res.status).toBe(500);
  });
});
