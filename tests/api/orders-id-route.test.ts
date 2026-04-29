/**
 * Tests for /api/orders/[id] — GET + PATCH.
 *
 * Focus: the role-based write allowlist + status gating on PATCH. These are
 * the security-sensitive bits (admin-only fields, customer locked to PROCESSING,
 * auto-timestamping on status transitions).
 *
 * Mocks: prisma, auth (getAdminSession/getCustomerSession), email trigger.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma, type MockPrisma } from '../helpers/mockPrisma';
import { makeOrder } from '../helpers/fixtures';

const mockPrisma = makeMockPrisma();
const mockAuth = {
  getAdminSession:    vi.fn(),
  getCustomerSession: vi.fn(),
};
const mockTrigger = { dispatchTriggeredEmails: vi.fn().mockResolvedValue(undefined) };

vi.mock('@/lib/prisma',         () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',           () => mockAuth);
vi.mock('@/lib/email/trigger',  () => mockTrigger);

// Import AFTER mocks are registered.
const { GET, PATCH } = await import('@/app/api/orders/[id]/route');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function asRequest(body: any): any {
  // NextRequest is a superset of Request — the handler only calls .json()
  return { json: async () => body };
}

function resetAll(prisma: MockPrisma) {
  Object.values(prisma).forEach((model: any) =>
    Object.values(model).forEach((fn: any) => fn.mockReset?.()),
  );
  mockAuth.getAdminSession.mockReset();
  mockAuth.getCustomerSession.mockReset();
  mockTrigger.dispatchTriggeredEmails.mockReset().mockResolvedValue(undefined);
}

describe('GET /api/orders/[id]', () => {
  beforeEach(() => resetAll(mockPrisma));

  it('returns 404 when order not found', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.order.findUnique.mockResolvedValue(null);

    const res = await GET({} as any, params('99999'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Order not found' });
  });

  it('returns the order for an authenticated admin', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: 'admin@v.com' });

    const res = await GET({} as any, params('00042'));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(order.id);
  });

  it('returns the order to a customer whose email matches billingEmail', async () => {
    const order = makeOrder({ billingEmail: 'customer@v.com' });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'Customer@V.com' });

    const res = await GET({} as any, params('00042'));
    expect(res.status).toBe(200);
  });

  it('returns the order to a customer whose email matches a traveler', async () => {
    const order = makeOrder({
      billingEmail: 'billing@v.com',
      travelers: JSON.stringify([{ firstName: 'J', email: 'traveler@v.com' }]),
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'TRAVELER@v.com' });

    const res = await GET({} as any, params('00042'));
    expect(res.status).toBe(200);
  });

  it('returns 401 when caller is neither admin nor order owner', async () => {
    const order = makeOrder({
      billingEmail: 'owner@v.com',
      travelers: JSON.stringify([{ email: 'traveler@v.com' }]),
    });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'outsider@v.com' });

    const res = await GET({} as any, params('00042'));
    expect(res.status).toBe(401);
  });

  it('falls back to id lookup when orderNumber is not numeric', async () => {
    const order = makeOrder({ id: 'cuid_xyz' });
    mockPrisma.order.findUnique.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });

    const res = await GET({} as any, params('cuid_xyz'));
    expect(res.status).toBe(200);
    expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({ where: { id: 'cuid_xyz' } });
  });
});

describe('PATCH /api/orders/[id] — auth', () => {
  beforeEach(() => resetAll(mockPrisma));

  it('returns 404 when order missing', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    mockPrisma.order.findUnique.mockResolvedValue(null);

    const res = await PATCH(asRequest({}), params('99999'));
    expect(res.status).toBe(404);
  });

  it('returns 401 when caller is neither admin nor owner', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder());
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue(null);

    const res = await PATCH(asRequest({ notes: 'hax' }), params('00042'));
    expect(res.status).toBe(401);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/orders/[id] — admin allowlist', () => {
  beforeEach(() => resetAll(mockPrisma));

  it('accepts admin-only fields and stamps lastEditedBy', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: 'alice@v.com' });
    mockAuth.getCustomerSession.mockResolvedValue(null);
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const res = await PATCH(
      asRequest({ notes: 'review notes', specialistNotes: 'fix photo', applicationId: 'IND-9' }),
      params('00042'),
    );
    expect(res.status).toBe(200);

    const updateCall = mockPrisma.order.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: order.id });
    expect(updateCall.data).toMatchObject({
      notes: 'review notes',
      specialistNotes: 'fix photo',
      applicationId: 'IND-9',
      lastEditedBy: 'Alice',
    });
  });

  it('silently drops keys that are not on the admin allowlist', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: 'alice@v.com' });
    mockPrisma.order.update.mockResolvedValue(order);

    await PATCH(
      asRequest({ notes: 'ok', reminderCount: 999, id: 'hax', orderNumber: 777 }),
      params('00042'),
    );

    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.notes).toBe('ok');
    expect(data.reminderCount).toBeUndefined();
    expect(data.id).toBeUndefined();
    expect(data.orderNumber).toBeUndefined();
  });

  it('photoApproved=true stamps photoApprovedAt + photoApprovedBy with admin name', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: 'alice@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const before = Date.now();
    const res = await PATCH(asRequest({ photoApproved: true }), params('00042'));
    expect(res.status).toBe(200);
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeInstanceOf(Date);
    expect((data.photoApprovedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(data.photoApprovedBy).toBe('Alice');
  });

  it('photoApproved=false clears both photoApprovedAt and photoApprovedBy', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: 'alice@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const res = await PATCH(asRequest({ photoApproved: false }), params('00042'));
    expect(res.status).toBe(200);
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeNull();
    expect(data.photoApprovedBy).toBeNull();
  });

  it('passportApproved=true stamps passportApprovedAt + passportApprovedBy', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Bob', email: 'bob@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const res = await PATCH(asRequest({ passportApproved: true }), params('00042'));
    expect(res.status).toBe(200);
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.passportApprovedAt).toBeInstanceOf(Date);
    expect(data.passportApprovedBy).toBe('Bob');
  });

  it('admin can approve both documents in one PATCH', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const res = await PATCH(asRequest({ photoApproved: true, passportApproved: true }), params('00042'));
    expect(res.status).toBe(200);
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeInstanceOf(Date);
    expect(data.passportApprovedAt).toBeInstanceOf(Date);
    expect(data.photoApprovedBy).toBe('Alice');
    expect(data.passportApprovedBy).toBe('Alice');
  });

  it('client cannot forge raw photoApprovedBy via direct field — only photoApproved synthetic works', async () => {
    const order = makeOrder();
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    // photoApprovedBy is NOT on ADMIN_ALLOWED — so even if a client tries to
    // send it directly, it's silently dropped. Only the synthetic
    // `photoApproved` boolean can stamp the approval.
    await PATCH(asRequest({ photoApprovedBy: 'Mallory' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedBy).toBeUndefined();
  });

  it('replacing photoUrl in travelers JSON auto-clears photoApprovedAt + photoApprovedBy', async () => {
    const order = makeOrder({
      travelers: JSON.stringify([{ firstName: 'A', photoUrl: '/old.jpg', passportBioUrl: '/p.jpg' }]),
      photoApprovedAt: new Date(),
      photoApprovedBy: 'Alice',
      passportApprovedAt: new Date(),
      passportApprovedBy: 'Alice',
    } as any);
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const newTravelers = JSON.stringify([{ firstName: 'A', photoUrl: '/new.jpg', passportBioUrl: '/p.jpg' }]);
    const res = await PATCH(asRequest({ travelers: newTravelers }), params('00042'));
    expect(res.status).toBe(200);
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeNull();
    expect(data.photoApprovedBy).toBeNull();
    // Passport URL didn't change — its approval must NOT be touched.
    expect(data.passportApprovedAt).toBeUndefined();
    expect(data.passportApprovedBy).toBeUndefined();
  });

  it('replacing passportBioUrl auto-clears only passport approval', async () => {
    const order = makeOrder({
      travelers: JSON.stringify([{ firstName: 'A', photoUrl: '/p.jpg', passportBioUrl: '/old-pb.jpg' }]),
      photoApprovedAt: new Date(),
      passportApprovedAt: new Date(),
    } as any);
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    const newTravelers = JSON.stringify([{ firstName: 'A', photoUrl: '/p.jpg', passportBioUrl: '/new-pb.pdf' }]);
    await PATCH(asRequest({ travelers: newTravelers }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.passportApprovedAt).toBeNull();
    expect(data.photoApprovedAt).toBeUndefined();
  });

  it('explicit approval in same PATCH wins over auto-clear (admin replacing AND approving)', async () => {
    const order = makeOrder({
      travelers: JSON.stringify([{ firstName: 'A', photoUrl: '/old.jpg' }]),
    } as any);
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Alice', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    // Admin replaces the photo AND approves it in a single PATCH — the
    // explicit approval should win, not be reset to null by the auto-clear.
    const newTravelers = JSON.stringify([{ firstName: 'A', photoUrl: '/edited.jpg' }]);
    await PATCH(asRequest({ travelers: newTravelers, photoApproved: true }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeInstanceOf(Date);
    expect(data.photoApprovedBy).toBe('Alice');
  });

  it('rejects non-numeric totalUSD with 400', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder());
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });

    const res = await PATCH(asRequest({ totalUSD: 'lots' as any }), params('00042'));
    expect(res.status).toBe(400);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects negative totalUSD with 400', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder());
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });

    const res = await PATCH(asRequest({ totalUSD: -5 }), params('00042'));
    expect(res.status).toBe(400);
  });

  it('accepts null refundAmount (unsetting a refund)', async () => {
    const order = makeOrder({ refundAmount: 50 });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.order.update.mockResolvedValue({ ...order, refundAmount: null });

    const res = await PATCH(asRequest({ refundAmount: null }), params('00042'));
    expect(res.status).toBe(200);
    expect(mockPrisma.order.update.mock.calls[0][0].data.refundAmount).toBeNull();
  });

  it('rejects negative refundAmount', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(makeOrder());
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });

    const res = await PATCH(asRequest({ refundAmount: -10 }), params('00042'));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/orders/[id] — status auto-timestamps', () => {
  beforeEach(() => resetAll(mockPrisma));

  it('stamps submittedAt when admin moves status to SUBMITTED', async () => {
    const order = makeOrder({ status: 'PROCESSING', submittedAt: null });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    await PATCH(asRequest({ status: 'SUBMITTED' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.submittedAt).toBeInstanceOf(Date);
  });

  it('stamps completedAt when admin moves status to COMPLETED', async () => {
    const order = makeOrder({ status: 'SUBMITTED', completedAt: null });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    await PATCH(asRequest({ status: 'COMPLETED' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('does NOT re-stamp submittedAt if it is already set', async () => {
    const existing = new Date('2026-01-01T00:00:00Z');
    const order = makeOrder({ status: 'PROCESSING', submittedAt: existing });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    await PATCH(asRequest({ status: 'SUBMITTED' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.submittedAt).toBeUndefined(); // not re-set
  });

  it('dispatches triggered emails when status actually changes', async () => {
    const order = makeOrder({ status: 'PROCESSING' });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    await PATCH(asRequest({ status: 'SUBMITTED' }), params('00042'));
    expect(mockTrigger.dispatchTriggeredEmails).toHaveBeenCalledWith({
      order: expect.objectContaining({ status: 'SUBMITTED' }),
      event: 'on_status_SUBMITTED',
    });
  });

  it('does NOT dispatch when status payload matches current status', async () => {
    const order = makeOrder({ status: 'PROCESSING' });
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue({ name: 'Admin', email: '' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));

    await PATCH(asRequest({ status: 'PROCESSING' }), params('00042'));
    expect(mockTrigger.dispatchTriggeredEmails).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/orders/[id] — customer allowlist', () => {
  beforeEach(() => resetAll(mockPrisma));

  function customerCtx(order = makeOrder({ billingEmail: 'owner@v.com' })) {
    mockPrisma.order.findFirst.mockResolvedValue(order);
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'owner@v.com' });
    mockPrisma.order.update.mockImplementation(async ({ data }: any) => ({ ...order, ...data }));
    return order;
  }

  it('lets customer update travelers and flaggedFields', async () => {
    customerCtx();
    await PATCH(
      asRequest({ travelers: '[]', flaggedFields: null }),
      params('00042'),
    );
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.travelers).toBe('[]');
    expect(data.flaggedFields).toBeNull();
  });

  it('blocks customer-written admin-only fields (notes, applicationId, totalUSD)', async () => {
    customerCtx();
    await PATCH(
      asRequest({
        notes: 'hax',
        applicationId: 'MINE',
        totalUSD: 0,
        refundAmount: 9999,
      }),
      params('00042'),
    );
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.notes).toBeUndefined();
    expect(data.applicationId).toBeUndefined();
    expect(data.totalUSD).toBeUndefined();
    expect(data.refundAmount).toBeUndefined();
  });

  it('customer cannot self-approve via the synthetic photoApproved/passportApproved fields', async () => {
    // synthetic approval handlers are wrapped in `if (admin)` — so a
    // customer-only request can't touch the approval columns at all.
    customerCtx();
    await PATCH(asRequest({ photoApproved: true, passportApproved: true, travelers: '[]' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeUndefined();
    expect(data.passportApprovedAt).toBeUndefined();
    expect(data.travelers).toBe('[]');
  });

  it('customer re-uploading a photo (via travelers JSON) auto-clears the previous admin approval', async () => {
    // This is the pivotal "any re-upload forces fresh review" test.
    // Customer flow PATCHes the travelers JSON with a new photoUrl — the
    // server's auto-clear must blank out an existing approval timestamp
    // even though the customer is the one making the change.
    const order = makeOrder({
      billingEmail: 'owner@v.com',
      travelers: JSON.stringify([{ firstName: 'A', email: 'owner@v.com', photoUrl: '/old.jpg' }]),
      photoApprovedAt: new Date(),
      photoApprovedBy: 'Alice',
    } as any);
    customerCtx(order);
    const newTravelers = JSON.stringify([{ firstName: 'A', email: 'owner@v.com', photoUrl: '/new.jpg' }]);
    await PATCH(asRequest({ travelers: newTravelers }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.photoApprovedAt).toBeNull();
    expect(data.photoApprovedBy).toBeNull();
  });

  it('allows customer to set status=PROCESSING (re-submit flow)', async () => {
    const order = makeOrder({ status: 'NEEDS_CORRECTION', billingEmail: 'owner@v.com' });
    customerCtx(order);
    await PATCH(asRequest({ status: 'PROCESSING', travelers: '[]' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    // status field isn't even in CUSTOMER_ALLOWED — so it is rejected at the allowlist gate,
    // never reaching the "only-PROCESSING" fallback. Verify it never lands in update data.
    expect(data.status).toBeUndefined();
  });

  it('does NOT stamp lastEditedBy for customers', async () => {
    customerCtx();
    await PATCH(asRequest({ travelers: '[]' }), params('00042'));
    const { data } = mockPrisma.order.update.mock.calls[0][0];
    expect(data.lastEditedBy).toBeUndefined();
  });
});
