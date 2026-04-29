/**
 * Tests for /api/orders/notify — admin-only endpoint that sends one or more
 * templated emails to the order's customer and records them in emailHistory.
 *
 * Focus: input validation, single-vs-batch types, custom template lookup,
 * history accumulation, and that sendEmail is called with the right address.
 *
 * We mock @/lib/email/send + @/lib/email/templates so no real email is sent
 * and we can assert on (recipient, payload).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockPrisma } from '../helpers/mockPrisma';
import { makeOrder } from '../helpers/fixtures';

const mockPrisma = makeMockPrisma();

const mockAuth = {
  requireAdmin:    vi.fn(),
  isErrorResponse: vi.fn((x: any) => x && typeof x === 'object' && 'status' in x && !('email' in x)),
};

const mockSend = { sendEmail: vi.fn().mockResolvedValue(undefined) };

// The route imports named templates from @/lib/email/templates — return
// simple stubs so we can assert on what got passed.
const mockTemplates = {
  orderConfirmationEmail:    vi.fn(() => ({ subject: 'Confirmed', html: '<p>c</p>' })),
  correctionNeededEmail:     vi.fn(() => ({ subject: 'Correction', html: '<p>x</p>' })),
  evisaReadyEmail:           vi.fn(() => ({ subject: 'Evisa',     html: '<p>e</p>' })),
  statusUpdateEmail:         vi.fn(() => ({ subject: 'Status',    html: '<p>s</p>' })),
  finishReminderEmail:       vi.fn(() => ({ subject: 'Reminder',  html: '<p>r</p>' })),
  applicationSubmittedEmail: vi.fn(() => ({ subject: 'Submitted', html: '<p>sub</p>' })),
  autoClosedEmail:           vi.fn(() => ({ subject: 'Closed',    html: '<p>cl</p>' })),
};

vi.mock('@/lib/prisma',          () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth',            () => mockAuth);
vi.mock('@/lib/email/send',      () => mockSend);
vi.mock('@/lib/email/templates', () => mockTemplates);

const { POST } = await import('@/app/api/orders/notify/route');

const asReq = (body: any): any => ({ json: async () => body });

beforeEach(() => {
  mockPrisma.order.findUnique.mockReset();
  mockPrisma.order.update.mockReset().mockResolvedValue({});
  mockPrisma.customEmailTemplate.findUnique.mockReset();
  mockPrisma.customEmailTemplate.findFirst.mockReset();
  mockAuth.requireAdmin.mockReset();
  mockSend.sendEmail.mockReset().mockResolvedValue(undefined);
  Object.values(mockTemplates).forEach(fn => fn.mockClear());
});

function adminOk() {
  mockAuth.requireAdmin.mockResolvedValue({ name: 'Admin', email: 'admin@v.com' });
}

describe('POST /api/orders/notify — auth + validation', () => {
  it('passes through the 401 from requireAdmin', async () => {
    const err = { status: 401 } as any;
    mockAuth.requireAdmin.mockResolvedValue(err);
    const res = await POST(asReq({ orderId: 'x', type: 'confirmation' }));
    expect(res).toBe(err);
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('rejects missing orderId with 400', async () => {
    adminOk();
    const res = await POST(asReq({ type: 'confirmation' }));
    expect(res.status).toBe(400);
  });

  it('rejects when neither type nor types is given', async () => {
    adminOk();
    const res = await POST(asReq({ orderId: 'x' }));
    expect(res.status).toBe(400);
  });

  it('rejects when types is an empty array', async () => {
    adminOk();
    const res = await POST(asReq({ orderId: 'x', types: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the order is missing', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const res = await POST(asReq({ orderId: 'x', type: 'confirmation' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/orders/notify — recipient resolution', () => {
  it('sends to traveler[0].email when available', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({
        billingEmail: 'billing@v.com',
        travelers: JSON.stringify([{ firstName: 'J', lastName: 'D', email: 'traveler@v.com' }]),
      }),
    );
    await POST(asReq({ orderId: 'x', type: 'confirmation' }));
    expect(mockSend.sendEmail).toHaveBeenCalledWith('traveler@v.com', expect.anything());
  });

  it('falls back to billingEmail when traveler json is bad', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({ billingEmail: 'billing@v.com', travelers: '{{not json' }),
    );
    await POST(asReq({ orderId: 'x', type: 'confirmation' }));
    expect(mockSend.sendEmail).toHaveBeenCalledWith('billing@v.com', expect.anything());
  });

  it('passes full "First Last" name into the template', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({
        travelers: JSON.stringify([{ firstName: 'Jane', lastName: 'Doe', email: 't@v.com' }]),
      }),
    );
    await POST(asReq({ orderId: 'x', type: 'confirmation' }));
    const tplArg = mockTemplates.orderConfirmationEmail.mock.calls[0][0];
    expect(tplArg.name).toBe('Jane Doe');
  });
});

describe('POST /api/orders/notify — template dispatch', () => {
  it('routes type=confirmation to orderConfirmationEmail', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    await POST(asReq({ orderId: 'x', type: 'confirmation' }));
    expect(mockTemplates.orderConfirmationEmail).toHaveBeenCalledTimes(1);
  });

  it('routes type=correction and parses flaggedFields', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(
      makeOrder({
        flaggedFields: JSON.stringify(['firstName', 'passportNumber']),
        specialistNotes: 'Please fix photo',
      }),
    );
    await POST(asReq({ orderId: 'x', type: 'correction' }));
    const arg = mockTemplates.correctionNeededEmail.mock.calls[0][0];
    expect(arg.flaggedFields).toEqual(['firstName', 'passportNumber']);
    expect(arg.specialistNotes).toBe('Please fix photo');
  });

  it('refuses type=submitted without an applicationId', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ applicationId: null }));
    const res = await POST(asReq({ orderId: 'x', type: 'submitted' }));
    const body = await res.json();
    expect(body.results[0].sent).toBe(false);
    expect(body.results[0].error).toMatch(/Application ID/i);
    expect(mockTemplates.applicationSubmittedEmail).not.toHaveBeenCalled();
  });

  it('sends batch types in one request', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    const res = await POST(asReq({ orderId: 'x', types: ['confirmation', 'reminder'] }));
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results.every((r: any) => r.sent)).toBe(true);
    expect(mockSend.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('records each successful send in emailHistory', async () => {
    adminOk();
    const order = makeOrder({ emailHistory: JSON.stringify({ reminder: '2026-01-01T00:00:00.000Z' }) });
    mockPrisma.order.findUnique.mockResolvedValue(order);
    await POST(asReq({ orderId: order.id, type: 'confirmation' }));

    const update = mockPrisma.order.update.mock.calls[0][0];
    const history = JSON.parse(update.data.emailHistory);
    expect(history.reminder).toBe('2026-01-01T00:00:00.000Z'); // preserved
    expect(history.confirmation).toMatch(/^\d{4}-\d{2}-\d{2}T/);  // new timestamp
  });

  it('captures sendEmail failures per-type without aborting the batch', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockSend.sendEmail
      .mockRejectedValueOnce(new Error('SMTP refused'))
      .mockResolvedValueOnce(undefined);

    const res = await POST(asReq({ orderId: 'x', types: ['confirmation', 'reminder'] }));
    const body = await res.json();
    expect(body.results[0]).toEqual({
      type: 'confirmation',
      sent: false,
      error: 'SMTP refused',
    });
    expect(body.results[1]).toEqual({ type: 'reminder', sent: true });
  });
});

describe('POST /api/orders/notify — custom templates', () => {
  it('reports "Unknown email type" when no custom template matches a bare code', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.customEmailTemplate.findFirst.mockResolvedValue(null);
    const res = await POST(asReq({ orderId: 'x', type: 'promo_special' }));
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ sent: false, error: 'Unknown email type' });
  });

  it('looks up custom:<id> templates by id', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.customEmailTemplate.findUnique.mockResolvedValue({
      id: 'tpl_1',
      code: 'promo',
      enabled: true,
      subject: 'Hi {name}',
      html: '<p>Hello {name}, order #{orderNumber}</p>',
      structured: null,
    });

    await POST(asReq({ orderId: 'x', type: 'custom:tpl_1' }));
    expect(mockPrisma.customEmailTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: 'tpl_1' },
    });
    const sent = mockSend.sendEmail.mock.calls[0][1];
    expect(sent.subject).toMatch(/Hi /);
    expect(sent.html).toContain('order #');
  });

  it('refuses to send disabled custom templates', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.customEmailTemplate.findFirst.mockResolvedValue({
      id: 'tpl_2',
      code: 'promo',
      enabled: false,
      subject: 'x',
      html: '<p>x</p>',
      structured: null,
    });
    const res = await POST(asReq({ orderId: 'x', type: 'promo' }));
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ sent: false, error: 'Template is disabled' });
    expect(mockSend.sendEmail).not.toHaveBeenCalled();
  });

  it('renders a structured custom template', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.customEmailTemplate.findFirst.mockResolvedValue({
      id: 'tpl_3',
      code: 'welcome',
      enabled: true,
      subject: 'Welcome {name}',
      html: null,
      structured: JSON.stringify({ heading: 'Hi {name}' }),
    });
    await POST(asReq({ orderId: 'x', type: 'welcome' }));
    const sent = mockSend.sendEmail.mock.calls[0][1];
    expect(sent.html).toContain('<!DOCTYPE html>');
    expect(sent.html).toContain('Hi ');
  });

  it('reports a parse error for malformed structured templates', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.customEmailTemplate.findFirst.mockResolvedValue({
      id: 'tpl_4',
      code: 'broken',
      enabled: true,
      subject: 'x',
      html: null,
      structured: '{{{not json',
    });
    const res = await POST(asReq({ orderId: 'x', type: 'broken' }));
    const body = await res.json();
    expect(body.results[0].sent).toBe(false);
    expect(body.results[0].error).toMatch(/Invalid template/i);
  });

  it('reports templates with no body', async () => {
    adminOk();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.customEmailTemplate.findFirst.mockResolvedValue({
      id: 'tpl_5',
      code: 'empty',
      enabled: true,
      subject: 'x',
      html: null,
      structured: null,
    });
    const res = await POST(asReq({ orderId: 'x', type: 'empty' }));
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ sent: false, error: 'Template has no body' });
  });
});
