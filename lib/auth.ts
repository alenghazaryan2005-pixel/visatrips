import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const ADMIN_SESSION_TOKEN = 'ev_admin_session';
const CUSTOMER_SESSION_TOKEN = 'ev_customer_session';

/** Roles an admin user can have. 'owner' = full access including site
 *  customization + employee management; 'employee' = can use the admin
 *  panel but can't change site config or manage other admins. */
export type AdminRole = 'owner' | 'employee';

export interface AdminSession {
  name: string;
  email: string;
  /** Defaults to 'employee' for stale cookies that pre-date the role split.
   *  Owners need to log out + back in once after the deploy to populate this. */
  role: AdminRole;
}

export interface CustomerSession {
  email: string;
  orderId?: string;
  orderNumber?: number;
}

/** Get admin session or null if not authenticated */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_TOKEN);
  if (!session?.value) return null;
  try {
    // Legacy cookie value from very early versions — treat as employee for
    // safety; user should re-login to get an owner session.
    if (session.value === 'authenticated') return { name: 'Admin', email: '', role: 'employee' };
    const data = JSON.parse(session.value);
    if (!data.name || !data.email) return null;
    const role: AdminRole = data.role === 'owner' ? 'owner' : 'employee';
    return { name: data.name, email: data.email, role };
  } catch { return null; }
}

/** Get customer session or null */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(CUSTOMER_SESSION_TOKEN);
  if (!session?.value) return null;
  try {
    const data = JSON.parse(session.value);
    if (data.email) return data;
    return null;
  } catch { return null; }
}

/** Require admin auth — returns error response if not authenticated */
export async function requireAdmin(): Promise<AdminSession | NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}

/**
 * Require owner-role admin — returns 401 for guests and 403 for employees.
 * Use on every owner-only API write (employee mgmt, theme writes, future
 * site-editor writes). For reads, callers can check `session.role` directly.
 */
export async function requireOwner(): Promise<AdminSession | NextResponse> {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }
  return session;
}

/** Require customer auth */
export async function requireCustomer(): Promise<CustomerSession | NextResponse> {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}

/** Check if result is an error response */
export function isErrorResponse(result: any): result is NextResponse {
  return result instanceof NextResponse;
}
