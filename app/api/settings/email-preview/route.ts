import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { renderStructured, interpolate, StructuredEmail } from '@/lib/email/renderer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE = {
  name: 'Alex Customer',
  orderNumber: '00042',
  destination: 'India',
  visaType: 'Tourist – 30 days',
  total: 51.25,
  travelers: 1,
  specialistNotes: 'Your passport photo needs to be re-uploaded — the current one is too small (must be at least 10 KB).',
  applicationId: 'I032V04C6B26',
  status: 'Processing',
};

/**
 * POST /api/settings/email-preview
 * Renders a structured email with sample data — used by the Simple editor
 * to show a live preview as the admin types.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const structured = body.structured as StructuredEmail;
    const subject = body.subject || '';
    const html = renderStructured(structured, SAMPLE);
    return NextResponse.json({ subject: interpolate(subject, SAMPLE), html });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Preview failed' }, { status: 500 });
  }
}
