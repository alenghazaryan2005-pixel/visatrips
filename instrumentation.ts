/**
 * Next.js instrumentation hook — loads Sentry on server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: { [key: string]: string } },
  context: { routerKind: 'Pages Router' | 'App Router'; routePath: string; routeType: 'render' | 'route' | 'action' | 'middleware' }
) {
  // Log server-side request errors to our DB + Sentry
  try {
    const { logError } = await import('./lib/error-log');
    const error = err instanceof Error ? err : new Error(String(err));
    await logError(error, {
      source: 'server',
      level: 'error',
      url: request.path,
      method: request.method,
      extra: { routerKind: context.routerKind, routePath: context.routePath, routeType: context.routeType },
    });
  } catch {}
}
