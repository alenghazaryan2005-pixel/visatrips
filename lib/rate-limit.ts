// Simple in-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

/**
 * Test hook: when DISABLE_RATE_LIMIT=1 (set by .env.test) the limiter
 * returns allowed for every call. Prevents E2E suites from tripping over
 * their own repeated logins. Never set this in production.
 */
const DISABLED = process.env.DISABLE_RATE_LIMIT === '1';

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfter?: number } {
  if (DISABLED) return { allowed: true, remaining: MAX_ATTEMPTS };
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}, 60 * 1000);
