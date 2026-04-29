/**
 * Tests for POST /api/orders/[id]/upgrade-speed.
 *
 * Focus:
 *   - auth (admin OR order owner can upgrade)
 *   - validation (target must be a known speed; must be an upgrade)
 *   - status gate (customer can't upgrade after SUBMITTED; admin can)
 *   - price math via computeUpgradeDiff (traveler count + live surcharges)
 *   - persisted side effects (processingSpeed, totalUSD, lastEditedBy)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma, type MockPrisma } from '../helpers/mockPrisma';
import { makeOrder } from '../helpers/fixtures';

const mockPrisma = makeMockPrisma();
const mockAuth = {
  getAdminSession:    vi.fn(),
  getCustomerSession: vi.fn(),
};
const mockSettings = {
  getAllSettings: vi.fn().mockResolvedValue({}),
};

vi.mock('@/lib/prisma',   () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',     () => mockAuth);
vi.mock('@/lib/settings', () => mockSettings);

const { POST } = await import('@/app/api/orders/[id]/upgrade-speed/route');

const params = (id: string) => ({ params: Promise.resolve({ id }) });
function asReq(body: any): any { return { json: async () => body }; }

function reset(p: MockPrisma) {
  Object.values(p).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset?.()));
  mockAuth.getAdminSession.mockReset();
  mockAuth.getCustomerSession.mockReset();
  mockSettings.getAllSettings.mockReset().mockResolvedValue({});
}

const SOLO_TRAVELER = JSON.stringify([{ firstName: 'A', email: 'owner@v.com' }]);

describe('POST /api/orders/[id]/upgrade-speed — auth + validation', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns 404 when order not found', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('99999'));
    expect(res.status).toBe(404);
  });

  it('returns 401 when neither admin nor owner', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ billingEmail: 'x@y.com', travelers: SOLO_TRAVELER }));
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'attacker@evil.com' });
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(401);
  });

  it('rejects unknown targetSpeed with 400', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ travelers: SOLO_TRAVELER }));
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    const res = await POST(asReq({ targetSpeed: 'lightspeed' }), params('00042'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/targetSpeed/);
  });

  it('rejects same-speed (no-op upgrade) with 400', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ processingSpeed: 'rush', travelers: SOLO_TRAVELER }));
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(400);
  });

  it('rejects downgrades with 400', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder({ processingSpeed: 'super', travelers: SOLO_TRAVELER }));
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/downgrade/i);
  });
});

describe('POST /api/orders/[id]/upgrade-speed — status gating', () => {
  beforeEach(() => reset(mockPrisma));

  it('customer CAN upgrade on SUBMITTED — admin team takes over follow-up', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: SOLO_TRAVELER,
      processingSpeed: 'standard', status: 'SUBMITTED', totalUSD: 100,
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'owner@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(200);
  });

  it('blocks customer upgrade on terminal statuses like COMPLETED', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: SOLO_TRAVELER,
      processingSpeed: 'standard', status: 'COMPLETED',
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'owner@v.com' });
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no longer be upgraded/i);
  });

  it('admin CAN bypass the status gate on terminal statuses (goodwill)', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: SOLO_TRAVELER,
      processingSpeed: 'standard', status: 'COMPLETED', totalUSD: 100,
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(200);
  });

  it('customer can upgrade on PROCESSING', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: SOLO_TRAVELER,
      processingSpeed: 'standard', status: 'PROCESSING', totalUSD: 100,
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'owner@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));
    const res = await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/orders/[id]/upgrade-speed — pricing + persistence', () => {
  beforeEach(() => reset(mockPrisma));

  it('charges per-traveler surcharge diff using live settings (3 travelers, std → super)', async () => {
    const travelersJson = JSON.stringify([
      { firstName: 'A' }, { firstName: 'B' }, { firstName: 'C' },
    ]);
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: travelersJson,
      processingSpeed: 'standard', status: 'PROCESSING', totalUSD: 100,
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockSettings.getAllSettings.mockResolvedValue({
      'pricing.processing.standard': 0,
      'pricing.processing.rush':     20,
      'pricing.processing.super':    60,
      'pricing.fees.transactionPercent': 8,
    });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const res = await POST(asReq({ targetSpeed: 'super' }), params('00042'));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.upgrade.travelers).toBe(3);
    expect(out.upgrade.perTravelerDiff).toBe(60);
    expect(out.upgrade.subtotalDiff).toBe(180);
    expect(out.upgrade.txDiff).toBeCloseTo(14.4, 2);
    expect(out.upgrade.total).toBeCloseTo(194.4, 2);

    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.processingSpeed).toBe('super');
    expect(data.totalUSD).toBeCloseTo(100 + 194.4, 2);
    expect(data.lastEditedBy).toBe('Alice');
  });

  it('only charges the delta when stepping rush → super (not full super price)', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: SOLO_TRAVELER,
      processingSpeed: 'rush', status: 'PROCESSING', totalUSD: 121.60,
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockSettings.getAllSettings.mockResolvedValue({
      'pricing.processing.standard': 0,
      'pricing.processing.rush':     20,
      'pricing.processing.super':    60,
      'pricing.fees.transactionPercent': 8,
    });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const res = await POST(asReq({ targetSpeed: 'super' }), params('00042'));
    const out = await res.json();
    expect(out.upgrade.perTravelerDiff).toBe(40); // 60 - 20, not 60
    expect(out.upgrade.total).toBeCloseTo(43.2, 2); // 40 * 1.08
  });

  it('stamps lastEditedBy with customer email when customer initiates', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com', travelers: SOLO_TRAVELER,
      processingSpeed: 'standard', status: 'PROCESSING', totalUSD: 100,
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'owner@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));
    await POST(asReq({ targetSpeed: 'rush' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.lastEditedBy).toMatch(/Customer.*owner@v\.com/);
  });
});
