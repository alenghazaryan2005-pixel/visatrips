/**
 * Resolve a built-in email template with admin overrides from the Settings
 * store. Keys used:
 *   email.<code>.subject     (string)
 *   email.<code>.html        (raw HTML override — takes precedence)
 *   email.<code>.structured  (JSON StructuredEmail override)
 *
 * Falls back to STRUCTURED_DEFAULTS[code] when nothing is overridden.
 *
 * Returns { subject, html } ready to pass to sendEmail.
 */

import { prisma } from '@/lib/prisma';
import {
  renderStructured,
  interpolate,
  STRUCTURED_DEFAULTS,
  type StructuredEmail,
} from '@/lib/email/renderer';

export async function resolveBuiltInEmail(
  code: string,
  vars: Record<string, any>,
): Promise<{ subject: string; html: string }> {
  const def = STRUCTURED_DEFAULTS[code];
  if (!def) throw new Error(`Unknown email template code: ${code}`);

  const keys = [`email.${code}.subject`, `email.${code}.html`, `email.${code}.structured`];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map(r => {
    let parsed: any = r.value;
    try { parsed = JSON.parse(r.value); } catch {}
    return [r.key, parsed];
  }));

  const subjOverride = map.get(`email.${code}.subject`) as string | undefined;
  const htmlOverride = map.get(`email.${code}.html`) as string | undefined;
  const structOverride = map.get(`email.${code}.structured`) as StructuredEmail | undefined;

  const subject = interpolate((subjOverride && String(subjOverride).trim()) || def.subject, vars);

  if (htmlOverride && String(htmlOverride).trim()) {
    return { subject, html: interpolate(String(htmlOverride), vars) };
  }
  const structured = structOverride || def.structured;
  return { subject, html: renderStructured(structured, vars) };
}
