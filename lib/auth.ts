import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const ADMIN_SESSION_TOKEN = 'ev_admin_session';
const CUSTOMER_SESSION_TOKEN = 'ev_customer_session';

export interface AdminSession {
  name: string;
  email: string;
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
    if (session.value === 'authenticated') return { name: 'Admin', email: '' };
    const data = JSON.parse(session.value);
    if (data.name && data.email) return data;
    return null;
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
