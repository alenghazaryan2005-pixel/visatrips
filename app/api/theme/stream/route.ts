import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getActiveTheme } from '@/lib/theme-server';
import { subscribeThemeChanged } from '@/lib/theme-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/theme/stream — Server-Sent Events stream of THIS admin's theme
 * changes only. Themes are per-user, so the stream is scoped to the
 * authenticated admin's email — Alice saving never pushes to Bob's tabs.
 *
 * On connect: emits Alice's current theme so a fresh tab syncs immediately
 * even if it missed an earlier broadcast.
 *
 * On every theme save (POST /api/theme by Alice), emits the new colours to
 * every Alice tab connected to this stream.
 *
 * Keepalive: comments every 30s so intermediate proxies (Cloudflare, nginx,
 * Vercel, etc.) don't terminate idle SSE connections at the 60s mark.
 *
 * Auth required — guests get 401 instead of an empty stream they couldn't
 * use anyway.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const myEmail = session.email;

  const enc = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      // Initial sync — send THIS admin's current saved theme.
      try {
        const initial = await getActiveTheme(myEmail);
        controller.enqueue(enc.encode(`data: ${JSON.stringify(initial)}\n\n`));
      } catch {
        // Connection still useful even if the initial fetch failed —
        // subsequent broadcasts will sync the client.
      }

      unsubscribe = subscribeThemeChanged(myEmail, colors => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(colors)}\n\n`));
        } catch {
          // Client disconnected. cancel() handler will clean up.
        }
      });

      keepalive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          // Closed — cleanup happens in cancel().
        }
      }, 30_000);

      req.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (keepalive) clearInterval(keepalive);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      unsubscribe?.();
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
