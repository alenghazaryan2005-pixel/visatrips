import { NextRequest } from 'next/server';
import { getActiveTheme } from '@/lib/theme-server';
import { subscribeThemeChanged } from '@/lib/theme-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/theme/stream — Server-Sent Events stream of theme changes.
 *
 * On connect: emits the current theme as the first event so the client can
 * sync immediately even if it missed an earlier broadcast.
 *
 * On every theme save (POST /api/theme), emits the new theme to every
 * subscriber.
 *
 * Keepalive: comments every 30s so intermediate proxies (Cloudflare, nginx,
 * Vercel, etc.) don't terminate idle SSE connections at the 60s mark.
 *
 * Public — no auth. The active theme is already exposed via GET /api/theme,
 * so streaming it adds no new info.
 */
export async function GET(req: NextRequest) {
  const enc = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      // Initial sync — send current saved theme so the client can adopt it
      // immediately on connect.
      try {
        const initial = await getActiveTheme();
        controller.enqueue(enc.encode(`data: ${JSON.stringify(initial)}\n\n`));
      } catch {
        // Connection still useful even if the initial fetch failed —
        // subsequent broadcasts will sync the client.
      }

      unsubscribe = subscribeThemeChanged(colors => {
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

      // Browser close / tab close → ReadableStream cancel runs below.
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
      'X-Accel-Buffering': 'no', // disable nginx-style proxy buffering
    },
  });
}
