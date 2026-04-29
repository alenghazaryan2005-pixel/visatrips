/**
 * Server component that reads the active theme from the DB and renders an
 * inline <style> block in <head>. Loaded after globals.css so the :root
 * declarations here win.
 *
 * `force-dynamic` on this isn't possible (it's not a route), but rendering
 * inside RootLayout (which we mark as runtime='nodejs', dynamic='force-dynamic'
 * via the imported Setting model) ensures it re-evaluates each request. Read
 * failures fall back to DEFAULT_THEME so a DB outage doesn't break the page.
 */

import { generateThemeCSS } from '@/lib/theme';
import { getActiveTheme } from '@/lib/theme-server';

export async function ThemeStyleInjector() {
  let css = '';
  try {
    const colors = await getActiveTheme();
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
