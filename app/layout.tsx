import type { Metadata } from 'next';
import { Sora, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ThemeStyleInjector } from '@/components/ThemeStyleInjector';
import { ThemeWatcher } from '@/components/ThemeWatcher';

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
        {/* Active theme — overrides brand tokens declared in globals.css. */}
        <ThemeStyleInjector />
      </head>
      <body className={`${sora.variable} ${jakarta.variable}`}>
        {/* Live theme push — subscribes to /api/theme/stream and re-applies
            :root colors when an admin saves a new palette. */}
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
