/**
 * Setup for component tests (jsdom environment).
 *
 * Tells React that we're in an act() environment so it flushes effects
 * synchronously under Testing Library's render/waitFor. Without this,
 * useEffect state transitions don't show up until after the test times out.
 *
 * Also imports @testing-library/jest-dom for DOM matchers like
 * `toBeInTheDocument()` and cleans up rendered trees between tests.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
