/**
 * POST /api/customizations/upload-image  (multipart/form-data)
 *
 * Owner-only. Accepts a single image file (JPG/PNG/WebP/GIF, ≤8MB) and
 * writes it to /public/uploads/site/<random-name>.<ext>. Returns the
 * public URL so the site editor can save it as an `src` or
 * `background-image` customization.
 *
 * This is separate from /api/upload (which is per-order, customer/admin).
 * Site-editor uploads aren't tied to an order — they're chrome the owner
 * is putting on the site itself.
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { requireOwner, isErrorResponse } from '@/lib/auth';
import { logError, extractRequestContext } from '@/lib/error-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB — site assets can be hero images
const ALLOWED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png':  ['png'],
  'image/webp': ['webp'],
  'image/gif':  ['gif'],
  'image/svg+xml': ['svg'],
};

export async function POST(req: NextRequest) {
  const auth = await requireOwner();
  if (isErrorResponse(auth)) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json({ error: 'Invalid file type. Only JPG, PNG, WebP, GIF, SVG.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Magic-byte check for raster formats. SVG is XML, so skipped here —
    // the MIME-type gate above is the main defence.
    if (file.type !== 'image/svg+xml') {
      const header = buffer.slice(0, 4);
      const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
      const isPng  = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
      const isWebp = header[0] === 0x52 && header[1] === 0x49;
      const isGif  = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
      if (!isJpeg && !isPng && !isWebp && !isGif) {
        return NextResponse.json({ error: 'File content does not match declared type.' }, { status: 400 });
      }
    }

    // Random filename — avoids collisions and prevents the user-supplied
    // name from mattering in the URL (which gets baked into customizations).
    const exts = ALLOWED_TYPES[file.type];
    const ext = exts[0];
    const filename = `${randomBytes(12).toString('hex')}.${ext}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'site');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const url = `/uploads/site/${filename}`;
    return NextResponse.json({ url });
  } catch (err) {
    await logError(err, {
      ...extractRequestContext(req),
      source: 'server',
      statusCode: 500,
      userEmail: auth.email,
      extra: { route: '/api/customizations/upload-image' },
    });
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
