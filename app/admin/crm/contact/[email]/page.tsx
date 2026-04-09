'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { formatOrderNum } from '@/lib/constants';

interface Order {
  id: string;
  orderNumber: number;
  status: string;
  destination: string;
  visaType: string;
  totalUSD: number;
  createdAt: string;
  billingEmail: string;
  travelers: string;
}

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#B45309', UNDER_REVIEW: '#4338CA', APPROVED: '#065F46', REJECTED: '#991B1B',
  REFUNDED: '#6B7280', ON_HOLD: '#B45309', NEEDS_CORRECTION: '#DC2626',
};

export default function ContactPage({ params }: { params: Promise<{ email: string }> }) {
  const { email: rawEmail } = use(params);
  const email = decodeURIComponent(rawEmail);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactName, setContactName] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/orders').then(r => r.ok ? r.json() : []),
      fetch('/api/tickets').then(r => r.ok ? r.json() : []),
    ]).then(([allOrders, allTickets]) => {
      // Filter orders by email (billing or traveler)
      const matched = allOrders.filter((o: any) => {
        if (o.billingEmail.toLowerCase() === email.toLowerCase()) return true;
        try {
          const t = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers);
          return t.some((tr: any) => tr.email?.toLowerCase() === email.toLowerCase());
        } catch { return false; }
      });
      setOrders(matched);

      // Get name from first order's traveler
      if (matched.length > 0) {
        try {
          const t = JSON.parse(matched[0].travelers);
          if (t[0]?.firstName) setContactName(`${t[0].firstName} ${t[0].lastName || ''}`.trim());
        } catch {}
      }

      // Filter tickets by email
      setTickets(allTickets.filter((t: any) => t.contactEmail.toLowerCase() === email.toLowerCase()));
      setLoading(false);
    });
  }, [email]);

  const totalSpent = orders.reduce((s, o) => s + o.totalUSD, 0);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin';
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <Link href="/" className="logo" style={{ color: 'white', fontSize: '1rem' }}>VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup></Link>
          <span className="admin-sidebar-badge">Admin</span>
        </div>
        <nav className="admin-nav">
          <Link href="/admin" className="admin-nav-item" style={{ textDecoration: 'none' }}>📋 Orders</Link>
          <Link href="/admin/crm" className="admin-nav-item active" style={{ textDecoration: 'none' }}>💬 CRM</Link>
        </nav>
        <button className="admin-logout-btn" onClick={handleLogout}>← Sign Out</button>
      </aside>

      <div className="admin-main" style={{ maxWidth: '100%' }}>
        {loading ? (
          <div className="admin-empty">Loading contact...</div>
        ) : (
          <>
            <Link href="/admin/crm" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>← Back to CRM</Link>

            {/* Contact Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                {(contactName || email).charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>{contactName || email}</h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--slate)' }}>{email}</p>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ background: 'var(--sky)', padding: '1rem 1.5rem', borderRadius: '1rem', flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Orders</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>{orders.length}</div>
              </div>
              <div style={{ background: 'var(--sky)', padding: '1rem 1.5rem', borderRadius: '1rem', flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spent</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--blue)' }}>${totalSpent.toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--sky)', padding: '1rem 1.5rem', borderRadius: '1rem', flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tickets</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>{tickets.length}</div>
              </div>
            </div>

            {/* Orders */}
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--ink)' }}>Orders</h2>
            {orders.length === 0 ? (
              <p style={{ color: 'var(--slate)', fontSize: '0.88rem' }}>No orders found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
                {orders.map(o => {
                  let travelerName = '';
                  try { const t = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers); travelerName = `${t[0]?.firstName || ''} ${t[0]?.lastName || ''}`.trim(); } catch {}
                  return (
                    <Link key={o.id} href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--cloud)',
                      textDecoration: 'none', color: 'var(--ink)', transition: 'border-color 0.15s',
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--blue)', marginRight: '0.5rem' }}>#{formatOrderNum(o.orderNumber)}</span>
                        <span>{o.destination} — {travelerName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 600, background: `${STATUS_COLORS[o.status] || '#6B7280'}15`, color: STATUS_COLORS[o.status] || '#6B7280' }}>
                          {o.status.replace('_', ' ')}
                        </span>
                        <span style={{ fontWeight: 600 }}>${o.totalUSD}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>{new Date(o.createdAt).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Tickets */}
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--ink)' }}>Support Tickets</h2>
            {tickets.length === 0 ? (
              <p style={{ color: 'var(--slate)', fontSize: '0.88rem' }}>No tickets found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tickets.map(t => (
                  <Link key={t.id} href={`/admin/crm/${t.id}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--cloud)',
                    textDecoration: 'none', color: 'var(--ink)', transition: 'border-color 0.15s',
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, marginRight: '0.5rem' }}>#{t.ticketNumber}</span>
                      <span>{t.subject}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase' }}>{t.status}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>{new Date(t.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
