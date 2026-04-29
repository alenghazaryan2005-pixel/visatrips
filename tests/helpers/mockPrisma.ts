import { vi } from 'vitest';

/**
 * Minimal Prisma client double.
 *
 * Every method used by the routes-under-test is a `vi.fn()` so tests can:
 *   - set return values via `mockResolvedValue(...)`
 *   - assert calls with `toHaveBeenCalledWith(...)`
 *
 * Add new models/methods here as tests need them — keep it thin.
 */
export function makeMockPrisma() {
  return {
    order: {
      findFirst:  vi.fn(),
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
      count:      vi.fn(),
    },
    setting: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      upsert:     vi.fn(),
    },
    botRun: {
      findMany: vi.fn(),
      create:   vi.fn(),
      update:   vi.fn(),
    },
    botRunEntry: {
      groupBy: vi.fn(),
      create:  vi.fn(),
    },
    customEmailTemplate: {
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
    },
    abandonedApplication: {
      findMany:   vi.fn(),
      update:     vi.fn(),
      deleteMany: vi.fn(),
      count:      vi.fn(),
    },
    orderTag: {
      findMany:   vi.fn(),
      findFirst:  vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
      count:      vi.fn(),
    },
  };
}

export type MockPrisma = ReturnType<typeof makeMockPrisma>;
