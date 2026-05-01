/**
 * Tests for lib/auth.ts — session cookie parsing + role guards.
 *
 * Mocks: next/headers (cookies()). next/server's NextResponse is used
 * unmocked because requireAdmin / requireCustomer return real responses
 * that the rest of the app treats as fetch results — and we want to
 * verify the real shape (status 401 + JSON body).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCookieStore = {
  get: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: async () => mockCookieStore,
}));

const { getAdminSession, getCustomerSession, requireAdmin, requireOwner, requireCustomer, isErrorResponse } =
  await import('@/lib/auth');

beforeEach(() => {
  mockCookieStore.get.mockReset();
});

describe('getAdminSession', () => {
  it('returns null when cookie is absent', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await getAdminSession()).toBeNull();
  });

  it('returns null when cookie has no value', async () => {
    mockCookieStore.get.mockReturnValue({ value: '' });
    expect(await getAdminSession()).toBeNull();
  });

  it('returns legacy session (employee role) for the plain "authenticated" cookie', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'authenticated' });
    // Pre-role-split cookies don't carry a role; we fall back to 'employee'
    // so they can't unintentionally use owner-only features. Owners need to
    // log out + back in to refresh the cookie with their actual role.
    expect(await getAdminSession()).toEqual({ name: 'Admin', email: '', role: 'employee' });
  });

  it('parses a JSON session with name+email; defaults role to employee when absent', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'Alice', email: 'alice@v.com' }),
    });
    expect(await getAdminSession()).toEqual({ name: 'Alice', email: 'alice@v.com', role: 'employee' });
  });

  it('parses role=owner from JSON when present', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'Alice', email: 'alice@v.com', role: 'owner' }),
    });
    expect(await getAdminSession()).toEqual({ name: 'Alice', email: 'alice@v.com', role: 'owner' });
  });

  it('coerces invalid role values to employee', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'A', email: 'a@v.com', role: 'totally-fake' }),
    });
    expect((await getAdminSession())?.role).toBe('employee');
  });

  it('returns null for JSON missing required fields', async () => {
    mockCookieStore.get.mockReturnValue({ value: JSON.stringify({ name: 'Alice' }) });
    expect(await getAdminSession()).toBeNull();

    mockCookieStore.get.mockReturnValue({ value: JSON.stringify({ email: 'alice@v.com' }) });
    expect(await getAdminSession()).toBeNull();
  });

  it('returns null for malformed JSON (no crash)', async () => {
    mockCookieStore.get.mockReturnValue({ value: '{{{not valid' });
    expect(await getAdminSession()).toBeNull();
  });

  it('reads the correct cookie name', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    await getAdminSession();
    expect(mockCookieStore.get).toHaveBeenCalledWith('ev_admin_session');
  });
});

describe('getCustomerSession', () => {
  it('returns null when cookie missing', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await getCustomerSession()).toBeNull();
  });

  it('parses a JSON session with email', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ email: 'c@v.com', orderNumber: 42 }),
    });
    expect(await getCustomerSession()).toEqual({ email: 'c@v.com', orderNumber: 42 });
  });

  it('returns null if email missing even when JSON is valid', async () => {
    mockCookieStore.get.mockReturnValue({ value: JSON.stringify({ orderNumber: 42 }) });
    expect(await getCustomerSession()).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'not json' });
    expect(await getCustomerSession()).toBeNull();
  });

  it('reads the correct cookie name', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    await getCustomerSession();
    expect(mockCookieStore.get).toHaveBeenCalledWith('ev_customer_session');
  });
});

describe('requireAdmin', () => {
  it('returns session when authenticated', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'A', email: 'a@v.com', role: 'owner' }),
    });
    const result = await requireAdmin();
    expect(result).toEqual({ name: 'A', email: 'a@v.com', role: 'owner' });
  });

  it('returns a NextResponse with status 401 when unauthenticated', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const result = (await requireAdmin()) as any;
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: 'Unauthorized' });
  });

  it('works with the isErrorResponse discriminator', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const result = await requireAdmin();
    expect(isErrorResponse(result)).toBe(true);

    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'A', email: 'a@v.com' }),
    });
    const session = await requireAdmin();
    expect(isErrorResponse(session)).toBe(false);
  });
});

describe('requireOwner', () => {
  it('returns 401 when unauthenticated', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const result = (await requireOwner()) as any;
    expect(result.status).toBe(401);
  });

  it('returns 403 when caller is an employee', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'B', email: 'b@v.com', role: 'employee' }),
    });
    const result = (await requireOwner()) as any;
    expect(result.status).toBe(403);
    expect((await result.json()).error).toMatch(/owner role required/i);
  });

  it('returns the session when caller is owner', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'A', email: 'a@v.com', role: 'owner' }),
    });
    const result = await requireOwner();
    expect(result).toEqual({ name: 'A', email: 'a@v.com', role: 'owner' });
  });

  it('treats role-less sessions as employee (returns 403)', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'A', email: 'a@v.com' }),  // no role field
    });
    const result = (await requireOwner()) as any;
    expect(result.status).toBe(403);
  });
});

describe('requireCustomer', () => {
  it('returns session when authenticated', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ email: 'c@v.com' }),
    });
    const result = await requireCustomer();
    expect(result).toMatchObject({ email: 'c@v.com' });
  });

  it('returns a 401 NextResponse when unauthenticated', async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const result = (await requireCustomer()) as any;
    expect(result.status).toBe(401);
  });
});

describe('isErrorResponse', () => {
  it('recognises NextResponse instances', async () => {
    const { NextResponse } = await import('next/server');
    const r = NextResponse.json({ error: 'x' }, { status: 401 });
    expect(isErrorResponse(r)).toBe(true);
  });

  it('rejects plain objects', () => {
    expect(isErrorResponse({ status: 401 })).toBe(false);
    expect(isErrorResponse(null)).toBe(false);
    expect(isErrorResponse(undefined)).toBe(false);
    expect(isErrorResponse('error')).toBe(false);
  });

  it('rejects session objects', () => {
    expect(isErrorResponse({ name: 'A', email: 'a@v.com' })).toBe(false);
  });
});
