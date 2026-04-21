import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getAdminSession, getCustomerSession } from '@/lib/auth';
import { logError, extractRequestContext } from '@/lib/error-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
const ALLOWED_UPLOAD_TYPES = ['photo', 'passport', 'evisa'];

export async function POST(req: NextRequest) {
  // Require auth — admin or customer
  const admin = await getAdminSession();
  const customer = await getCustomerSession();
  if (!admin && !customer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const orderId = formData.get('orderId') as string | null;
    const type = formData.get('type') as string | null;

    if (!file || !orderId || !type) {
      return NextResponse.json({ error: 'Missing file, orderId, or type' }, { status: 400 });
    }

    // Validate upload type
    if (!ALLOWED_UPLOAD_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB allowed.' }, { status: 400 });
    }

    // Validate MIME type
    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json({ error: 'Invalid file type. Only JPG, PNG, WebP, and PDF are allowed.' }, { status: 400 });
    }

    // Validate extension matches MIME type
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowedExts = Object.values(ALLOWED_TYPES).flat();
    if (!allowedExts.includes(ext)) {
      return NextResponse.json({ error: 'Invalid file extension' }, { status: 400 });
    }

    // Sanitize orderId to prevent path traversal
    const safeOrderId = orderId.replace(/[^a-zA-Z0-9\-_]/g, '');
    if (!safeOrderId) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate file magic bytes for images
    if (file.type.startsWith('image/')) {
      const header = buffer.slice(0, 4);
      const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
      const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
      const isWebp = header[0] === 0x52 && header[1] === 0x49;
      if (!isJpeg && !isPng && !isWebp) {
        return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
      }
    }

    // Create order-specific directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', safeOrderId);
    await mkdir(uploadDir, { recursive: true });

    // Save raw file with its exact original name
    const filename = file.name;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    const url = `/uploads/${safeOrderId}/${encodeURIComponent(filename)}`;
    return NextResponse.json({ url });
  } catch (err) {
    await logError(err, {
      ...extractRequestContext(req),
      source: 'server',
      statusCode: 500,
      userEmail: (await getAdminSession())?.email || (await getCustomerSession())?.email,
      extra: { route: '/api/upload' },
    });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
