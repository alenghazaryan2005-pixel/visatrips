'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Traveler { firstName: string; lastName: string; email: string; dob?: string; passportCountry?: string; passportNumber?: string; passportExpiry?: string; }

interface Order {
  id:           string;
  orderNumber:  number;
  createdAt:    string;
  destination:  string;
  visaType:     string;
  totalUSD:     number;
  status:       string;
  billingEmail: string;
  travelers:    Traveler[];
  notes:        string | null;
  refundAmount: number | null;
  refundReason: string | null;
  refundedAt:   string | null;
}

import { formatOrderNum, VISA_LABELS, STATUS_COLORS, VISA_COLORS, COUNTRY_FLAGS } from '@/lib/constants';

/* ── Login Screen ──────────────────────────────────────────────────────────── */

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) { onLogin(); }
      else { setError('Invalid email or password.'); }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-bg">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <Link href="/" className="logo" style={{ fontSize: '1.3rem' }}>VisaTrips<sup style={{ color: 'var(--blue)', fontSize: '0.5rem' }}>®</sup></Link>
          <span className="admin-login-badge">Admin</span>
        </div>
        <h1 className="admin-login-title">Sign in to Admin Panel</h1>
        <p className="admin-login-sub">Manage incoming visa applications</p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="ap-field">
            <label className="ap-field-label">Email</label>
            <input className="ap-input" type="email" placeholder="admin@visatrips.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="ap-field">
            <label className="ap-field-label">Password</label>
            <input className="ap-input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="admin-login-error">{error}</p>}
          <button type="submit" className={`apply-submit${email && password ? ' active' : ''}`} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Order Detail Modal ────────────────────────────────────────────────────── */

