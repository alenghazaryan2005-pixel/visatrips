'use client';

/**
 * Simplified sidebar for CRM pages served on the support subdomain
 * (see middleware.ts + scripts/dev-support-proxy.ts). The full nav
 * from AdminSidebar doesn't belong here — the support subdomain is
 * scoped to CRM work, and cross-origin sidebar links create their
 * own set of edge cases. So this version shows only:
 *
 *   Top     — VisaTrips® Support branding
 *   Body    — a single "Back to Admin Panel" link that jumps to the
 *             primary admin origin (env-aware, see PRIMARY_BASE)
 *   Bottom  — signed-in identity + sign-out
 *
 * `PRIMARY_BASE` mirrors the CRM_BASE constant in AdminSidebar.tsx:
 *   dev build  → http://localhost:3000
 *   prod build → https://visatrips.vercel.app
 *   override   → NEXT_PUBLIC_APP_URL beats both
 *
 * When visatrips.com is eventually attached to the Vercel project,
 * set NEXT_PUBLIC_APP_URL=https://visatrips.com in the Vercel env
 * so the back button jumps to the real domain — no code change.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, LogOut } from 'lucide-react';
import { PRIMARY_BASE } from '@/lib/urls';

export function CrmSidebar() {
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<'owner' | 'employee'>('employee');

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
    // Send them home on the primary origin — logging out on the CRM
    // subdomain and landing on the CRM's own login flow would be
    // confusing (they came here from the admin panel; that's where
    // they belong after signing out).
    window.location.href = `${PRIMARY_BASE}/admin`;
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
        <Link
          href={`${PRIMARY_BASE}/admin`}
          className="admin-nav-item"
          style={{
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '0.55rem',
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
