import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('ev_admin_session');

  if (!session?.value) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    // Support both old format ("authenticated") and new format (JSON)
    if (session.value === 'authenticated') {
      return NextResponse.json({ authenticated: true, name: 'Admin', email: '', role: 'employee' });
    }
    const data = JSON.parse(session.value);
    if (data.name && data.email) {
      const role = data.role === 'owner' ? 'owner' : 'employee';
      return NextResponse.json({ authenticated: true, name: data.name, email: data.email, role });
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
