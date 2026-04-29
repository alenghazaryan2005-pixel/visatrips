/**
 * Tests for /api/cron/daily — unified daily maintenance endpoint.
 *
 * Three jobs covered:
 *   1. Reminder emails to abandoned applications (every 2 days, up to 3)
 *   2. Hard-delete abandoned apps older than 7 days
 *   3. Archive completed orders older than 30 days
 *
 * All DB + email side effects are mocked so the tests are pure logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
const mockAuth = { getAdminSession: vi.fn() };
const mockSend = { sendEmail: vi.fn().mockResolvedValue(undefined) };
const mockTemplates = {
  abandonedReminderEmail: vi.fn(() => ({ subject: 'r', html: '<p>r</p>' })),
};
const mockErrorLog = { logError: vi.fn().mockResolvedValue(undefined) };

vi.mock('@/lib/prisma',        () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',          () => mockAuth);
vi.mock('@/lib/email/send',    () => mockSend);
vi.mock('@/lib/email/templates', () => mockTemplates);
vi.mock('@/lib/error-log',     () => mockErrorLog);

const { GET, POST } = await import('@/app/api/cron/daily/route');

function asReq(opts: { headers?: Record<string, string> } = {}): any {
  return {
    headers: {
      get: (k: string) => opts.headers?.[k.toLowerCase()] ?? null,
    },
  };
}

const CRON_SECRET = 'test-cron-secret';

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  Object.values(mockPrisma).forEach((model: any) =>
    Object.values(model).forEach((fn: any) => fn.mockReset?.()),
  );
  mockAuth.getAdminSession.mockReset();
  mockSend.sendEmail.mockReset().mockResolvedValue(undefined);
  Object.values(mockTemplates).forEach(fn => fn.mockClear());
  mockErrorLog.logError.mockClear();

  // Default: nothing to do — specs override as needed.
  mockPrisma.abandonedApplication.findMany.mockResolvedValue([]);
  mockPrisma.abandonedApplication.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });
});

describe('POST /api/cron/daily — auth', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await POST(asReq());
    expect(res.status).toBe(401);
  });

  it('accepts Bearer CRON_SECRET', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    expect(res.status).toBe(200);
  });

  it('accepts an authenticated admin session', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    const res = await POST(asReq());
    expect(res.status).toBe(200);
  });

  it('rejects a Bearer token that does not match', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await POST(asReq({ headers: { authorization: 'Bearer nope' } }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/cron/daily — dry-run for admin, real run for cron', () => {
  it('admin session → returns dry-run counts and never writes', async () => {
    mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: '' });
    mockPrisma.abandonedApplication.count.mockResolvedValueOnce(2);
    mockPrisma.abandonedApplication.count.mockResolvedValueOnce(1);
    mockPrisma.order.count.mockResolvedValue(3);

    const res = await GET(asReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ dryRun: true, pendingReminders: 2, pendingPurge: 1, pendingArchive: 3 });
    // No destructive calls
    expect(mockPrisma.abandonedApplication.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    expect(mockSend.sendEmail).not.toHaveBeenCalled();
  });

  it('cron bearer → runs the real jobs', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await GET(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    expect(res.status).toBe(200);
    // deleteMany + updateMany were called as part of the real job
    expect(mockPrisma.abandonedApplication.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('anonymous GET → 401 (dry run is admin-only)', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await GET(asReq());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/cron/daily — reminder job', () => {
  beforeEach(() => {
    mockAuth.getAdminSession.mockResolvedValue(null);
  });

  it('sends emails and bumps reminderCount + lastReminderAt per candidate', async () => {
    const travelers = JSON.stringify([{ firstName: 'Ada' }]);
    mockPrisma.abandonedApplication.findMany.mockResolvedValue([
      { id: 'a1', email: 'ada@example.com', destination: 'India', travelers, reminderCount: 0 },
      { id: 'a2', email: 'grace@example.com', destination: null,   travelers: null,   reminderCount: 2 },
    ]);

    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.remindersSent).toBe(2);

    expect(mockSend.sendEmail).toHaveBeenCalledWith('ada@example.com', expect.anything());
    expect(mockSend.sendEmail).toHaveBeenCalledWith('grace@example.com', expect.anything());

    // First caller: reminderCount went 0 → 1
    expect(mockPrisma.abandonedApplication.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: expect.objectContaining({ reminderCount: 1, lastReminderAt: expect.any(Date) }),
    });
    // Second caller: reminderCount went 2 → 3
    expect(mockPrisma.abandonedApplication.update).toHaveBeenCalledWith({
      where: { id: 'a2' },
      data: expect.objectContaining({ reminderCount: 3, lastReminderAt: expect.any(Date) }),
    });

    // Template receives firstName, destination, reminderIndex
    expect(mockTemplates.abandonedReminderEmail).toHaveBeenCalledWith({
      name: 'Ada', destination: 'India', reminderIndex: 1,
    });
  });

  it('defaults name to "there" when no firstName available', async () => {
    mockPrisma.abandonedApplication.findMany.mockResolvedValue([
      { id: 'a1', email: 'x@v.com', destination: null, travelers: null, reminderCount: 0 },
    ]);

    await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    expect(mockTemplates.abandonedReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'there' }),
    );
  });

  it('captures per-candidate errors without failing the whole run', async () => {
    mockPrisma.abandonedApplication.findMany.mockResolvedValue([
      { id: 'a1', email: 'bad@v.com',  destination: null, travelers: null, reminderCount: 0 },
      { id: 'a2', email: 'good@v.com', destination: null, travelers: null, reminderCount: 0 },
    ]);
    mockSend.sendEmail.mockImplementationOnce(() => { throw new Error('SMTP refused'); });

    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.remindersSent).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/a1: SMTP refused/);
  });

  it('returns 0 when the candidate list is empty', async () => {
    mockPrisma.abandonedApplication.findMany.mockResolvedValue([]);
    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.remindersSent).toBe(0);
    expect(mockSend.sendEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/daily — purge job', () => {
  beforeEach(() => {
    mockAuth.getAdminSession.mockResolvedValue(null);
  });

  it('hard-deletes abandoned apps older than 7 days', async () => {
    mockPrisma.abandonedApplication.deleteMany.mockResolvedValue({ count: 4 });
    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.abandonedDeleted).toBe(4);

    const whereArg = mockPrisma.abandonedApplication.deleteMany.mock.calls[0][0];
    expect(whereArg.where.createdAt.lte).toBeInstanceOf(Date);
    // Cutoff is ~7 days ago — allow a loose range.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = (whereArg.where.createdAt.lte as Date).getTime();
    expect(now - cutoff).toBeGreaterThan(sevenDaysMs - 1000);
    expect(now - cutoff).toBeLessThan(sevenDaysMs + 5000);
  });

  it('reports errors from purge but keeps running archive', async () => {
    mockPrisma.abandonedApplication.deleteMany.mockRejectedValue(new Error('constraint'));
    mockPrisma.order.updateMany.mockResolvedValue({ count: 7 });

    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.abandonedDeleted).toBe(0);
    expect(body.errors.some((e: string) => /purge/i.test(e))).toBe(true);
    expect(body.ordersArchived).toBe(7); // archive ran despite purge error
  });
});

describe('POST /api/cron/daily — archive job', () => {
  beforeEach(() => {
    mockAuth.getAdminSession.mockResolvedValue(null);
  });

  it('sets archivedAt=now on Completed orders older than 30 days', async () => {
    mockPrisma.order.updateMany.mockResolvedValue({ count: 3 });
    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.ordersArchived).toBe(3);

    const call = mockPrisma.order.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe('COMPLETED');
    expect(call.where.archivedAt).toBeNull();
    expect(call.where.completedAt.lte).toBeInstanceOf(Date);
    expect(call.data.archivedAt).toBeInstanceOf(Date);

    // Cutoff ~30 days ago
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = (call.where.completedAt.lte as Date).getTime();
    expect(now - cutoff).toBeGreaterThan(thirtyDaysMs - 1000);
    expect(now - cutoff).toBeLessThan(thirtyDaysMs + 5000);
  });

  it('ignores orders with non-COMPLETED status', async () => {
    await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const call = mockPrisma.order.updateMany.mock.calls[0][0];
    // Filter is explicit about COMPLETED + non-null completedAt + null archivedAt
    expect(call.where.status).toBe('COMPLETED');
    expect(call.where.completedAt.not).toBeNull();
    expect(call.where.archivedAt).toBeNull();
  });

  it('reports errors from archive without affecting other jobs', async () => {
    mockPrisma.order.updateMany.mockRejectedValue(new Error('deadlock'));
    mockPrisma.abandonedApplication.deleteMany.mockResolvedValue({ count: 2 });

    const res = await POST(asReq({ headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    const body = await res.json();
    expect(body.ordersArchived).toBe(0);
    expect(body.abandonedDeleted).toBe(2);
    expect(body.errors.some((e: string) => /archive/i.test(e))).toBe(true);
  });
});
