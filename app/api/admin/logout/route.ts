import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  // Delete must specify the same domain the cookie was set with —
  // otherwise the browser keeps the domain=.visatrips.com cookie and
  // the "delete" only clears a nonexistent host-only cookie.
  cookieStore.delete({
    name: 'ev_admin_session',
    path: '/',
    ...(isProd ? { domain: '.visatrips.com' } : {}),
  });
  return NextResponse.json({ success: true });
}
