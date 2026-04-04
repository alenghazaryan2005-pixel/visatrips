import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const orderId = formData.get('orderId') as string | null;
    const type = formData.get('type') as string | null; // 'photo' or 'passport'

    if (!file || !orderId || !type) {
      return NextResponse.json({ error: 'Missing file, orderId, or type' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create order-specific directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', orderId);
    await mkdir(uploadDir, { recursive: true });

    // Determine filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${type}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    const url = `/uploads/${orderId}/${filename}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
