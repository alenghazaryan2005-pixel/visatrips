/**
 * Tests for lib/botRuntime.ts — admin override resolution + per-run logger.
 *
 * This is the module the Playwright bot script relies on at runtime, so
 * bugs here silently push wrong data to the gov site. We cover every
 * branch of `resolveSource` and `adminOr`, plus the logger's graceful-
 * DB-failure behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadBotOverrides,
  getOverride,
  resolveSource,
  adminOr,
  sourceTag,
  createBotRunLogger,
} from '@/lib/botRuntime';
import { makeMockPrisma } from '../helpers/mockPrisma';

describe('loadBotOverrides', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  beforeEach(() => { prisma = makeMockPrisma(); });

  it('returns {} when the setting row is missing', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    expect(await loadBotOverrides(prisma as any, 'INDIA')).toEqual({});
  });

  it('returns {} when JSON parse fails', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      key: 'bot.mapping.INDIA',
      value: '{not valid',
    });
    expect(await loadBotOverrides(prisma as any, 'INDIA')).toEqual({});
  });

  it('returns {} when overrides is not an object', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      key: 'bot.mapping.INDIA',
      value: JSON.stringify({ overrides: 'bogus' }),
    });
    expect(await loadBotOverrides(prisma as any, 'INDIA')).toEqual({});
  });

  it('filters out unrecognised source shapes', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      key: 'bot.mapping.INDIA',
      value: JSON.stringify({
        overrides: {
          'registration.nationality': { type: 'schema', fieldKey: 'passportCountry' },
          'registration.bad':         { type: 'garbage' },
          'registration.empty':       { type: 'schema' }, // missing fieldKey
        },
      }),
    });
    const out = await loadBotOverrides(prisma as any, 'INDIA');
    expect(out).toEqual({
      'registration.nationality': { type: 'schema', fieldKey: 'passportCountry' },
    });
  });

  it('uses the uppercased country in the setting key', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    await loadBotOverrides(prisma as any, 'india');
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({
      where: { key: 'bot.mapping.INDIA' },
    });
  });

  it('swallows db errors as an empty override map', async () => {
    prisma.setting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await loadBotOverrides(prisma as any, 'INDIA')).toEqual({});
  });
});

describe('getOverride', () => {
  const overrides = { 'registration.nationality': { type: 'skip' as const } };

  it('returns the override when the key matches', () => {
    expect(getOverride('registration', 'nationality', overrides)).toEqual({ type: 'skip' });
  });

  it('returns null when the key is absent', () => {
    expect(getOverride('applicant', 'surname', overrides)).toBeNull();
    expect(getOverride('registration', 'other', overrides)).toBeNull();
  });
});

describe('resolveSource', () => {
  it('hardcoded → value', () => {
    expect(resolveSource({ type: 'hardcoded', value: 'ORDINARY' }, null, null)).toEqual({
      kind: 'value', value: 'ORDINARY',
    });
  });

  it('manual → manual kind', () => {
    expect(resolveSource({ type: 'manual' }, {}, {})).toEqual({ kind: 'manual' });
  });

  it('skip → skip kind', () => {
    expect(resolveSource({ type: 'skip' }, {}, {})).toEqual({ kind: 'skip' });
  });

  it('schema reads from traveler first', () => {
    expect(
      resolveSource(
        { type: 'schema', fieldKey: 'firstName' },
        { firstName: 'Jane' },
        { firstName: 'OverrideMe' },
      ),
    ).toEqual({ kind: 'value', value: 'Jane' });
  });

  it('schema falls back to order when traveler field is missing', () => {
    expect(
      resolveSource(
        { type: 'schema', fieldKey: 'destination' },
        { firstName: 'Jane' },
        { destination: 'India' },
      ),
    ).toEqual({ kind: 'value', value: 'India' });
  });

  it('schema skip when field missing on both traveler and order', () => {
    expect(
      resolveSource({ type: 'schema', fieldKey: 'middleName' }, {}, {}),
    ).toEqual({ kind: 'skip' });
  });

  it('schema skip for empty string / null / undefined', () => {
    expect(
      resolveSource({ type: 'schema', fieldKey: 'firstName' }, { firstName: '' }, {}),
    ).toEqual({ kind: 'skip' });

    expect(
      resolveSource({ type: 'schema', fieldKey: 'firstName' }, { firstName: null }, {}),
    ).toEqual({ kind: 'skip' });
  });

  it('schema coerces non-string values to string (e.g. numbers)', () => {
    expect(
      resolveSource({ type: 'schema', fieldKey: 'travelers' }, { travelers: 3 }, {}),
    ).toEqual({ kind: 'value', value: '3' });
  });
});

describe('adminOr', () => {
  it('returns default value when there is no override', () => {
    const r = adminOr('registration', 'nationality', {}, null, null, 'United States');
    expect(r).toEqual({ value: 'United States', source: 'default' });
  });

  it('coerces numeric default to string', () => {
    const r = adminOr('registration', 'travelers', {}, null, null, 42);
    expect(r).toEqual({ value: '42', source: 'default' });
  });

  it('returns null/default when defaultValue is undefined/null/empty', () => {
    for (const d of [undefined, null, '']) {
      const r = adminOr('x', 'y', {}, null, null, d as any);
      expect(r).toEqual({ value: null, source: 'default' });
    }
  });

  it('applies an admin hardcoded override', () => {
    const r = adminOr(
      'registration', 'passportType',
      { 'registration.passportType': { type: 'hardcoded', value: 'DIPLOMATIC' } },
      null, null, 'ORDINARY',
    );
    expect(r).toEqual({ value: 'DIPLOMATIC', source: 'admin' });
  });

  it('applies an admin schema override reading from traveler', () => {
    const r = adminOr(
      'personal', 'firstName',
      { 'personal.firstName': { type: 'schema', fieldKey: 'lastName' } },
      { firstName: 'Jane', lastName: 'Doe' },
      {},
      'default-value',
    );
    expect(r).toEqual({ value: 'Doe', source: 'admin' });
  });

  it('returns manual when admin selected manual', () => {
    const r = adminOr(
      'registration', 'captcha',
      { 'registration.captcha': { type: 'manual' } },
      {}, {}, 'ignored',
    );
    expect(r).toEqual({ value: null, source: 'manual' });
  });

  it('returns skip when admin selected skip', () => {
    const r = adminOr(
      'registration', 'declarationCheck',
      { 'registration.declarationCheck': { type: 'skip' } },
      {}, {}, 'true',
    );
    expect(r).toEqual({ value: null, source: 'skip' });
  });

  it('falls through to skip when schema override points at missing data', () => {
    // Admin mapped nationality ← traveler.nonexistentKey. Traveler has no such key.
    const r = adminOr(
      'registration', 'nationality',
      { 'registration.nationality': { type: 'schema', fieldKey: 'nonexistent' } },
      { firstName: 'Jane' }, {}, 'United States',
    );
    expect(r).toEqual({ value: null, source: 'skip' });
  });
});

describe('sourceTag', () => {
  it('emits the expected tag per source', () => {
    expect(sourceTag('admin')).toBe(' (admin override)');
    expect(sourceTag('manual')).toBe(' (manual — waiting)');
    expect(sourceTag('skip')).toBe(' (skipped by admin)');
    expect(sourceTag('default')).toBe('');
  });
});

describe('createBotRunLogger', () => {
  it('creates a run and returns a logger bound to the new id', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_42' });

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1', country: 'india' });
    expect(logger.runId).toBe('run_42');
    expect(prisma.botRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'ord_1',
        country: 'INDIA',
        status: 'running',
      }),
    });
  });

  it('defaults country to INDIA when not given', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_x' });
    await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    expect(prisma.botRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ country: 'INDIA' }),
    });
  });

  it('writes an entry with truncation for very long values', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRunEntry.create.mockResolvedValue({});

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    const huge = 'x'.repeat(20_000);
    await logger.log({
      stepKey: 'registration', fieldKey: 'email',
      label: 'Email', action: 'fill', source: 'admin',
      value: huge,
    });

    const arg = prisma.botRunEntry.create.mock.calls[0][0];
    expect(arg.data.runId).toBe('run_1');
    expect(arg.data.value!.length).toBe(10_000);
    expect(arg.data.success).toBe(true); // default when not given
  });

  it('coerces nullable fields sensibly when not provided', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRunEntry.create.mockResolvedValue({});

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    await logger.log({
      stepKey: 's', fieldKey: 'f', label: 'L', action: 'skip', source: 'skip',
    });

    const { data } = prisma.botRunEntry.create.mock.calls[0][0];
    expect(data.value).toBeNull();
    expect(data.errorMsg).toBeNull();
    expect(data.selector).toBeNull();
  });

  it('finish() marks status=completed with timestamp by default', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRun.update.mockResolvedValue({});

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    await logger.finish();

    const arg = prisma.botRun.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'run_1' });
    expect(arg.data.status).toBe('completed');
    expect(arg.data.finishedAt).toBeInstanceOf(Date);
    expect(arg.data.errorMsg).toBeNull();
  });

  it('finish() marks status=failed when given an error', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRun.update.mockResolvedValue({});

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    await logger.finish({ error: 'Playwright timeout' });

    const { data } = prisma.botRun.update.mock.calls[0][0];
    expect(data.status).toBe('failed');
    expect(data.errorMsg).toBe('Playwright timeout');
  });

  it('finish() marks status=cancelled when cancelled', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRun.update.mockResolvedValue({});

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    await logger.finish({ cancelled: true });

    const { data } = prisma.botRun.update.mock.calls[0][0];
    expect(data.status).toBe('cancelled');
  });

  it('returns a silent no-op logger when run creation fails', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockRejectedValue(new Error('db down'));

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    expect(logger.runId).toBe('local-only');
    // log + finish should not throw even though create failed
    await expect(
      logger.log({ stepKey: 's', fieldKey: 'f', label: 'L', action: 'fill', source: 'admin' }),
    ).resolves.toBeUndefined();
    await expect(logger.finish()).resolves.toBeUndefined();
    // And we shouldn't attempt to talk to the DB anymore
    expect(prisma.botRunEntry.create).not.toHaveBeenCalled();
    expect(prisma.botRun.update).not.toHaveBeenCalled();
  });

  it('swallows log errors after successful init', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRunEntry.create.mockRejectedValue(new Error('boom'));

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    await expect(
      logger.log({ stepKey: 's', fieldKey: 'f', label: 'L', action: 'fill', source: 'admin' }),
    ).resolves.toBeUndefined();
  });

  it('swallows finish errors after successful init', async () => {
    const prisma = makeMockPrisma();
    prisma.botRun.create.mockResolvedValue({ id: 'run_1' });
    prisma.botRun.update.mockRejectedValue(new Error('boom'));

    const logger = await createBotRunLogger(prisma as any, { orderId: 'ord_1' });
    await expect(logger.finish()).resolves.toBeUndefined();
  });
});
