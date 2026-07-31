'use client';

/**
 * Simplified sidebar for CRM pages served on the support subdomain
 * (see middleware.ts + scripts/dev-support-proxy.ts). Employees on
 * the primary admin panel don't see Canned Responses in the nav
 * anymore — they see just "Inbox" that jumps here. Once here, the
 * CRM's own tools (Inbox + Canned Responses) live in this sidebar,
 * and "Back to Admin Panel" is the escape hatch.
 *
 *   Top     — VisaTrips® Support badge
 *   Body    — Inbox, Canned Responses (nav for CRM tools)
 *           — Back to Admin Panel (escape hatch, visually separated)
 *   Bottom  — signed-in identity + Sign out
 *
 * Nav links use RELATIVE URLs (/tickets, /canned) — middleware.ts
 * rewrites those to /admin/crm and /admin/crm/canned when the
 * hostname is the support subdomain, so no origin prefix is
 * needed and the sidebar renders correctly whether we're on
 * localhost:3002 or visatrips-support.vercel.app.
 *
 * Sign-out redirects to PRIMARY_BASE/admin — the CRM origin is a
 * work surface, not a landing surface, and the primary admin is
 * where signed-out employees should be sent.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, LogOut, Inbox, User, Layers, FileText } from 'lucide-react';
import { PRIMARY_BASE } from '@/lib/urls';

/**
 * Views (query-param driven, so all three land on the same route):
 *   Inbox       → /tickets              → tickets whose status ≠ CLOSED
 *   My Tickets  → /tickets?view=mine    → tickets assignedTo the current agent
 *   All Tickets → /tickets?view=all     → every ticket, including closed
 *
 * The view logic itself lives in app/admin/crm/page.tsx; the sidebar
 * just deep-links to the right query state and shows which one is
 * active. matchPrefix values compare against the middleware-rewritten
 * internal path (/admin/crm/...).
 */
type NavItem = {
  label: string;
  href: string;
  Icon: typeof Inbox;
  matchPrefix: string;
  /** Optional query param this entry expects. When set, active state
   *  requires both the path AND the query to match. */
  view?: 'mine' | 'all';
};

const VIEW_NAV: NavItem[] = [
  { label: 'Inbox',       href: '/tickets',            Icon: Inbox,  matchPrefix: '/admin/crm' },
  { label: 'My Tickets',  href: '/tickets?view=mine',  Icon: User,   matchPrefix: '/admin/crm', view: 'mine' },
  { label: 'All Tickets', href: '/tickets?view=all',   Icon: Layers, matchPrefix: '/admin/crm', view: 'all' },
];

const MANAGE_NAV: NavItem[] = [
  { label: 'Canned Responses', href: '/canned', Icon: FileText, matchPrefix: '/admin/crm/canned' },
];

export function CrmSidebar() {
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<'owner' | 'employee'>('employee');
  // Middleware rewrites /tickets → /admin/crm and /canned → /admin/crm/canned
  // before the app sees the path, so `usePathname()` here returns the
  // INTERNAL path (starts with /admin/crm/...) — match against that.
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const currentView = searchParams?.get('view');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (typeof data.name === 'string') setName(data.name);
          if (data.role === 'owner') setRole('owner');
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch {}
    window.location.href = `${PRIMARY_BASE}/admin`;
  };

  // Highlight rules:
  //  - Manage entries (Canned Responses): plain longest-prefix on path.
  //  - View entries (Inbox / My Tickets / All Tickets): all live at the
  //    same path (/admin/crm), so the query-string view param decides
  //    which one lights up. Inbox is active when no view param is set.
  const isActive = (item: NavItem): boolean => {
    const pathMatches = pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + '/');
    if (!pathMatches) return false;
    if (item === VIEW_NAV[0]) {
      // Inbox: only when we're on the tickets list root AND no view param
      return pathname === '/admin/crm' && !currentView;
    }
    if (item.view) return pathname === '/admin/crm' && currentView === item.view;
    // Manage entries: pure prefix match
    return true;
  };

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <Link href={`${PRIMARY_BASE}/admin`} className="logo" style={{ color: 'white', fontSize: '1rem' }}>
          VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup>
        </Link>
        <span className="admin-sidebar-badge">Support</span>
      </div>

      <nav className="admin-nav">
        <div className="admin-nav-section-label">Views</div>
        {VIEW_NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-nav-item${isActive(item) ? ' active' : ''}`}
            style={{
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '0.55rem',
            }}
          >
            <item.Icon size={16} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        ))}

        <div className="admin-nav-section-label" style={{ marginTop: '0.75rem' }}>Manage</div>
        {MANAGE_NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-nav-item${isActive(item) ? ' active' : ''}`}
            style={{
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '0.55rem',
            }}
          >
            <item.Icon size={16} strokeWidth={2} />
            <span>{item.label}</span>
          </Link>
        ))}

        {/* Escape hatch — visually separated so it doesn't read as
            "another CRM section". */}
        <div style={{ margin: '1rem 0 0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
        <Link
          href={`${PRIMARY_BASE}/admin`}
          className="admin-nav-item"
          style={{
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '0.55rem',
            opacity: 0.75,
          }}
        >
          <ChevronLeft size={16} strokeWidth={2} />
          <span>Back to Admin Panel</span>
        </Link>
      </nav>

      <div className="admin-sidebar-footer">
        {name && (
          <div className="admin-sidebar-identity">
            <div className="admin-sidebar-identity-name">{name}</div>
            <div className="admin-sidebar-identity-role">
              {role === 'owner' ? '👑 Owner' : 'Employee'}
            </div>
          </div>
        )}
        <button className="admin-logout-btn" onClick={handleLogout} title="Sign out">
          <LogOut size={14} strokeWidth={2.25} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
