/**
 * Sentry — client-side configuration
 * Captures errors happening in the browser
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of requests for performance monitoring
  debug: false,
  environment: process.env.NODE_ENV,
  // Don't send errors in development unless DSN is set
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Also forward errors to our own API so they show in admin panel
  beforeSend(event, hint) {
    try {
      const err = hint.originalException as Error | undefined;
      const payload = {
        level: event.level || 'error',
        source: 'client',
        message: err?.message || event.message || 'Unknown client error',
        stack: err?.stack || undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        sentryId: event.event_id,
        context: JSON.stringify({ tags: event.tags, extra: event.extra }),
      };
      // Fire-and-forget; don't block Sentry
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch {}
    return event;
  },
});
