'use client';

/**
 * Client-side schema accessor for the /apply flow.
 *
 * Fetches /api/settings/application-schema?country=INDIA once on mount and
 * exposes a `getLabel(sectionKey, fieldKey, fallback)` helper so the apply
 * page can honor admin label overrides from the admin Application tab.
 *
 * Intentionally minimal — only labels for now. Hidden/required overrides
 * on the apply page are risky (they'd break existing validation) and need
 * a future pass.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { ApplicationSchema } from '@/lib/applicationSchema';

interface ApplySchemaCtx {
  schema: ApplicationSchema | null;
  loading: boolean;
  /** Look up a field's label override, falling back to the hardcoded default. */
  getLabel: (sectionKey: string, fieldKey: string, fallback: string) => string;
}

const Ctx = createContext<ApplySchemaCtx>({
  schema: null,
  loading: true,
  getLabel: (_s, _f, fallback) => fallback,
});

export function ApplySchemaProvider({ country = 'INDIA', children }: { country?: string; children: ReactNode }) {
  const [schema, setSchema] = useState<ApplicationSchema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/settings/application-schema?country=${encodeURIComponent(country)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && Array.isArray(d.sections)) setSchema(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [country]);

  const getLabel = (sectionKey: string, fieldKey: string, fallback: string): string => {
    if (!schema) return fallback;
    const sec = schema.sections.find(s => s.key === sectionKey);
    if (!sec) return fallback;
    const field = sec.fields.find(f => f.key === fieldKey);
    if (!field) return fallback;
    return field.label || fallback;
  };

  return <Ctx.Provider value={{ schema, loading, getLabel }}>{children}</Ctx.Provider>;
}

export function useApplySchema(): ApplySchemaCtx {
  return useContext(Ctx);
}
