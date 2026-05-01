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
  UserCog,
  LogOut,
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
  | 'theme'
  | 'employees'
  | 'errors';

/** Items / children whose `ownerOnly: true` are hidden for employee accounts. */
type OwnerGate = { ownerOnly?: boolean };

interface AdminSidebarProps {
  /** Which top-level nav item to highlight as active. */
  active?: AdminNavKey;
  /** Hide auto-fetching of the error count (caller already has it). */
  errorCountOverride?: number;
}

interface NavChild extends OwnerGate {
  key: string;
  label: string;
  href: string;
  Icon?: LucideIcon;
}

interface NavItem extends OwnerGate {
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
      // Settings (prices/emails/etc.) — application configuration that
      // affects every customer. Owner-only.
      { key: 'settings', Icon: SettingsIcon, label: 'Settings', href: '/admin/settings', description: 'Prices, emails, statuses', ownerOnly: true },
      // Color Palette — per-user theme; every admin can personalise their
      // own panel. Sibling of Settings, not a child.
      { key: 'theme', Icon: Palette, label: 'Color Palette', href: '/admin/theme', description: 'Personalize the admin panel for your account' },
      // Admin Users — manage owner / employee accounts. Owner-only.
      { key: 'employees', Icon: UserCog, label: 'Admin Users', href: '/admin/employees', description: 'Manage owner + employee accounts', ownerOnly: true },
      { key: 'errors',   Icon: AlertTriangle,  label: 'Error Logs', href: '/admin/errors',   description: 'Unresolved errors' },
    ],
  },
];

export function AdminSidebar({ active, errorCountOverride }: AdminSidebarProps) {
  const [errorCount, setErrorCount] = useState<number>(errorCountOverride ?? 0);
  // Role drives owner-only nav items (Admin Users + Color Palette under
  // Settings). Defaults to 'employee' so owner-only items don't flash on
  // the screen during the first render before the session check resolves.
  const [role, setRole] = useState<'owner' | 'employee'>('employee');
  const [name, setName] = useState<string>('');
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.role === 'owner') setRole('owner');
          if (typeof data.name === 'string') setName(data.name);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

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

  const isOwner = role === 'owner';

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
            {section.items.filter(item => isOwner || !item.ownerOnly).map(item => {
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
                  {/* Persistent nested child items (always visible, modulo ownerOnly). */}
                  {item.children?.filter(c => isOwner || !c.ownerOnly).map(child => {
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

      {/* Identity + sign-out footer. Pinned at the bottom of the sidebar
          (the parent <aside> is a flex column; .admin-nav has flex-1 above
          so this naturally sticks to the bottom). */}
      <div className="admin-sidebar-footer">
        {name && (
          <div className="admin-sidebar-identity">
            <div className="admin-sidebar-identity-name">{name}</div>
            <div className="admin-sidebar-identity-role">
              {isOwner ? '👑 Owner' : 'Employee'}
            </div>
          </div>
        )}
        <button className="admin-logout-btn" onClick={handleLogout} title="Sign out of the admin panel">
          <LogOut size={14} strokeWidth={2.25} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
