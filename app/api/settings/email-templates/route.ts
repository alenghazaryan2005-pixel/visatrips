import { NextResponse } from 'next/server';
import { requireOwner, isErrorResponse } from '@/lib/auth';
import {
  orderConfirmationEmail,
  correctionNeededEmail,
  evisaReadyEmail,
  statusUpdateEmail,
  finishReminderEmail,
  applicationSubmittedEmail,
  autoClosedEmail,
} from '@/lib/email/templates';
import { STRUCTURED_DEFAULTS, renderStructured, interpolate } from '@/lib/email/renderer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sample data used to render each template preview
const SAMPLE = {
  name: 'Alex Customer',
  orderNumber: '00042',
  destination: 'India',
  visaType: 'Tourist – 30 days',
  total: 51.25,
  travelers: 1,
  specialistNotes: 'Your passport photo needs to be re-uploaded — the current one is too small (must be at least 10 KB).',
  flaggedFields: ['photoUrl', 'passportExpiry'],
  applicationId: 'I032V04C6B26',
  status: 'PROCESSING',
  pin: '423817',
};

/**
 * Render a structured template (from STRUCTURED_DEFAULTS) to { subject, html }
 * using sample vars — for templates that don't have a dedicated template fn.
 */
function renderStructuredSample(code: string, vars: Record<string, any>) {
  const def = STRUCTURED_DEFAULTS[code];
  if (!def) return { subject: '', html: '' };
  return {
    subject: interpolate(def.subject, vars),
    html: renderStructured(def.structured, vars),
  };
}

/**
 * GET /api/settings/email-templates
 * Returns every built-in template rendered with sample data, so admins can see
 * exactly what's being sent and what to customize.
 */
export async function GET() {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;

  const templates = [
    {
      code: 'confirmation',
      label: 'Order Confirmation / Receipt',
      description: 'Auto-sent immediately after payment.',
      trigger: 'Sent automatically when a customer completes checkout.',
      sample: orderConfirmationEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
        destination: SAMPLE.destination,
        visaType: SAMPLE.visaType,
        total: SAMPLE.total,
        travelers: SAMPLE.travelers,
      }),
    },
    {
      code: 'reminder',
      label: 'Finish Application Reminder',
      description: 'Nudges the customer to complete their unfinished application.',
      trigger: 'Sent every 2 days by the reminder cron, max 3 times per order.',
      sample: finishReminderEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
      }),
    },
    {
      code: 'correction',
      label: 'Correction Needed',
      description: 'Tells the customer which fields to fix.',
      trigger: 'Manually sent when admin checks "Correction Needed" in the Email Customer panel.',
      sample: correctionNeededEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
        specialistNotes: SAMPLE.specialistNotes,
        flaggedFields: SAMPLE.flaggedFields,
      }),
    },
    {
      code: 'submitted',
      label: 'Application Submitted',
      description: 'Confirms the application was submitted to the Indian government.',
      trigger: 'Manually sent after the bot captures the Application ID from the gov site.',
      sample: applicationSubmittedEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
        applicationId: SAMPLE.applicationId,
        destination: SAMPLE.destination,
      }),
    },
    {
      code: 'status',
      label: 'Status Update',
      description: 'Generic status change notification.',
      trigger: 'Manually sent when admin wants to inform the customer of a status change.',
      sample: statusUpdateEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
        status: SAMPLE.status,
      }),
    },
    {
      code: 'evisa',
      label: 'eVisa Ready',
      description: 'Notifies the customer their eVisa is approved and ready to download.',
      trigger: 'Manually sent after admin uploads the final eVisa PDF to the order.',
      sample: evisaReadyEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
        destination: SAMPLE.destination,
      }),
    },
    {
      code: 'autoClosed',
      label: 'Order Auto-Closed',
      description: 'Courtesy notice that the order was auto-closed after 3 unanswered reminders.',
      trigger: 'Sent automatically when the reminder cron hits the 3-reminder limit, OR manually by admin.',
      sample: autoClosedEmail({
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
      }),
    },
    {
      code: 'welcome',
      label: 'Welcome Email (First Order + PIN)',
      description: 'Combined first-order confirmation + the customer\'s new account PIN.',
      trigger: 'Sent automatically on a customer\'s FIRST order (when no PIN exists for their email yet).',
      sample: renderStructuredSample('welcome', {
        name: SAMPLE.name,
        orderNumber: SAMPLE.orderNumber,
        destination: SAMPLE.destination,
        visaType: SAMPLE.visaType,
        travelers: SAMPLE.travelers,
        total: SAMPLE.total,
        pin: SAMPLE.pin,
      }),
    },
    {
      code: 'pin',
      label: 'PIN Recovery',
      description: 'Sends the customer their 6-digit login PIN when they request recovery.',
      trigger: 'Sent automatically when a customer requests PIN recovery from the login page.',
      sample: renderStructuredSample('pin', { name: SAMPLE.name, pin: SAMPLE.pin }),
    },
  ];

  // Attach structured defaults for the Simple editor
  const enriched = templates.map(t => ({
    ...t,
    structuredDefault: STRUCTURED_DEFAULTS[t.code]?.structured,
    structuredSubjectDefault: STRUCTURED_DEFAULTS[t.code]?.subject,
  }));

  return NextResponse.json({ templates: enriched, sampleData: SAMPLE });
}
