import type { Metadata } from 'next';
import { Sora, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { CustomizationApplier } from '@/components/editor/CustomizationApplier';
import { SiteEditor } from '@/components/editor/SiteEditor';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VisaTrips — Travel Further. Wait Less.',
  description:
    'Official E-Visa Service by VisaTrips. Fast, secure electronic visa applications for tourist, business, student & work visas in 80+ countries. 72hr average processing, 98.7% approval rate.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
        {/* Theme tokens (the admin /admin/theme palette) are NOT injected here —
            they're injected only under app/admin/layout.tsx so the theme
            customization stays scoped to the admin panel. The customer-facing
            pages always use the brand defaults declared in globals.css. */}
      </head>
      <body className={`${sora.variable} ${jakarta.variable}`}>
        {/* Page customizations runtime — applies published customizations
            on every page (visitors and admins). Owner drafts also flow
            through here so the editor reflects pending edits. */}
        <CustomizationApplier />
        {/* Floating "Customize" overlay — only renders for owner accounts.
            Mounts on every page so owners can edit landing pages, the
            admin panel, customer flows, anything. */}
        <SiteEditor />
        {children}
      </body>
    </html>
  );
}
