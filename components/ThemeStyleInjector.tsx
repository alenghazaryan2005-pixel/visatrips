/**
 * Server component that reads the active theme from the DB and renders an
 * inline <style> block. Mounted ONLY in app/admin/layout.tsx — not in the
 * root layout — so the palette customization is scoped to admin pages. The
 * customer-facing pages always use the un-themed brand defaults declared
 * in globals.css.
 *
 * The <style> sits in the body (not <head>) when admin routes render, but
 * CSS custom properties on :root cascade to every descendant of <html>
 * regardless of where the declaration appears in the document, so all
 * admin UI picks up the override. Loaded after globals.css → admin theme
 * wins.
 *
 * Read failures fall back to DEFAULT_THEME so a DB outage doesn't break
 * the admin panel.
 */

import { generateThemeCSS } from '@/lib/theme';
import { getActiveTheme } from '@/lib/theme-server';
import { getAdminSession } from '@/lib/auth';

export async function ThemeStyleInjector() {
  let css = '';
  try {
    // Per-user theme: pick up the calling admin's email from the session
    // cookie so each admin sees their own palette. Guests / un-authed (which
    // shouldn't happen since this only mounts under app/admin/layout.tsx)
    // get the legacy / default theme.
    const session = await getAdminSession();
    const colors = await getActiveTheme(session?.email ?? null);
    css = generateThemeCSS(colors);
  } catch {
    // Silent — globals.css fallback applies.
    return null;
  }
  return (
    <style
      id="theme-active"
      // eslint-disable-next-line react/no-danger -- we generate the value ourselves
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
