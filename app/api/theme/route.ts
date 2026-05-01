import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isErrorResponse } from '@/lib/auth';
import { BUILT_IN_PRESETS, validateThemeStrict } from '@/lib/theme';
import { getActiveTheme, getUserPresets, saveActiveTheme } from '@/lib/theme-server';
import { emitThemeChanged } from '@/lib/theme-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/theme — return the calling admin's active theme + their presets.
 * Any logged-in admin can read their own — themes are per-user (each admin's
 * customisation only affects their own browser, not other admins or the
 * customer-facing site).
 */
export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;
  try {
    const [active, userPresets] = await Promise.all([
      getActiveTheme(auth.email),
      getUserPresets(auth.email),
    ]);
    return NextResponse.json({
      active,
      presets: { builtIn: BUILT_IN_PRESETS, user: userPresets },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load theme' }, { status: 500 });
  }
}

/**
 * POST /api/theme — save the calling admin's active theme.
 * Body: { colors: ThemeColors }. Per-user, so any logged-in admin can do it
 * (employee included — each admin manages their own palette only).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  try {
    const body = await req.json();
    const colors = validateThemeStrict(body?.colors);
    await saveActiveTheme(auth.email, colors, auth.name);
    // Push the new palette out only to other open tabs of THIS admin —
    // other admins' SSE subscriptions don't receive it.
    emitThemeChanged(auth.email, colors);
    return NextResponse.json({ ok: true, active: colors });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save theme' }, { status: 400 });
  }
}
