/**
 * Admin-only layout. The theme customization (admin /admin/theme) is mounted
 * here, NOT in the root layout, so the palette only affects pages rendered
 * under `/admin/*` — every customer-facing page (/, /apply, /india, /status,
 * etc.) always renders with the un-themed brand defaults declared in
 * globals.css.
 *
 * The injected <style> overrides :root tokens; CSS custom properties
 * defined that way still cascade to every descendant of <html>, but since
 * Next.js only renders this layout for admin routes, the override only
 * exists on admin requests. Customer routes never include the override
 * <style> block at all.
 */

import { ThemeStyleInjector } from '@/components/ThemeStyleInjector';
import { ThemeWatcher } from '@/components/ThemeWatcher';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Inline <style id="theme-active"> with the admin's saved palette.
          Async server component — awaited at request time. */}
      <ThemeStyleInjector />
      {/* SSE subscriber — listens to /api/theme/stream and re-applies the
          palette to :root inline styles whenever an admin clicks Save Theme,
          so other open admin tabs repaint without a manual refresh. */}
      <ThemeWatcher />
      {children}
    </>
  );
}
