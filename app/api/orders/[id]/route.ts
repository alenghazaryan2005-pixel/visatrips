import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseOrderNumber } from '@/lib/constants';
import { getAdminSession, getCustomerSession } from '@/lib/auth';
import { dispatchTriggeredEmails } from '@/lib/email/trigger';

async function findOrder(idOrNumber: string) {
  const parsed = parseOrderNumber(idOrNumber);
  if (!isNaN(parsed) && parsed > 0) {
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed } });
    if (order) return order;
  }
  return prisma.order.findUnique({ where: { id: idOrNumber } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Check auth — admin can see any order, customer can see their own
    const admin = await getAdminSession();
    if (admin) return NextResponse.json(order);

    const customer = await getCustomerSession();
    if (customer) {
      // Check if customer's email matches billing email or any traveler email
      const customerEmail = customer.email.toLowerCase();
      if (order.billingEmail.toLowerCase() === customerEmail) return NextResponse.json(order);
      try {
        const travelers = JSON.parse(order.travelers);
        if (travelers.some((t: any) => t.email?.toLowerCase() === customerEmail)) return NextResponse.json(order);
      } catch {}
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

// Fields customers are allowed to update
const CUSTOMER_ALLOWED = ['travelers', 'flaggedFields'];
// Fields only admins can update directly. Note: photo/passport approval
// columns are NOT in this list — clients use the synthetic body fields
// `photoApproved` / `passportApproved` (Boolean) which the server translates
// into stamping {ApprovedAt: now, ApprovedBy: admin.name} or clearing both.
const ADMIN_ALLOWED = ['status', 'notes', 'destination', 'visaType', 'totalUSD', 'billingEmail', 'cardLast4', 'processingSpeed', 'travelers', 'applicationId', 'evisaUrl', 'flaggedFields', 'specialistNotes', 'refundAmount', 'refundReason', 'refundedAt', 'botFlags', 'archivedAt', 'tags'];

/**
 * Diff incoming travelers JSON vs the stored one and return the set of
 * URL fields whose value changed. Used to auto-clear the matching approval
 * stamp — re-uploading a doc must always force a fresh admin review.
 */
function detectChangedDocs(prevJson: string, nextJson: string): Set<'photo' | 'passport'> {
  const changed = new Set<'photo' | 'passport'>();
  let prev: any[] = [];
  let next: any[] = [];
  try { prev = JSON.parse(prevJson); } catch {}
  try { next = JSON.parse(nextJson); } catch {}
  if (!Array.isArray(prev)) prev = [];
  if (!Array.isArray(next)) next = [];

  const len = Math.max(prev.length, next.length);
  for (let i = 0; i < len; i++) {
    const p = prev[i] || {};
    const n = next[i] || {};
    if ((p.photoUrl ?? '') !== (n.photoUrl ?? ''))           changed.add('photo');
    if ((p.passportBioUrl ?? '') !== (n.passportBioUrl ?? '')) changed.add('passport');
  }
  return changed;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order = await findOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const body = await req.json();
    const admin = await getAdminSession();
    const customer = await getCustomerSession();

    // Must be either admin or the order's customer
    let isOwner = false;
    if (customer) {
      const ce = customer.email.toLowerCase();
      if (order.billingEmail.toLowerCase() === ce) isOwner = true;
      else try { const t = JSON.parse(order.travelers); isOwner = t.some((tr: any) => tr.email?.toLowerCase() === ce); } catch {}
    }
    if (!admin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build update data — restrict fields based on role
    const data: Record<string, any> = {};
    const allowed = admin ? ADMIN_ALLOWED : CUSTOMER_ALLOWED;
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    // ── Synthetic approval fields (admin only) ───────────────────────────
    // Clients send `{ photoApproved: true }` to approve, `false` to revoke.
    // Server stamps timestamp + admin name; treating these as derived fields
    // means clients can't forge approval timestamps or impersonate other
    // admins. For consistency, treat true === approve, anything else === clear.
    if (admin) {
      if ('photoApproved' in body) {
        if (body.photoApproved === true) {
          data.photoApprovedAt = new Date();
          data.photoApprovedBy = admin.name;
        } else {
          data.photoApprovedAt = null;
          data.photoApprovedBy = null;
        }
      }
      if ('passportApproved' in body) {
        if (body.passportApproved === true) {
          data.passportApprovedAt = new Date();
          data.passportApprovedBy = admin.name;
        } else {
          data.passportApprovedAt = null;
          data.passportApprovedBy = null;
        }
      }
    }

    // ── Auto-clear approvals on document URL change ──────────────────────
    // Any time the photoUrl or passportBioUrl changes (re-upload by customer
    // OR admin), the matching approval gets blanked so the admin must
    // re-review the new file. If the same PATCH ALSO contains an explicit
    // approval (data.*ApprovedAt set just above), the explicit one wins —
    // an admin manually approving while replacing keeps the approval.
    if ('travelers' in data && typeof data.travelers === 'string') {
      const changed = detectChangedDocs(order.travelers, data.travelers);
      if (changed.has('photo') && data.photoApprovedAt === undefined) {
        data.photoApprovedAt = null;
        data.photoApprovedBy = null;
      }
      if (changed.has('passport') && data.passportApprovedAt === undefined) {
        data.passportApprovedAt = null;
        data.passportApprovedBy = null;
      }
    }

    // Track who made the edit (admin only)
    if (admin) data.lastEditedBy = admin.name;

    // Validate critical fields
    if ('totalUSD' in data && (typeof data.totalUSD !== 'number' || data.totalUSD < 0)) {
      return NextResponse.json({ error: 'Invalid total amount' }, { status: 400 });
    }
    if ('refundAmount' in data && data.refundAmount !== null && (typeof data.refundAmount !== 'number' || data.refundAmount < 0)) {
      return NextResponse.json({ error: 'Invalid refund amount' }, { status: 400 });
    }
    if ('status' in data && !admin) {
      // Customers can only set status to PROCESSING (re-submission after completing finish page)
      if (data.status !== 'PROCESSING') {
        delete data.status;
      }
    }
    // Auto-stamp timestamps when status changes
    if ('status' in data && admin) {
      if (data.status === 'SUBMITTED' && !order.submittedAt) data.submittedAt = new Date();
      if (data.status === 'COMPLETED' && !order.completedAt) data.completedAt = new Date();
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data,
    });

    // Auto-trigger custom emails on status transitions
    if ('status' in data && data.status && data.status !== order.status) {
      // Fire-and-forget — do not block the response on these
      dispatchTriggeredEmails({
        order: updated,
        event: `on_status_${data.status}`,
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
