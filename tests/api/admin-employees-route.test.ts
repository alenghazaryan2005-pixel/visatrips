/**
 * Tests for the admin-user management endpoints.
 *
 *   GET    /api/admin/employees           — list (owner-only)
 *   POST   /api/admin/employees           — create (owner-only)
 *   PATCH  /api/admin/employees/[id]      — update (owner-only)
 *   DELETE /api/admin/employees/[id]      — delete (owner-only)
 *
 * Focus: role-based gating (employees + guests are 4xx'd), input validation,
 * and the safety rails (self-demote, self-delete, last-owner protection).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { makeMockPrisma, type MockPrisma } from '../helpers/mockPrisma';

const mockPrisma = makeMockPrisma();
// We mock the whole auth module — `requireOwner` calls Next's `cookies()`
// under the hood via getAdminSession, which only exists inside a request
// context. Each helper here delegates to mockAuth.getAdminSession() so
// individual tests can control the session shape.
const mockAuth = { getAdminSession: vi.fn() };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/auth', () => ({
  getAdminSession: mockAuth.getAdminSession,
  requireOwner: async () => {
    const sess = await mockAuth.getAdminSession();
    if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (sess.role !== 'owner') return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
    return sess;
  },
  requireAdmin: async () => {
    const sess = await mockAuth.getAdminSession();
    if (!sess) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return sess;
  },
  isErrorResponse: (r: any) => r instanceof NextResponse,
}));

const employeesRoute   = await import('@/app/api/admin/employees/route');
const employeeIdRoute  = await import('@/app/api/admin/employees/[id]/route');
const { GET, POST }    = employeesRoute;
const { PATCH, DELETE } = employeeIdRoute;

const params = (id: string) => ({ params: Promise.resolve({ id }) });
function asReq(body: any): any { return { json: async () => body }; }
function reqEmpty(): any { return {}; }

const owner = { name: 'Alice', email: 'owner@v.com', role: 'owner' as const };
const employee = { name: 'Bob', email: 'bob@v.com', role: 'employee' as const };

function reset(p: MockPrisma) {
  Object.values(p).forEach((m: any) => Object.values(m).forEach((fn: any) => fn.mockReset?.()));
  mockAuth.getAdminSession.mockReset();
}

describe('GET /api/admin/employees', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns 401 when unauthenticated', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is an employee', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns the list when caller is owner; strips passwords from responses', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findMany.mockResolvedValue([
      { id: 'a', name: 'Alice', email: 'a@v.com', role: 'owner', password: '$2b$hashed', createdAt: new Date() },
      { id: 'b', name: 'Bob',   email: 'b@v.com', role: 'employee', password: '$2b$hashed', createdAt: new Date() },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.employees).toHaveLength(2);
    for (const e of data.employees) expect(e.password).toBeUndefined();
  });
});

describe('POST /api/admin/employees', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns 403 for employee callers', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await POST(asReq({ name: 'C', email: 'c@v.com', password: 'pass1234' }));
    expect(res.status).toBe(403);
  });

  it('rejects missing fields', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    expect((await POST(asReq({                             email: 'x@v.com', password: 'pw12345678' }))).status).toBe(400);
    expect((await POST(asReq({ name: 'X',                             password: 'pw12345678' }))).status).toBe(400);
    expect((await POST(asReq({ name: 'X', email: 'x@v.com'                                       }))).status).toBe(400);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    const res = await POST(asReq({ name: 'X', email: 'x@v.com', password: 'short' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/8 characters/);
  });

  it('rejects unknown roles', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    const res = await POST(asReq({ name: 'X', email: 'x@v.com', password: 'pw12345678', role: 'admin-supreme' }));
    expect(res.status).toBe(400);
  });

  it('rejects duplicate emails', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await POST(asReq({ name: 'X', email: 'x@v.com', password: 'pw12345678' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already exists/i);
  });

  it('hashes password before persisting and never returns it in the response', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue(null);
    mockPrisma.adminUser.create.mockImplementation(async ({ data }: any) => ({
      id: 'new', ...data, createdAt: new Date(),
    }));

    const res = await POST(asReq({ name: 'X', email: 'x@v.com', password: 'plaintext-pw', role: 'employee' }));
    expect(res.status).toBe(200);

    const created = mockPrisma.adminUser.create.mock.calls[0][0];
    expect(created.data.password).not.toBe('plaintext-pw');
    expect(created.data.password.startsWith('$2')).toBe(true);

    const body = await res.json();
    expect(body.employee.password).toBeUndefined();
  });

  it('lowercases email before saving', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue(null);
    mockPrisma.adminUser.create.mockImplementation(async ({ data }: any) => ({ id: 'n', ...data, createdAt: new Date() }));
    await POST(asReq({ name: 'X', email: '  X@V.COM  ', password: 'pw12345678' }));
    const created = mockPrisma.adminUser.create.mock.calls[0][0];
    expect(created.data.email).toBe('x@v.com');
  });
});

describe('PATCH /api/admin/employees/[id]', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns 403 for employee callers', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await PATCH(asReq({ name: 'New' }), params('id-1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for missing target', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue(null);
    const res = await PATCH(asReq({ name: 'New' }), params('zzz'));
    expect(res.status).toBe(404);
  });

  it('hashes password updates; clears empty password from data', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'x', name: 'X', email: 'x@v.com', role: 'employee', password: '$2b$old' });
    mockPrisma.adminUser.update.mockImplementation(async ({ data }: any) => ({ id: 'x', name: 'X', email: 'x@v.com', role: 'employee', ...data, createdAt: new Date() }));

    await PATCH(asReq({ password: 'new-strong-password' }), params('x'));
    const upd = mockPrisma.adminUser.update.mock.calls[0][0];
    expect(upd.data.password.startsWith('$2')).toBe(true);
    expect(upd.data.password).not.toBe('new-strong-password');

    mockPrisma.adminUser.update.mockClear();
    // Empty password string is treated as "leave unchanged"; should not set password at all.
    await PATCH(asReq({ password: '', name: 'Renamed' }), params('x'));
    const upd2 = mockPrisma.adminUser.update.mock.calls[0][0];
    expect(upd2.data.password).toBeUndefined();
    expect(upd2.data.name).toBe('Renamed');
  });

  it('blocks self-demote (owner cannot change their own role to employee)', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'a', name: 'Alice', email: 'owner@v.com', role: 'owner', password: 'h' });
    const res = await PATCH(asReq({ role: 'employee' }), params('a'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/demote yourself/i);
  });

  it('blocks demoting the last remaining owner', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    // Target is a different owner being demoted, but they're the LAST owner besides the actor.
    // Caller is owner@v.com; target b@v.com is owner; otherOwners = 1 (the caller).
    // Actually wait — the rule: if target is the only owner, can't demote them. Caller can be a different owner though.
    // Set up: target id=b (different from caller), target.role=owner, otherOwners (excluding b) = 0 → block.
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'b', name: 'Bob', email: 'b@v.com', role: 'owner', password: 'h' });
    mockPrisma.adminUser.count.mockResolvedValue(0);
    const res = await PATCH(asReq({ role: 'employee' }), params('b'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/last remaining owner/i);
  });

  it('allows demoting an owner when another owner remains', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'b', name: 'Bob', email: 'b@v.com', role: 'owner', password: 'h' });
    mockPrisma.adminUser.count.mockResolvedValue(1);
    mockPrisma.adminUser.update.mockImplementation(async ({ data }: any) => ({ id: 'b', email: 'b@v.com', role: 'employee', ...data }));
    const res = await PATCH(asReq({ role: 'employee' }), params('b'));
    expect(res.status).toBe(200);
    expect(mockPrisma.adminUser.update.mock.calls[0][0].data.role).toBe('employee');
  });
});

describe('DELETE /api/admin/employees/[id]', () => {
  beforeEach(() => reset(mockPrisma));

  it('returns 403 for employees', async () => {
    mockAuth.getAdminSession.mockResolvedValue(employee);
    const res = await DELETE(reqEmpty(), params('id-1'));
    expect(res.status).toBe(403);
  });

  it('blocks self-delete', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'a', name: 'Alice', email: 'owner@v.com', role: 'owner' });
    const res = await DELETE(reqEmpty(), params('a'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/own account/i);
  });

  it('blocks deleting the last owner', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'b', email: 'b@v.com', role: 'owner' });
    mockPrisma.adminUser.count.mockResolvedValue(0);
    const res = await DELETE(reqEmpty(), params('b'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/last remaining owner/i);
  });

  it('deletes when target is an employee (no last-owner concern)', async () => {
    mockAuth.getAdminSession.mockResolvedValue(owner);
    mockPrisma.adminUser.findUnique.mockResolvedValue({ id: 'c', email: 'c@v.com', role: 'employee' });
    mockPrisma.adminUser.delete.mockResolvedValue({});
    const res = await DELETE(reqEmpty(), params('c'));
    expect(res.status).toBe(200);
    expect(mockPrisma.adminUser.delete).toHaveBeenCalledWith({ where: { id: 'c' } });
  });
});
