// @vitest-environment jsdom
/**
 * Tests for lib/customStatuses.tsx — custom-status provider, hook, and badge.
 *
 * Covers: color resolution (named palette + hex alpha mixing), provider fetch,
 * getLabel/getBadgeClass/getBadgeStyle for built-in + custom statuses,
 * <StatusBadge/> rendering, and the out-of-provider fallback hook.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  resolveStatusColor,
  CustomStatusesProvider,
  useCustomStatuses,
  StatusBadge,
} from '@/lib/customStatuses';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('resolveStatusColor', () => {
  it('returns the slate palette for null / undefined', () => {
    expect(resolveStatusColor(null)).toEqual({ bg: '#e2e8f0', fg: '#334155' });
    expect(resolveStatusColor(undefined)).toEqual({ bg: '#e2e8f0', fg: '#334155' });
    expect(resolveStatusColor('')).toEqual({ bg: '#e2e8f0', fg: '#334155' });
  });

  it('returns the matching named palette', () => {
    expect(resolveStatusColor('blue')).toEqual({ bg: '#dbeafe', fg: '#1e40af' });
    expect(resolveStatusColor('green')).toEqual({ bg: '#d1fae5', fg: '#065f46' });
    expect(resolveStatusColor('amber')).toEqual({ bg: '#fef3c7', fg: '#92400e' });
  });

  it('falls back to slate for unknown names', () => {
    expect(resolveStatusColor('mauve')).toEqual({ bg: '#e2e8f0', fg: '#334155' });
  });

  it('renders a hex with 10%-alpha background', () => {
    expect(resolveStatusColor('#8b5cf6')).toEqual({ bg: '#8b5cf61A', fg: '#8b5cf6' });
  });

  it('rejects 3-digit hex (needs full 6-digit) and falls back to slate', () => {
    // HEX_RE is `^#([0-9a-fA-F]{6})$`
    expect(resolveStatusColor('#abc')).toEqual({ bg: '#e2e8f0', fg: '#334155' });
  });
});

describe('<CustomStatusesProvider> + useCustomStatuses', () => {
  function Peek({ code }: { code: string }) {
    const { loading, getLabel, getBadgeClass, getBadgeStyle } = useCustomStatuses();
    const style = getBadgeStyle(code);
    return (
      <div>
        <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
        <span data-testid="label">{getLabel(code)}</span>
        <span data-testid="class">{getBadgeClass(code)}</span>
        <span data-testid="style">{JSON.stringify(style)}</span>
      </div>
    );
  }

  it('resolves built-in statuses even while fetch is pending', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    expect(screen.getByTestId('loading').textContent).toBe('yes');
    expect(screen.getByTestId('label').textContent).toBe('Processing');
    expect(screen.getByTestId('class').textContent).toContain('status-review');
    expect(screen.getByTestId('style').textContent).toBe('{}');
  });

  it('resolves custom statuses once the fetch resolves', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        statuses: [
          {
            id: 'cust_1',
            country: 'INDIA',
            code: 'AWAITING_REFUND',
            label: 'Awaiting Refund',
            color: '#8b5cf6',
            description: null,
            sortOrder: 0,
          },
        ],
      }),
    });

    render(
      <CustomStatusesProvider>
        <Peek code="AWAITING_REFUND" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('label').textContent).toBe('Awaiting Refund');
    expect(screen.getByTestId('class').textContent).toBe('admin-status admin-status-custom');
    expect(screen.getByTestId('style').textContent).toContain('#8b5cf6');
    expect(screen.getByTestId('style').textContent).toContain('#8b5cf61A');
  });

  it('returns empty label for empty code', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ statuses: [] }) });
    render(
      <CustomStatusesProvider>
        <Peek code="" />
      </CustomStatusesProvider>,
    );
    expect(screen.getByTestId('label').textContent).toBe('');
    expect(screen.getByTestId('class').textContent).toBe('');
  });

  it('pretty-prints unknown codes via underscore-strip', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ statuses: [] }) });
    render(
      <CustomStatusesProvider>
        <Peek code="SOME_NEW_STATUS" />
      </CustomStatusesProvider>,
    );
    expect(screen.getByTestId('label').textContent).toBe('SOME NEW STATUS');
  });

  it('tolerates a fetch failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('label').textContent).toBe('Processing'); // built-in fallback
  });
});

describe('built-in status overrides + tombstones', () => {
  function Peek({ code }: { code: string }) {
    const { loading, getLabel, getDescription, getBadgeClass, getBadgeStyle, isDeletedBuiltIn } = useCustomStatuses();
    return (
      <div>
        <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
        <span data-testid="label">{getLabel(code)}</span>
        <span data-testid="description">{getDescription(code)}</span>
        <span data-testid="class">{getBadgeClass(code)}</span>
        <span data-testid="style">{JSON.stringify(getBadgeStyle(code))}</span>
        <span data-testid="deleted">{String(isDeletedBuiltIn(code))}</span>
      </div>
    );
  }

  /**
   * The provider fires two fetches in parallel: /api/settings/custom-statuses
   * and /api/settings. This helper routes by URL so each test can specify
   * just the data it cares about.
   */
  function routedFetch(opts: { customStatuses?: any[]; settings?: Record<string, any> }) {
    return (url: string) => {
      if (url.includes('/api/settings/custom-statuses')) {
        return Promise.resolve({ ok: true, json: async () => ({ statuses: opts.customStatuses ?? [] }) });
      }
      if (url === '/api/settings' || url.endsWith('/api/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ settings: opts.settings ?? {}, defaults: {} }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    };
  }

  it('admin label override on a built-in is honored', async () => {
    fetchMock.mockImplementation(routedFetch({
      settings: { 'status.labels': { PROCESSING: 'In Review' } },
    }));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('label').textContent).toBe('In Review');
  });

  it('admin color override on a built-in switches to inline-style + custom class', async () => {
    fetchMock.mockImplementation(routedFetch({
      settings: { 'status.colors': { PROCESSING: '#8b5cf6' } },
    }));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    // No longer the legacy CSS class — uses the custom-style path
    expect(screen.getByTestId('class').textContent).toBe('admin-status admin-status-custom');
    expect(screen.getByTestId('style').textContent).toContain('#8b5cf6');
    expect(screen.getByTestId('style').textContent).toContain('#8b5cf61A'); // 10% bg
  });

  it('admin description override is exposed via getDescription', async () => {
    fetchMock.mockImplementation(routedFetch({
      settings: { 'status.descriptions': { PROCESSING: "We're reviewing your application" } },
    }));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('description').textContent).toBe("We're reviewing your application");
  });

  it('tombstoned built-in: isDeletedBuiltIn returns true; label still resolves (existing orders keep rendering)', async () => {
    fetchMock.mockImplementation(routedFetch({
      settings: { 'status.deleted': ['ON_HOLD'] },
    }));
    render(
      <CustomStatusesProvider>
        <Peek code="ON_HOLD" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('deleted').textContent).toBe('true');
    // We still resolve a label so existing orders with this code don't render blank
    expect(screen.getByTestId('label').textContent).toBe('On Hold');
  });

  it('non-tombstoned codes: isDeletedBuiltIn returns false', async () => {
    fetchMock.mockImplementation(routedFetch({
      settings: { 'status.deleted': ['ON_HOLD'] },
    }));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('deleted').textContent).toBe('false');
  });

  it('settings-fetch failure leaves the provider in a sane no-overrides state', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/settings/custom-statuses')) {
        return Promise.resolve({ ok: true, json: async () => ({ statuses: [] }) });
      }
      return Promise.reject(new Error('settings down'));
    });
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('label').textContent).toBe('Processing'); // built-in default
    expect(screen.getByTestId('deleted').textContent).toBe('false');
  });

  it('non-string status.labels/colors values are silently ignored', async () => {
    fetchMock.mockImplementation(routedFetch({
      // Hostile shapes — provider should ignore, not crash
      settings: { 'status.labels': 'not an object', 'status.colors': null, 'status.deleted': 'not an array' as any },
    }));
    render(
      <CustomStatusesProvider>
        <Peek code="PROCESSING" />
      </CustomStatusesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'));
    expect(screen.getByTestId('label').textContent).toBe('Processing');
    expect(screen.getByTestId('deleted').textContent).toBe('false');
  });
});

describe('useCustomStatuses outside a provider', () => {
  function Peek({ code }: { code: string }) {
    const { getLabel, getBadgeClass, getBadgeStyle } = useCustomStatuses();
    return (
      <div>
        <span data-testid="label">{getLabel(code)}</span>
        <span data-testid="class">{getBadgeClass(code)}</span>
        <span data-testid="style">{JSON.stringify(getBadgeStyle(code))}</span>
      </div>
    );
  }

  it('uses built-in label + class + empty style', () => {
    render(<Peek code="SUBMITTED" />);
    expect(screen.getByTestId('label').textContent).toBe('Submitted');
    expect(screen.getByTestId('class').textContent).toContain('status-submitted');
    expect(screen.getByTestId('style').textContent).toBe('{}');
  });
});

describe('<StatusBadge>', () => {
  it('renders the label inside a span with the right class', () => {
    render(<StatusBadge code="PROCESSING" />);
    const el = screen.getByText('Processing');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('status-review');
  });
});
