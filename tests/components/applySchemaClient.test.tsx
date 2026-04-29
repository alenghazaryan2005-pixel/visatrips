// @vitest-environment jsdom
/**
 * Tests for lib/applySchemaClient.tsx — <ApplySchemaProvider> + useApplySchema.
 *
 * Provider fetches the schema from /api/settings/application-schema on mount
 * and exposes a getLabel(sectionKey, fieldKey, fallback) helper. We stub
 * global fetch so the tests don't hit the network.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ApplySchemaProvider, useApplySchema } from '@/lib/applySchemaClient';

function Label({ section, field, fallback }: { section: string; field: string; fallback: string }) {
  const { getLabel, loading } = useApplySchema();
  return (
    <div>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="label">{getLabel(section, field, fallback)}</span>
    </div>
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // happy-dom installs its own fetch on globalThis/window. stubGlobal works
  // with Vitest's restoration, but to be safe set both properties explicitly.
  vi.stubGlobal('fetch', fetchMock);
  (globalThis as any).fetch = fetchMock;
  if (typeof window !== 'undefined') (window as any).fetch = fetchMock;
});

describe('<ApplySchemaProvider>', () => {
  it('falls back to the hardcoded label while loading', () => {
    // Return a promise that never resolves so the component stays in loading state
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="firstName" fallback="First & middle name" />
      </ApplySchemaProvider>,
    );
    expect(screen.getByTestId('loading').textContent).toBe('yes');
    expect(screen.getByTestId('label').textContent).toBe('First & middle name');
  });

  it('uses admin override once the schema loads', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        country: 'INDIA',
        sections: [
          {
            key: 'personal',
            title: 'Personal',
            fields: [{ key: 'firstName', label: 'Given name', type: 'text' }],
          },
        ],
      }),
    });

    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="firstName" fallback="First name" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Given name');
  });

  it('falls back to the default when the admin label is empty', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        country: 'INDIA',
        sections: [
          {
            key: 'personal',
            title: 'Personal',
            fields: [{ key: 'firstName', label: '', type: 'text' }],
          },
        ],
      }),
    });
    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="firstName" fallback="Default First" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Default First');
  });

  it('falls back when the section is missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ country: 'INDIA', sections: [] }),
    });
    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="not_there" field="x" fallback="Hardcoded" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Hardcoded');
  });

  it('falls back when the field is missing within a present section', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        country: 'INDIA',
        sections: [{ key: 'personal', title: 'P', fields: [] }],
      }),
    });
    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="nope" fallback="Fallback" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Fallback');
  });

  it('tolerates a fetch failure — stays on fallbacks', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="firstName" fallback="Default" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Default');
  });

  it('tolerates a non-ok HTTP response', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="firstName" fallback="Default" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Default');
  });

  it('tolerates a response without sections', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ country: 'INDIA' }) });
    render(
      <ApplySchemaProvider country="INDIA">
        <Label section="personal" field="firstName" fallback="Default" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'), { timeout: 5000 });
    expect(screen.getByTestId('label').textContent).toBe('Default');
  });

  it('URL-encodes the country query param', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sections: [] }) });
    render(
      <ApplySchemaProvider country="Côte d'Ivoire">
        <Label section="x" field="y" fallback="z" />
      </ApplySchemaProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    // The non-ASCII parts are percent-encoded; ASCII unreserved chars like "'" stay literal.
    expect(url).toContain('C%C3%B4te');
    expect(url).toContain('Ivoire');
  });
});

describe('useApplySchema outside a provider', () => {
  it('returns a stub that always falls back', () => {
    // No <ApplySchemaProvider> wrapper at all — default context applies
    function Consumer() {
      const { getLabel } = useApplySchema();
      return <span data-testid="x">{getLabel('a', 'b', 'fallback-only')}</span>;
    }
    render(<Consumer />);
    expect(screen.getByTestId('x').textContent).toBe('fallback-only');
  });
});
