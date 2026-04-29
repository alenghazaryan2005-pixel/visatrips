'use client';

/**
 * Shared admin sidebar — renders identical navigation on every admin page
 * so sub-sections (Customer Accounts / Refunds / Abandoned / etc.) stay
 * visible everywhere. Sub-sections are driven by URL query params
 * (/admin?section=customers) so they can be linked to from any page.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import {
  ClipboardList,
  Users,
  Undo2,
  Ban,
  Archive,
  Mail,
  Settings as SettingsIcon,
  AlertTriangle,
  FileText,
  Palette,
  ToggleRight,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavKey =
  | 'orders'
  | 'customers'
  | 'refunds'
  | 'abandoned'
  | 'archive'
  | 'emails'
  | 'settings'
  | 'errors';

interface AdminSidebarProps {
  /** Which top-level nav item to highlight as active. */
  active?: AdminNavKey;
  /** Hide auto-fetching of the error count (caller already has it). */
  errorCountOverride?: number;
}

interface NavChild {
  key: string;
  label: string;
  href: string;
  Icon?: LucideIcon;
}

interface NavItem {
  key: AdminNavKey;
  Icon: LucideIcon;
  label: string;
  href: string;
  description?: string;
  /** Persistent child items always rendered under this parent. */
  children?: NavChild[];
}

const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Orders',
    items: [
      { key: 'orders',    Icon: ClipboardList, label: 'Orders',            href: '/admin',                     description: 'All visa orders' },
      { key: 'customers', Icon: Users,         label: 'Customer Accounts', href: '/admin?section=customers',   description: 'Customer directory' },
      { key: 'refunds',   Icon: Undo2,         label: 'Refunds',           href: '/admin?section=refunds',     description: 'Refunded orders' },
      { key: 'abandoned', Icon: Ban,           label: 'Abandoned',         href: '/admin?section=abandoned',   description: 'Checkouts that bailed' },
      { key: 'archive',   Icon: Archive,       label: 'Archive',           href: '/admin?section=archive',     description: 'Archived completed orders' },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        key: 'emails', Icon: Mail, label: 'Customer Emails', href: '/admin/crm', description: 'Customer communications',
        children: [
          { key: 'canned', label: 'Canned Responses', href: '/admin/crm/canned', Icon: FileText },
        ],
      },
      // Country-specific settings pages (India, Turkey, …) are NOT listed here —
      // they'd clutter the sidebar. Pick a country from the /admin/settings landing.
      {
        key: 'settings', Icon: SettingsIcon, label: 'Settings', href: '/admin/settings', description: 'Prices, emails, statuses',
        children: [
          { key: 'theme',    label: 'Color Palette', href: '/admin/theme',    Icon: Palette },
          { key: 'features', label: 'Features',      href: '/admin/features', Icon: ToggleRight },
        ],
      },
      { key: 'errors',   Icon: AlertTriangle,  label: 'Error Logs', href: '/admin/errors',   description: 'Unresolved errors' },
    ],
  },
];

export function AdminSidebar({ active, errorCountOverride }: AdminSidebarProps) {
  const [errorCount, setErrorCount] = useState<number>(errorCountOverride ?? 0);
  const pathname = usePathname();

  // Auto-fetch unresolved error count once per minute if caller didn't provide one.
  useEffect(() => {
    if (errorCountOverride !== undefined) return;
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/errors?resolved=false&limit=1');
        if (res.ok && !cancelled) {
          const d = await res.json();
          setErrorCount(d.counts?.unresolved || 0);
        }
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [errorCountOverride]);

  useEffect(() => {
    if (errorCountOverride !== undefined) setErrorCount(errorCountOverride);
  }, [errorCountOverride]);

  const handleLogout = async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch {}
    window.location.href = '/admin';
  };

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <Link href="/" className="logo" style={{ color: 'white', fontSize: '1rem' }}>
          VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup>
        </Link>
        <span className="admin-sidebar-badge">Admin</span>
      </div>
      <nav className="admin-nav">
        {NAV_SECTIONS.map((section, i) => (
          <Fragment key={section.label}>
            <div
              className="admin-nav-section-label"
              style={{ marginTop: i === 0 ? 0 : '0.75rem' }}
            >
              {section.label}
            </div>
            {section.items.map(item => {
              const isActive = active === item.key;
              const isErrors = item.key === 'errors';
              return (
                <Fragment key={item.key}>
                  <Link
                    href={item.href}
                    title={item.description}
                    className={`admin-nav-item${isActive ? ' active' : ''}`}
                    style={{
                      textDecoration: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
                      <item.Icon size={16} strokeWidth={2} />
                      <span>{item.label}</span>
                    </span>
                    {isErrors && errorCount > 0 && (
                      <span style={{
                        background: '#dc2626', color: 'white', borderRadius: '999px',
                        padding: '0.1rem 0.5rem', fontSize: '0.7rem', fontWeight: 700,
                        minWidth: '20px', textAlign: 'center',
                      }}>
                        {errorCount > 99 ? '99+' : errorCount}
                      </span>
                    )}
                  </Link>
                  {/* Persistent nested child items (always visible) */}
                  {item.children?.map(child => {
                    const isChildActive = pathname === child.href;
                    const ChildIcon = child.Icon;
                    return (
                      <Link
                        key={child.key}
                        href={child.href}
                        className={`admin-nav-item${isChildActive ? ' active' : ''}`}
                        style={{
                          textDecoration: 'none',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          paddingLeft: '2rem', fontSize: '0.82rem',
                        }}
                      >
                        {ChildIcon && <ChildIcon size={14} strokeWidth={2} />}
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </nav>
      <button className="admin-logout-btn" onClick={handleLogout}>← Sign Out</button>
    </aside>
  );
}
