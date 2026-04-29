/**
 * Minimal order fixture — just enough fields for the routes under test.
 * Tests spread over this to override specific fields.
 */
export function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'ord_cuid_1',
    orderNumber: 42,
    createdAt: new Date('2026-04-01T12:00:00Z'),
    updatedAt: new Date('2026-04-01T12:00:00Z'),
    destination: 'India',
    visaType: 'TOURIST_30',
    totalUSD: 79,
    status: 'PROCESSING',
    notes: null,
    travelers: JSON.stringify([
      { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    ]),
    billingEmail: 'billing@example.com',
    cardLast4: '4242',
    processingSpeed: 'standard',
    lastEditedBy: null,
    applicationId: null,
    evisaUrl: null,
    flaggedFields: null,
    specialistNotes: null,
    botFlags: null,
    refundAmount: null,
    refundReason: null,
    refundedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    completedAt: null,
    submittedAt: null,
    emailHistory: null,
    ...overrides,
  };
}
