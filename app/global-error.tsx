'use client';

/**
 * Next.js global error boundary — catches errors in the root layout
 * and forwards them to our error log.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send to Sentry
    const sentryId = Sentry.captureException(error);

    // Also log to our own DB (fire-and-forget)
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          source: 'client',
          message: error.message,
          stack: error.stack,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          sentryId,
          context: JSON.stringify({ digest: error.digest }),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>Something went wrong</h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          We've been notified and are looking into it. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            background: '#3b82f6', color: 'white', border: 'none',
            padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.95rem',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
