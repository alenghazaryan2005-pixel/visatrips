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

const { getAdminSession, getCustomerSession, requireAdmin, requireCustomer, isErrorResponse } =
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

  it('returns legacy { name: "Admin", email: "" } for the plain "authenticated" cookie', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'authenticated' });
    expect(await getAdminSession()).toEqual({ name: 'Admin', email: '' });
  });

  it('parses a JSON session with name+email', async () => {
    mockCookieStore.get.mockReturnValue({
      value: JSON.stringify({ name: 'Alice', email: 'alice@v.com' }),
    });
    expect(await getAdminSession()).toEqual({ name: 'Alice', email: 'alice@v.com' });
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
      value: JSON.stringify({ name: 'A', email: 'a@v.com' }),
    });
    const result = await requireAdmin();
    expect(result).toEqual({ name: 'A', email: 'a@v.com' });
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