function OrderModal({ order, onClose, onStatusChange, onNotesChange }: {
  order: Order;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onNotesChange: (id: string, notes: string) => void;
}) {
  const travelers = (() => {
    try {
      const t = order.travelers;
      if (Array.isArray(t)) return t;
      if (typeof t === 'string') return JSON.parse(t);
      return [];
    } catch { return []; }
  })();

  const [notes,    setNotes]    = useState(order.notes ?? '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const date = new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const saveNotes = async () => {
    setSaving(true);
    await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: order.status, notes }),
    });
    onNotesChange(order.id, notes);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Close on backdrop click or Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-order-id">Order {formatOrderNum(order.orderNumber)}</div>
            <div className="modal-date">{date} at {time}</div>
          </div>
          <div className="modal-header-right">
            <span className={`admin-status ${STATUS_COLORS[order.status] ?? ''}`}>{order.status.replace('_', ' ')}</span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-cols">

            {/* Left column */}
            <div className="modal-col">

              {/* Visa details */}
              <div className="modal-section">
                <div className="modal-section-title">📋 Visa Details</div>
                <div className="modal-rows">
                  <div className="modal-row"><span className="modal-row-label">Destination</span><span className="modal-row-value">{order.destination}</span></div>
                  <div className="modal-row"><span className="modal-row-label">Visa type</span><span className="modal-row-value">{VISA_LABELS[order.visaType] ?? order.visaType}</span></div>
                  <div className="modal-row"><span className="modal-row-label">Travelers</span><span className="modal-row-value">{travelers.length}</span></div>
                  <div className="modal-row"><span className="modal-row-label">Total paid</span><span className="modal-row-value modal-price">${order.totalUSD} USD</span></div>
                  <div className="modal-row"><span className="modal-row-label">Billing email</span><span className="modal-row-value">{order.billingEmail}</span></div>
                </div>
              </div>

              {/* Traveler cards */}
              <div className="modal-section">
                <div className="modal-section-title">👤 Traveler{travelers.length > 1 ? 's' : ''}</div>
                {travelers.length === 0 ? (
                  <p className="modal-empty">No traveler details available.</p>
                ) : travelers.map((t: Traveler, i: number) => (
                  <div key={i} className="modal-traveler">
                    <div className="modal-traveler-header">Traveler #{i + 1}</div>
                    <div className="modal-rows">
                      <div className="modal-row"><span className="modal-row-label">Full name</span><span className="modal-row-value">{t.firstName} {t.lastName}</span></div>
                      {(t as any).dob && <div className="modal-row"><span className="modal-row-label">Date of birth</span><span className="modal-row-value">{(t as any).dob}</span></div>}
                      <div className="modal-row"><span className="modal-row-label">Email</span><span className="modal-row-value">{t.email}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div className="modal-col">

              {/* Status control */}
              <div className="modal-section">
                <div className="modal-section-title">⚙️ Manage Application</div>
                <div className="ap-field">
                  <label className="ap-field-label">Application status</label>
                  <select
                    className="ap-select"
                    value={order.status}
                    onChange={e => onStatusChange(order.id, e.target.value)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="REFUNDED">Refunded</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="NEEDS_CORRECTION">Needs Correction</option>
                  </select>
                </div>
              </div>

              {/* Internal notes */}
              <div className="modal-section">
                <div className="modal-section-title">📝 Internal Notes</div>
                <div className="ap-field">
                  <label className="ap-field-label">Notes (internal only)</label>
                  <textarea
                    className="ap-input contact-textarea"
                    rows={5}
                    placeholder="Add notes about this application..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
                <button
                  className={`apply-submit${notes !== (order.notes ?? '') ? ' active' : ''}`}
                  onClick={saveNotes}
                  disabled={saving || notes === (order.notes ?? '')}
                  style={{ marginTop: '0.75rem' }}
                >
                  {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Notes'}
                </button>
              </div>

              {/* Order metadata */}
              <div className="modal-section">
                <div className="modal-section-title">🔖 Order Info</div>
                <div className="modal-rows">
                  <div className="modal-row"><span className="modal-row-label">Order number</span><span className="modal-row-value modal-mono">{formatOrderNum(order.orderNumber)}</span></div>
                  <div className="modal-row"><span className="modal-row-label">Order ID</span><span className="modal-row-value modal-mono">{order.id}</span></div>
                  <div className="modal-row"><span className="modal-row-label">Submitted</span><span className="modal-row-value">{date}</span></div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Order Row ─────────────────────────────────────────────────────────────── */

function OrderRow({ order, onStatusChange, onNotesChange }: {
  order: Order;
  onStatusChange: (id: string, status: string) => void;
  onNotesChange: (id: string, notes: string) => void;
}) {
  const travelers = (() => {
    try {
      const t = order.travelers;
      if (Array.isArray(t)) return t;
      if (typeof t === 'string') return JSON.parse(t);
      return [];
    } catch { return []; }
  })();
  const date = new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const router = useRouter();

  return (
    <tr className="admin-row" onClick={() => router.push(`/admin/orders/${formatOrderNum(order.orderNumber)}`)}>
      <td className="admin-td admin-td-id">
        <span className="admin-order-id">{formatOrderNum(order.orderNumber)}</span>
        <span className={`admin-visa-chip ${VISA_COLORS[order.visaType] ?? 'visa-other'}`}>{VISA_LABELS[order.visaType] ?? order.visaType}</span>
      </td>
      <td className="admin-td">
        <div className="admin-td-main">{date}</div>
        <div className="admin-td-sub">{time}</div>
      </td>
      <td className="admin-td">
        <div className="admin-td-main">{travelers.map((t: Traveler) => `${t.firstName} ${t.lastName}`).join(', ') || '—'}</div>
        <div className="admin-td-sub">{order.billingEmail}</div>
      </td>
      <td className="admin-td">
        <div className="admin-td-main">{COUNTRY_FLAGS[order.destination] ?? ''} {order.destination}</div>
        <div className="admin-td-sub">{VISA_LABELS[order.visaType] ?? order.visaType}</div>
      </td>
      <td className="admin-td">
        <span className={`admin-status ${STATUS_COLORS[order.status] ?? ''}`}>{order.status.replace('_', ' ')}</span>
      </td>
      <td className="admin-td admin-td-notes">
        <div className="admin-notes-text">{order.notes || <span className="admin-notes-empty">—</span>}</div>
      </td>
      <td className="admin-td admin-td-price">${order.totalUSD}</td>
      <td className="admin-td" onClick={e => e.stopPropagation()}>
        <select
          className="admin-status-select"
          value={order.status}
          onChange={e => onStatusChange(order.id, e.target.value)}
        >
          <option value="PENDING">Pending</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REFUNDED">Refunded</option>
          <option value="ON_HOLD">On Hold</option>
        </select>
      </td>
    </tr>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [orders,        setOrders]        = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('ALL');
  const [search,        setSearch]        = useState('');
  const [activeOrder,   setActiveOrder]   = useState<Order | null>(null);
  const [orderSortBy, setOrderSortBy] = useState<string>('date');
  const [orderSortDir, setOrderSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeSection, setActiveSectionRaw] = useState<'orders' | 'customers' | 'abandoned' | 'refunds' | 'crm'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('admin_section');
      if (saved === 'orders' || saved === 'customers' || saved === 'abandoned' || saved === 'refunds') return saved;
    }
    return 'orders';
  });
  const setActiveSection = (s: 'orders' | 'customers' | 'abandoned' | 'refunds') => { setActiveSectionRaw(s); if (typeof window !== 'undefined') sessionStorage.setItem('admin_section', s); };
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [abandonedApps, setAbandonedApps] = useState<any[]>([]);
  const [abandonedLoading, setAbandonedLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const fetchAbandoned = useCallback(async () => {
    setAbandonedLoading(true);
    try {
      const res = await fetch('/api/abandoned');
      if (res.ok) setAbandonedApps(await res.json());
    } catch {} finally { setAbandonedLoading(false); }
  }, []);

  useEffect(() => { if (activeSection === 'abandoned') fetchAbandoned(); }, [activeSection, fetchAbandoned]);

  /* CRM state */
  const [crmCustomers, setCrmCustomers] = useState<any[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmSelected, setCrmSelected] = useState<any>(null);
  const [crmNotes, setCrmNotes] = useState('');
  const [crmTags, setCrmTags] = useState('');
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmNewTag, setCrmNewTag] = useState('');

  const fetchCrm = useCallback(async () => {
    setCrmLoading(true);
    try {
      const res = await fetch('/api/crm/customers');
      if (res.ok) setCrmCustomers(await res.json());
    } catch {} finally { setCrmLoading(false); }
  }, []);

  useEffect(() => { if (activeSection === 'crm') fetchCrm(); }, [activeSection, fetchCrm]);

  const syncOrdersToCrm = async () => {
    // Auto-create CRM customers from existing orders
    const emails = new Set<string>();
    for (const o of orders) {
      let email = o.billingEmail;
      let name = '';
      try {
        const t = typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers;
        if (t[0]?.email) email = t[0].email;
        if (t[0]?.firstName) name = `${t[0].firstName} ${t[0].lastName || ''}`.trim();
      } catch {}
      if (!emails.has(email.toLowerCase())) {
        emails.add(email.toLowerCase());
        await fetch('/api/crm/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: name || email }),
        });
      }
    }
    fetchCrm();
  };

  const selectCrmCustomer = (c: any) => {
    setCrmSelected(c);
    setCrmNotes(c.notes || '');
    setCrmTags(c.tags || '');
  };

  const saveCrmCustomer = async () => {
    if (!crmSelected) return;
    setCrmSaving(true);
    await fetch(`/api/crm/customers/${crmSelected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: crmNotes, tags: crmTags }),
    });
    setCrmSaving(false);
    fetchCrm();
  };

  const addCrmTag = () => {
    if (!crmNewTag.trim()) return;
    const current = crmTags ? crmTags.split(',').map((t: string) => t.trim()) : [];
    if (!current.includes(crmNewTag.trim())) {
      const updated = [...current, crmNewTag.trim()].join(', ');
      setCrmTags(updated);
    }
    setCrmNewTag('');
  };

  const removeCrmTag = (tag: string) => {
    const updated = crmTags.split(',').map((t: string) => t.trim()).filter((t: string) => t !== tag).join(', ');
    setCrmTags(updated);
  };

  const handleStatusChange = async (id: string, status: string) => {
    const order = orders.find(o => o.id === id);
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes: order?.notes }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    if (activeOrder?.id === id) setActiveOrder(prev => prev ? { ...prev, status } : null);
  };

  const handleNotesChange = (id: string, notes: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, notes } : o));
    if (activeOrder?.id === id) setActiveOrder(prev => prev ? { ...prev, notes } : null);
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    onLogout();
  };

  const toggleOrderSort = (col: string) => {
    if (orderSortBy === col) setOrderSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOrderSortBy(col); setSortDir('asc'); }
  };
  const setSortDir = setOrderSortDir;

  const orderStatusOrder: Record<string, number> = { PENDING: 0, UNDER_REVIEW: 1, ON_HOLD: 2, NEEDS_CORRECTION: 3, APPROVED: 4, REJECTED: 5, REFUNDED: 6 };

  const filtered = orders.filter(o => {
    const matchStatus = filter === 'ALL' || o.status === filter;
    const travelers = (() => { try { const t = o.travelers; return Array.isArray(t) ? t : JSON.parse(t as any); } catch { return []; } })();
    const matchSearch = !search || [
      o.billingEmail, o.destination, o.id,
      formatOrderNum(o.orderNumber),
      ...travelers.map((t: Traveler) => `${t.firstName} ${t.lastName}`),
    ].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  }).sort((a, b) => {
    let cmp = 0;
    switch (orderSortBy) {
      case 'order': cmp = a.orderNumber - b.orderNumber; break;
      case 'applicant': {
        const nameA = (() => { try { const t = typeof a.travelers === 'string' ? JSON.parse(a.travelers) : a.travelers; return `${t[0]?.firstName || ''} ${t[0]?.lastName || ''}`; } catch { return ''; } })();
        const nameB = (() => { try { const t = typeof b.travelers === 'string' ? JSON.parse(b.travelers) : b.travelers; return `${t[0]?.firstName || ''} ${t[0]?.lastName || ''}`; } catch { return ''; } })();
        cmp = nameA.localeCompare(nameB); break;
      }
      case 'visa': cmp = a.destination.localeCompare(b.destination); break;
      case 'status': cmp = (orderStatusOrder[a.status] ?? 9) - (orderStatusOrder[b.status] ?? 9); break;
      case 'amount': cmp = a.totalUSD - b.totalUSD; break;
      case 'date': default: cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); break;
    }
    return orderSortDir === 'desc' ? -cmp : cmp;
  });

  const stats = {
    total:    orders.length,
    pending:  orders.filter(o => o.status === 'PENDING').length,
    approved: orders.filter(o => o.status === 'APPROVED').length,
    revenue:  orders.reduce((s, o) => s + o.totalUSD, 0),
  };

  return (
    <>
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <Link href="/" className="logo" style={{ color: 'white', fontSize: '1rem' }}>VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup></Link>
          <span className="admin-sidebar-badge">Admin</span>
        </div>
        <nav className="admin-nav">
          <div className={`admin-nav-item${activeSection === 'orders' ? ' active' : ''}`} onClick={() => setActiveSection('orders')}>📋 Orders</div>
          <div className={`admin-nav-item${activeSection === 'customers' ? ' active' : ''}`} onClick={() => setActiveSection('customers')}>👤 Customer Accounts</div>
          <div className={`admin-nav-item${activeSection === 'refunds' ? ' active' : ''}`} onClick={() => setActiveSection('refunds')}>💸 Refunds</div>
          <div className={`admin-nav-item${activeSection === 'abandoned' ? ' active' : ''}`} onClick={() => setActiveSection('abandoned')}>🚫 Abandoned</div>
          <Link href="/admin/crm" className="admin-nav-item" style={{ textDecoration: 'none' }}>💬 CRM</Link>
        </nav>
        <button className="admin-logout-btn" onClick={handleLogout}>← Sign Out</button>
      </aside>

      {/* Main */}
      <div className="admin-main">
        {activeSection === 'orders' ? (
          <>
            {/* Header */}
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Orders</h1>
                <p className="admin-sub">Manage and review incoming visa applications</p>
              </div>
              <button className="admin-refresh-btn" onClick={fetchOrders}>↻ Refresh</button>
            </div>

            {/* Stats */}
            <div className="admin-stats">
              <div className="admin-stat-card">
                <div className="admin-stat-label">New Orders</div>
                <div className="admin-stat-value admin-stat-pending">{stats.pending}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="admin-filters">
              <input className="admin-search" placeholder="Search by order number, name, email, destination..."
                value={search} onChange={e => setSearch(e.target.value)} />
              <div className="admin-filter-tabs">
                {['ALL','PENDING','UNDER_REVIEW','APPROVED','REJECTED','REFUNDED','ON_HOLD','NEEDS_CORRECTION'].map(s => (
                  <button key={s} className={`admin-filter-tab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
                    {s === 'ALL' ? 'All' : s.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="admin-table-wrap">
              {loading ? (
                <div className="admin-empty">Loading orders...</div>
              ) : filtered.length === 0 ? (
                <div className="admin-empty">
                  {orders.length === 0 ? 'No orders yet. They\'ll appear here once customers complete checkout.' : 'No orders match your filter.'}
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('order')}>Order {orderSortBy === 'order' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('date')}>Date {orderSortBy === 'date' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('applicant')}>Applicant {orderSortBy === 'applicant' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('visa')}>Visa {orderSortBy === 'visa' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('status')}>Status {orderSortBy === 'status' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th">Notes</th>
                      <th className="admin-th crm-th-sort" onClick={() => toggleOrderSort('amount')}>Amount {orderSortBy === 'amount' && (orderSortDir === 'asc' ? '↑' : '↓')}</th>
                      <th className="admin-th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => (
                      <OrderRow key={o.id} order={o} onStatusChange={handleStatusChange} onNotesChange={handleNotesChange} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}

        {activeSection === 'customers' && (
          <>
            {/* Customer Accounts */}
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Customer Accounts</h1>
                <p className="admin-sub">All customers grouped by contact email</p>
              </div>
              <button className="admin-refresh-btn" onClick={fetchOrders}>↻ Refresh</button>
            </div>

            <div className="admin-filters">
              <input className="admin-search" placeholder="Search by email..."
                value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
            </div>

            <div className="admin-table-wrap">
              {loading ? (
                <div className="admin-empty">Loading...</div>
              ) : (() => {
                const grouped = orders.reduce<Record<string, Order[]>>((acc, o) => {
                  // Group by first traveler's email (contact email)
                  let key = o.billingEmail;
                  try {
                    const travelers = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers);
                    if (travelers[0]?.email) key = travelers[0].email;
                  } catch {}
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(o);
                  return acc;
                }, {});
                const entries = Object.entries(grouped)
                  .filter(([email]) => !customerSearch || email.toLowerCase().includes(customerSearch.toLowerCase()))
                  .sort((a, b) => b[1].length - a[1].length);

                if (entries.length === 0) return <div className="admin-empty">No customer accounts found.</div>;

                return (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="admin-th">Email</th>
                        <th className="admin-th">Orders</th>
                        <th className="admin-th">Latest Status</th>
                        <th className="admin-th">Total Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([email, customerOrders]) => {
                        const latest = customerOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                        const totalSpent = customerOrders.reduce((s, o) => s + o.totalUSD, 0);
                        const isExpanded = expandedEmail === email;
                        return (
                          <React.Fragment key={email}>
                            <tr className="admin-tr" onClick={() => setExpandedEmail(isExpanded ? null : email)} style={{ cursor: 'pointer' }}>
                              <td className="admin-td">
                                <span style={{ fontWeight: 600 }}>{isExpanded ? '▾' : '▸'} {email}</span>
                              </td>
                              <td className="admin-td">{customerOrders.length}</td>
                              <td className="admin-td">
                                <span className={`admin-status ${STATUS_COLORS[latest.status] ?? ''}`}>{latest.status.replace('_', ' ')}</span>
                              </td>
                              <td className="admin-td">
                                <span style={{ fontWeight: 600 }}>${totalSpent.toFixed(2)}</span>
                              </td>
                            </tr>
                            {isExpanded && customerOrders.map(o => (
                              <tr key={o.id} className="admin-tr" style={{ background: 'rgba(79,110,247,0.04)' }}>
                                <td className="admin-td" style={{ paddingLeft: '2.5rem' }}>
                                  <a href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{ color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>
                                    #{formatOrderNum(o.orderNumber)}
                                  </a>
                                  <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--slate)' }}>
                                    {VISA_LABELS[o.visaType] ?? o.visaType}
                                  </span>
                                </td>
                                <td className="admin-td">{new Date(o.createdAt).toLocaleDateString()}</td>
                                <td className="admin-td">
                                  <span className={`admin-status ${STATUS_COLORS[o.status] ?? ''}`}>{o.status.replace('_', ' ')}</span>
                                </td>
                                <td className="admin-td">${o.totalUSD.toFixed(2)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </>
        )}

        {activeSection === 'refunds' && (() => {
          const refundedOrders = orders.filter(o => o.status === 'REFUNDED');
          const totalRefunded = refundedOrders.reduce((s, o) => s + (o.refundAmount ?? o.totalUSD), 0);
          return (
            <>
              <div className="admin-header">
                <div>
                  <h1 className="admin-title">Refunds</h1>
                  <p className="admin-sub">{refundedOrders.length} refund{refundedOrders.length !== 1 ? 's' : ''} — ${totalRefunded.toFixed(2)} total refunded</p>
                </div>
                <button className="admin-refresh-btn" onClick={fetchOrders}>↻ Refresh</button>
              </div>

              <div className="admin-table-wrap">
                {loading ? (
                  <div className="admin-empty">Loading...</div>
                ) : refundedOrders.length === 0 ? (
                  <div className="admin-empty">No refunds yet. Refund an order from its detail page to see it here.</div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="admin-th">Order</th>
                        <th className="admin-th">Date Refunded</th>
                        <th className="admin-th">Applicant</th>
                        <th className="admin-th">Original</th>
                        <th className="admin-th">Refunded</th>
                        <th className="admin-th">Reason</th>
                        <th className="admin-th">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refundedOrders.map(o => {
                        let applicant = o.billingEmail;
                        try { const t = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers); if (t[0]) applicant = `${t[0].firstName} ${t[0].lastName}`; } catch {}
                        return (
                          <tr key={o.id} className="admin-tr">
                            <td className="admin-td">
                              <a href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                                #{formatOrderNum(o.orderNumber)}
                              </a>
                              <span className={`admin-visa-badge ${VISA_COLORS[o.visaType] ?? ''}`} style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                                {VISA_LABELS[o.visaType] ?? o.visaType}
                              </span>
                            </td>
                            <td className="admin-td">{o.refundedAt ? new Date(o.refundedAt).toLocaleDateString() : '—'}</td>
                            <td className="admin-td">{applicant}</td>
                            <td className="admin-td">${o.totalUSD.toFixed(2)}</td>
                            <td className="admin-td" style={{ fontWeight: 600, color: '#7c3aed' }}>
                              ${(o.refundAmount ?? o.totalUSD).toFixed(2)}
                              {o.refundAmount != null && o.refundAmount < o.totalUSD && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--slate)', marginLeft: '0.3rem' }}>partial</span>
                              )}
                            </td>
                            <td className="admin-td" style={{ maxWidth: '200px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>{o.refundReason || '—'}</span>
                            </td>
                            <td className="admin-td">
                              <a href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} style={{ color: 'var(--blue)', fontSize: '0.8rem', textDecoration: 'none' }}>View</a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}

        {activeSection === 'abandoned' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">Abandoned Applications</h1>
                <p className="admin-sub">Users who started but never completed checkout</p>
              </div>
              <button className="admin-refresh-btn" onClick={fetchAbandoned}>↻ Refresh</button>
            </div>

            <div className="admin-table-wrap">
              {abandonedLoading ? (
                <div className="admin-empty">Loading...</div>
              ) : abandonedApps.length === 0 ? (
                <div className="admin-empty">No abandoned applications found.</div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="admin-th">Date</th>
                      <th className="admin-th">Email</th>
                      <th className="admin-th">Destination</th>
                      <th className="admin-th">Visa Type</th>
                      <th className="admin-th">Last Step</th>
                      <th className="admin-th">Travelers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abandonedApps.map(a => {
                      const stepLabels: Record<string, string> = {
                        step1: 'Trip Details',
                        step2: 'Personal Info',
                        step2b: 'Passport Details',
                        step3: 'Checkout',
                      };
                      let travelerCount = 0;
                      let travelerNames = '';
                      try {
                        const t = a.travelers ? (typeof a.travelers === 'string' ? JSON.parse(a.travelers) : a.travelers) : [];
                        travelerCount = t.length;
                        travelerNames = t.map((tr: any) => `${tr.firstName || ''} ${tr.lastName || ''}`.trim()).filter(Boolean).join(', ');
                      } catch {}

                      return (
                        <tr key={a.id} className="admin-tr">
                          <td className="admin-td">
                            <span style={{ fontSize: '0.8rem' }}>{new Date(a.updatedAt).toLocaleString()}</span>
                          </td>
                          <td className="admin-td">
                            <span style={{ fontWeight: 600 }}>{a.email || '—'}</span>
                          </td>
                          <td className="admin-td">{a.destination ? `${COUNTRY_FLAGS[a.destination] ?? ''} ${a.destination}` : '—'}</td>
                          <td className="admin-td">
                            {a.visaType ? (
                              <span className={`admin-visa-badge ${VISA_LABELS[a.visaType] ? 'visa-' + a.visaType.toLowerCase().replace(/_/g, '-') : ''}`}>
                                {VISA_LABELS[a.visaType] ?? a.visaType}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="admin-td">
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: a.lastStep === 'step3' ? 'rgba(234,179,8,0.12)' : 'rgba(107,114,128,0.1)',
                              color: a.lastStep === 'step3' ? '#b45309' : '#4b5563',
                            }}>
                              {stepLabels[a.lastStep] ?? a.lastStep}
                            </span>
                          </td>
                          <td className="admin-td">
                            {travelerCount > 0 ? (
                              <span title={travelerNames}>{travelerCount} — {travelerNames || 'No names'}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── CRM ── */}
        {activeSection === 'crm' && (
          <>
            <div className="admin-header">
              <div>
                <h1 className="admin-title">CRM</h1>
                <p className="admin-sub">Manage customer relationships and track interactions</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="admin-refresh-btn" onClick={syncOrdersToCrm}>⚡ Sync Orders</button>
                <button className="admin-refresh-btn" onClick={fetchCrm}>↻ Refresh</button>
              </div>
            </div>

            <div className="admin-filters">
              <input className="admin-search" placeholder="Search by name, email, or tag..."
                value={crmSearch} onChange={e => setCrmSearch(e.target.value)} />
            </div>

            <div className="crm-layout">
              {/* Customer list */}
              <div className="crm-list">
                {crmLoading ? (
                  <div className="admin-empty">Loading...</div>
                ) : (() => {
                  const filtered = crmCustomers.filter(c => {
                    if (!crmSearch) return true;
                    const s = crmSearch.toLowerCase();
                    return c.name?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s) || c.tags?.toLowerCase().includes(s);
                  });
                  if (filtered.length === 0) return (
                    <div className="admin-empty">
                      {crmCustomers.length === 0 ? 'No CRM customers yet. Click "Sync Orders" to import from existing orders.' : 'No customers match your search.'}
                    </div>
                  );
                  return filtered.map(c => {
                    const customerOrders = orders.filter(o => {
                      let email = o.billingEmail;
                      try { const t = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers); if (t[0]?.email) email = t[0].email; } catch {}
                      return email.toLowerCase() === c.email.toLowerCase();
                    });
                    const totalSpent = customerOrders.reduce((s: number, o: any) => s + o.totalUSD, 0);
                    const tags = c.tags ? c.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
                    return (
                      <div key={c.id} className={`crm-card${crmSelected?.id === c.id ? ' active' : ''}`} onClick={() => selectCrmCustomer(c)}>
                        <div className="crm-card-header">
                          <span className="crm-card-name">{c.name}</span>
                          <span className="crm-card-orders">{customerOrders.length} order{customerOrders.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="crm-card-email">{c.email}</div>
                        {c.phone && <div className="crm-card-phone">{c.phone}</div>}
                        <div className="crm-card-footer">
                          <span className="crm-card-spent">${totalSpent.toFixed(2)}</span>
                          {tags.length > 0 && (
                            <div className="crm-card-tags">
                              {tags.map((t: string) => <span key={t} className="crm-tag">{t}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Customer detail */}
              <div className="crm-detail">
                {!crmSelected ? (
                  <div className="crm-detail-empty">Select a customer to view details</div>
                ) : (() => {
                  const customerOrders = orders.filter(o => {
                    let email = o.billingEmail;
                    try { const t = (typeof o.travelers === 'string' ? JSON.parse(o.travelers) : o.travelers); if (t[0]?.email) email = t[0].email; } catch {}
                    return email.toLowerCase() === crmSelected.email.toLowerCase();
                  });
                  const tags = crmTags ? crmTags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

                  return (
                    <>
                      <div className="crm-detail-header">
                        <h2 className="crm-detail-name">{crmSelected.name}</h2>
                        <p className="crm-detail-email">{crmSelected.email}</p>
                        {crmSelected.phone && <p className="crm-detail-phone">{crmSelected.phone}</p>}
                        <p className="crm-detail-date">Customer since {new Date(crmSelected.createdAt).toLocaleDateString()}</p>
                      </div>

                      {/* Tags */}
                      <div className="crm-detail-section">
                        <h3 className="crm-detail-section-title">Tags</h3>
                        <div className="crm-tags-wrap">
                          {tags.map((t: string) => (
                            <span key={t} className="crm-tag removable" onClick={() => removeCrmTag(t)}>{t} ✕</span>
                          ))}
                          <div className="crm-tag-add">
                            <input className="crm-tag-input" placeholder="Add tag..." value={crmNewTag} onChange={e => setCrmNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCrmTag()} />
                            <button className="crm-tag-btn" onClick={addCrmTag}>+</button>
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="crm-detail-section">
                        <h3 className="crm-detail-section-title">Notes</h3>
                        <textarea
                          className="ap-input contact-textarea"
                          rows={4}
                          placeholder="Add CRM notes..."
                          value={crmNotes}
                          onChange={e => setCrmNotes(e.target.value)}
                        />
                        <button
                          className={`apply-submit${crmNotes !== (crmSelected.notes ?? '') || crmTags !== (crmSelected.tags ?? '') ? ' active' : ''}`}
                          onClick={saveCrmCustomer}
                          disabled={crmSaving || (crmNotes === (crmSelected.notes ?? '') && crmTags === (crmSelected.tags ?? ''))}
                          style={{ marginTop: '0.5rem' }}
                        >
                          {crmSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>

                      {/* Orders */}
                      <div className="crm-detail-section">
                        <h3 className="crm-detail-section-title">Orders ({customerOrders.length})</h3>
                        {customerOrders.length === 0 ? (
                          <p style={{ color: 'var(--slate)', fontSize: '0.85rem' }}>No orders found.</p>
                        ) : (
                          <div className="crm-orders-list">
                            {customerOrders.map(o => (
                              <a key={o.id} href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} className="crm-order-item">
                                <span className="crm-order-num">#{formatOrderNum(o.orderNumber)}</span>
                                <span className={`admin-status ${STATUS_COLORS[o.status] ?? ''}`}>{o.status.replace('_', ' ')}</span>
                                <span className="crm-order-amount">${o.totalUSD}</span>
                                <span className="crm-order-date">{new Date(o.createdAt).toLocaleDateString()}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Activity Timeline */}
                      <div className="crm-detail-section">
                        <h3 className="crm-detail-section-title">Activity</h3>
                        {crmSelected.activities?.length === 0 ? (
                          <p style={{ color: 'var(--slate)', fontSize: '0.85rem' }}>No activity yet.</p>
                        ) : (
                          <div className="crm-activity-list">
                            {crmSelected.activities?.map((a: any) => (
                              <div key={a.id} className="crm-activity-item">
                                <div className="crm-activity-dot" />
                                <div>
                                  <span className="crm-activity-type">{a.type === 'note' ? '📝' : a.type === 'tag_change' ? '🏷️' : a.type === 'order' ? '📋' : a.type === 'email' ? '✉️' : '🔄'}</span>
                                  <span className="crm-activity-content">{a.content}</span>
                                  <div className="crm-activity-meta">
                                    {a.createdBy && <span>{a.createdBy} · </span>}
                                    {new Date(a.createdAt).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {activeOrder && (
      <OrderModal
        order={activeOrder}
        onClose={() => setActiveOrder(null)}
        onStatusChange={handleStatusChange}
        onNotesChange={handleNotesChange}
      />
    )}
    </>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/admin/session')
      .then(r => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
