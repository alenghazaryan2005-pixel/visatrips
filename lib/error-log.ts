/**
 * Central error logger — sends to both Sentry and our DB.
 * Use this in API routes and server actions to capture errors consistently.
 */

import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';

export interface ErrorLogContext {
  url?: string;
  method?: string;
  statusCode?: number;
  userAgent?: string;
  ipAddress?: string;
  userEmail?: string;
  userType?: 'admin' | 'customer' | 'guest';
  extra?: Record<string, any>;
  source?: 'server' | 'client' | 'bot';
  level?: 'error' | 'warning' | 'info';
}

/**
 * Generate a fingerprint to group similar errors (same message + top of stack).
 * Uses a simple djb2-style hash that works in both Node.js and Edge runtimes.
 */
function fingerprint(message: string, stack?: string): string {
  const stackSig = stack ? stack.split('\n').slice(0, 3).join('\n') : '';
  const input = message + '|' + stackSig;
  // Simple non-cryptographic hash (djb2) — sufficient for grouping errors
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Log an error to both Sentry and the database.
 * Safe to call — swallows its own errors so it never breaks the caller.
 */
export async function logError(
  err: unknown,
  ctx: ErrorLogContext = {}
): Promise<string | null> {
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message || 'Unknown error';
    const stack = error.stack;

    // Send to Sentry
    let sentryId: string | undefined;
    try {
      sentryId = Sentry.captureException(error, {
        level: (ctx.level as any) || 'error',
        tags: {
          source: ctx.source || 'server',
          userType: ctx.userType || 'guest',
          method: ctx.method,
        },
        extra: {
          url: ctx.url,
          statusCode: ctx.statusCode,
          ...(ctx.extra || {}),
        },
        user: ctx.userEmail ? { email: ctx.userEmail } : undefined,
      });
    } catch {}

    // Save to our DB
    try {
      const saved = await prisma.errorLog.create({
        data: {
          level: ctx.level || 'error',
          source: ctx.source || 'server',
          message: message.slice(0, 2000), // cap long messages
          stack: stack?.slice(0, 10000),
          url: ctx.url,
          method: ctx.method,
          statusCode: ctx.statusCode,
          userAgent: ctx.userAgent,
          ipAddress: ctx.ipAddress,
          userEmail: ctx.userEmail,
          userType: ctx.userType,
          context: ctx.extra ? JSON.stringify(ctx.extra).slice(0, 10000) : null,
          sentryId,
          fingerprint: fingerprint(message, stack),
        },
      });
      return saved.id;
    } catch (dbErr) {
      console.error('[logError] Failed to save error to DB:', dbErr);
      return null;
    }
  } catch (outerErr) {
    console.error('[logError] Uncaught error in logger:', outerErr);
    return null;
  }
}

/**
 * Extract common request context from a NextRequest/Request for logging.
 */
export function extractRequestContext(req: Request): Partial<ErrorLogContext> {
  try {
    const url = req.url;
    const method = req.method;
    const userAgent = req.headers.get('user-agent') || undefined;
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || undefined;
    return { url, method, userAgent, ipAddress };
  } catch {
    return {};
  }
}
