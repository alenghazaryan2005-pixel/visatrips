import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { BUILT_IN_PRESETS, validateThemeStrict } from '@/lib/theme';
import { getActiveTheme, getUserPresets, saveActiveTheme } from '@/lib/theme-server';
import { emitThemeChanged } from '@/lib/theme-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/theme — return the active theme + all presets (built-in + user).
 * Public — the active palette is needed at request time on every page render
 * via ThemeStyleInjector. Built-in presets are static, so we attach them too
 * to save the admin UI a round trip.
 */
export async function GET(_req: NextRequest) {
  try {
    const [active, userPresets] = await Promise.all([getActiveTheme(), getUserPresets()]);
    return NextResponse.json({
      active,
      presets: { builtIn: BUILT_IN_PRESETS, user: userPresets },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load theme' }, { status: 500 });
  }
}

/**
 * POST /api/theme — save the active theme (admin only).
 * Body: { colors: ThemeColors }
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const colors = validateThemeStrict(body?.colors);
    await saveActiveTheme(colors, admin.name);
    // Push the new palette out to every connected SSE subscriber so already-
    // open tabs (admin + customer) re-paint without a manual refresh.
    emitThemeChanged(colors);
    return NextResponse.json({ ok: true, active: colors });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save theme' }, { status: 400 });
  }
}
