/**
 * Tests for /api/upload — file upload endpoint (photos + passport PDFs).
 *
 * Security-critical surface: MIME validation, size limit, path-traversal
 * defense, magic-byte check for images. We mock fs/promises so nothing
 * actually writes to disk.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFs = {
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir:     vi.fn().mockResolvedValue(undefined),
};

const mockAuth = {
  getAdminSession:    vi.fn(),
  getCustomerSession: vi.fn(),
};

const mockErrorLog = {
  logError:               vi.fn().mockResolvedValue(undefined),
  extractRequestContext:  vi.fn(() => ({})),
};

vi.mock('fs/promises',       () => mockFs);
vi.mock('@/lib/auth',        () => mockAuth);
vi.mock('@/lib/error-log',   () => mockErrorLog);

const { POST } = await import('@/app/api/upload/route');

// Helper: construct a request with a formData-like payload
function makeFile(opts: {
  name?: string;
  type?: string;
  size?: number;
  /** First bytes of the file content. Defaults to JPEG magic (FF D8). */
  header?: number[];
}): File {
  const size = opts.size ?? 100;
  const header = opts.header ?? [0xFF, 0xD8, 0xFF, 0xE0];
  // Build an ArrayBuffer whose first bytes are the given header.
  const buf = new Uint8Array(size);
  header.forEach((b, i) => { buf[i] = b; });
  // @ts-ignore — in Node 20+ the File global exists.
  return new File([buf], opts.name ?? 'photo.jpg', { type: opts.type ?? 'image/jpeg' });
}

function asReq(entries: Record<string, any>): any {
  return {
    formData: async () => ({
      get: (key: string) => entries[key] ?? null,
    }),
    headers: { get: () => '' },
  };
}

beforeEach(() => {
  mockFs.writeFile.mockClear();
  mockFs.mkdir.mockClear();
  mockAuth.getAdminSession.mockReset();
  mockAuth.getCustomerSession.mockReset();
  mockErrorLog.logError.mockClear();
});

function adminAuth() {
  mockAuth.getAdminSession.mockResolvedValue({ name: 'A', email: 'a@v.com' });
  mockAuth.getCustomerSession.mockResolvedValue(null);
}

describe('POST /api/upload — auth', () => {
  it('rejects unauthenticated callers with 401', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue(null);

    const res = await POST(asReq({
      file: makeFile({}), orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(401);
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('allows customer auth in addition to admin', async () => {
    mockAuth.getAdminSession.mockResolvedValue(null);
    mockAuth.getCustomerSession.mockResolvedValue({ email: 'c@v.com' });

    const res = await POST(asReq({
      file: makeFile({}), orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/upload — field validation', () => {
  beforeEach(adminAuth);

  it('rejects missing file', async () => {
    const res = await POST(asReq({ orderId: 'abc', type: 'photo' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing file/);
  });

  it('rejects missing orderId', async () => {
    const res = await POST(asReq({ file: makeFile({}), type: 'photo' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing type', async () => {
    const res = await POST(asReq({ file: makeFile({}), orderId: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown upload type', async () => {
    const res = await POST(asReq({
      file: makeFile({}), orderId: 'abc', type: 'cv',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid upload type/);
  });

  it('allows all three upload types (photo/passport/evisa)', async () => {
    for (const type of ['photo', 'passport', 'evisa']) {
      const res = await POST(asReq({
        file: makeFile({}), orderId: 'abc', type,
      }));
      expect(res.status, `type=${type}`).toBe(200);
    }
  });
});

describe('POST /api/upload — size + MIME + extension', () => {
  beforeEach(adminAuth);

  it('rejects files over 5MB', async () => {
    const res = await POST(asReq({
      file: makeFile({ size: 6 * 1024 * 1024 }), orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too large/i);
  });

  it('rejects unknown MIME types', async () => {
    const res = await POST(asReq({
      file: makeFile({ type: 'application/zip', name: 'x.zip' }),
      orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid file type/i);
  });

  it('rejects when the extension is not in the allow list', async () => {
    const res = await POST(asReq({
      file: makeFile({ name: 'photo.exe' }),
      orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid file extension/i);
  });

  it('accepts PDFs for passport uploads', async () => {
    const res = await POST(asReq({
      file: makeFile({
        name: 'passport.pdf',
        type: 'application/pdf',
        header: [0x25, 0x50, 0x44, 0x46], // %PDF — but magic check only applies to images
      }),
      orderId: 'abc', type: 'passport',
    }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/upload — magic byte check', () => {
  beforeEach(adminAuth);

  it('accepts valid JPEG magic bytes', async () => {
    const res = await POST(asReq({
      file: makeFile({ header: [0xFF, 0xD8, 0xFF, 0xE0] }),
      orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(200);
  });

  it('accepts valid PNG magic bytes', async () => {
    const res = await POST(asReq({
      file: makeFile({
        name: 'x.png', type: 'image/png',
        header: [0x89, 0x50, 0x4E, 0x47],
      }),
      orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(200);
  });

  it('accepts valid WebP magic bytes', async () => {
    const res = await POST(asReq({
      file: makeFile({
        name: 'x.webp', type: 'image/webp',
        header: [0x52, 0x49, 0x46, 0x46],
      }),
      orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(200);
  });

  it('rejects MIME-spoofed images (right extension + MIME, wrong bytes)', async () => {
    const res = await POST(asReq({
      // Claims to be JPEG, but body starts with text bytes
      file: makeFile({ header: [0x4D, 0x5A, 0x90, 0x00] }), // MZ header (Windows exe)
      orderId: 'abc', type: 'photo',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/content does not match/i);
  });
});

describe('POST /api/upload — path safety', () => {
  beforeEach(adminAuth);

  it('strips path traversal characters from orderId', async () => {
    const res = await POST(asReq({
      file: makeFile({}), orderId: '../../etc/passwd', type: 'photo',
    }));
    expect(res.status).toBe(200);
    const dirArg = mockFs.mkdir.mock.calls[0][0] as string;
    // The sanitizer leaves only alphanum/-/_ — path has NO literal ".." traversal.
    expect(dirArg).not.toMatch(/\.\./);
    // It should also not escape the uploads root
    expect(dirArg).toMatch(/\/public\/uploads\//);
  });

  it('rejects an orderId that sanitises to empty string', async () => {
    const res = await POST(asReq({
      file: makeFile({}), orderId: '.../...', type: 'photo',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid order ID/i);
  });

  it('writes under the expected order-scoped directory', async () => {
    await POST(asReq({
      file: makeFile({ name: 'photo.jpg' }), orderId: 'ord_abc', type: 'photo',
    }));
    const filepath = mockFs.writeFile.mock.calls[0][0] as string;
    expect(filepath).toContain('/public/uploads/ord_abc/');
    expect(filepath).toMatch(/photo\.jpg$/);
  });

  it('returns a URL-encoded public URL', async () => {
    const res = await POST(asReq({
      file: makeFile({ name: 'my photo (1).jpg' }), orderId: 'ord_abc', type: 'photo',
    }));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toBe('/uploads/ord_abc/my%20photo%20(1).jpg');
  });
});
