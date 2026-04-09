'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { formatOrderNum } from '@/lib/constants';

interface TicketMessage {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

interface LinkedOrder {
  id: string;
  orderNumber: number;
  status: string;
  destination: string;
  visaType: string;
  totalUSD: number;
  createdAt: string;
}

interface TicketActivity {
  id: string;
  action: string;
  details: string;
  performedBy: string | null;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  priority: string;
  group: string;
  contactEmail: string;
  contactName: string;
  firstResponseDue: string | null;
  resolutionDue: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  mergedIntoId: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  activities: TicketActivity[];
  linkedOrders: LinkedOrder[];
}

const GROUPS = ['Miscellaneous', 'Visa Processing', 'Billing', 'Technical'];

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sendEmailCheck, setSendEmailCheck] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mergeTicketId, setMergeTicketId] = useState('');
  const [merging, setMerging] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showLinkedOrders, setShowLinkedOrders] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (res.ok) setTicket(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchTicket(); }, [id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ticket?.messages]);

  const sendReply = async () => {
    if (!reply.trim() || !ticket) return;
    setSending(true);
    try {
      await fetch(`/api/tickets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply, isInternal, sendToCustomer: sendEmailCheck && !isInternal }),
      });
      setReply('');
      setIsInternal(false);
      fetchTicket();
    } catch {} finally { setSending(false); }
  };

  const mergeTicket = async () => {
    if (!mergeTicketId.trim()) return;
    setMerging(true);
    try {
      await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mergeInto: mergeTicketId }),
      });
      window.location.href = `/admin/crm/${mergeTicketId}`;
    } catch {} finally { setMerging(false); }
  };

  const slaDisplay = (due: string | null, completed: string | null, label: string) => {
    if (!due) return null;
    if (completed) return <div className="tkt2-sla met"><span className="tkt2-sla-label">{label}</span><span>Met</span></div>;
    const remaining = new Date(due).getTime() - Date.now();
    const breached = remaining < 0;
    const hrs = Math.abs(Math.floor(remaining / 3600000));
    const mins = Math.abs(Math.floor((remaining % 3600000) / 60000));
    return (
      <div className={`tkt2-sla ${breached ? 'breached' : remaining < 3600000 ? 'warning' : 'ok'}`}>
        <span className="tkt2-sla-label">{label}</span>
        <span>{breached ? `${hrs}h ${mins}m overdue` : `${hrs}h ${mins}m left`}</span>
      </div>
    );
  };

  const updateField = async (field: string, value: string) => {
    await fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    fetchTicket();
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin';
  };

  const timeStr = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    let ago = '';
    if (mins < 60) ago = `${mins} minutes ago`;
    else if (mins < 1440) ago = `${Math.floor(mins / 60)} hours ago`;
    else ago = `${Math.floor(mins / 1440)} days ago`;
    return `${ago} (${date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`;
  };

  const sidebar = (
    <aside className={`admin-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      <div className="admin-sidebar-logo">
        <Link href="/" className="logo" style={{ color: 'white', fontSize: '1rem' }}>
          {sidebarCollapsed ? 'V' : <>VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup></>}
        </Link>
        {!sidebarCollapsed && <span className="admin-sidebar-badge">Admin</span>}
      </div>
      <nav className="admin-nav">
        <Link href="/admin" className="admin-nav-item" style={{ textDecoration: 'none' }}>{sidebarCollapsed ? '📋' : '📋 Orders'}</Link>
        <Link href="/admin/crm" className="admin-nav-item active" style={{ textDecoration: 'none' }}>{sidebarCollapsed ? '💬' : '💬 CRM'}</Link>
      </nav>
      <button className="sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
        {sidebarCollapsed ? '→' : '← Collapse'}
      </button>
      <button className="admin-logout-btn" onClick={handleLogout}>{sidebarCollapsed ? '←' : '← Sign Out'}</button>
    </aside>
  );

  if (loading) return (
    <div className="admin-shell">{sidebar}<div className="admin-main"><div className="admin-empty">Loading ticket...</div></div></div>
  );
  if (!ticket) return (
    <div className="admin-shell">{sidebar}<div className="admin-main"><div className="admin-empty">Ticket not found.</div></div></div>
  );

  const statusColor: Record<string, string> = { NEW: '#1D4ED8', OPEN: '#B45309', PENDING: '#4338CA', RESOLVED: '#065F46', CLOSED: '#6B7280' };

  return (
    <div className="admin-shell">
      {sidebar}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div className="tkt2-topbar">
          <div className="tkt2-topbar-left">
            <Link href="/admin/crm" className="tkt2-back">←</Link>
            <span className="tkt2-topbar-status" style={{ color: statusColor[ticket.status] || '#6B7280' }}>{ticket.status.replace('_', ' ')}</span>
            <span className="tkt2-topbar-time">{timeStr(ticket.updatedAt)}</span>
          </div>
          <div className="tkt2-topbar-right">
            <span className="tkt2-topbar-nav">Ticket #{ticket.ticketNumber}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Main content */}
          <div className="tkt2-main">

            {/* Subject */}
            <div className="tkt2-subject-bar">
              <h1 className="tkt2-subject">{ticket.subject}</h1>
              <p className="tkt2-created">Created by <strong>{ticket.contactName}</strong> · {ticket.contactEmail}</p>
            </div>

            {/* Thread */}
            <div className="tkt2-thread">
              {ticket.messages.map(m => (
                <div key={m.id} className={`tkt2-msg${m.isInternal ? ' internal' : ''}`}>
                  <div className="tkt2-msg-avatar" style={{ background: m.sender === 'agent' ? 'var(--blue)' : m.isInternal ? '#CA8A04' : '#94A3B8' }}>
                    {m.senderName.charAt(0).toUpperCase()}
                  </div>
                  <div className="tkt2-msg-content">
                    <div className="tkt2-msg-header">
                      <span className="tkt2-msg-sender">
                        {m.senderName}
                        {m.sender === 'agent' && <span className="tkt2-msg-badge agent">replied</span>}
                        {m.sender === 'customer' && <span className="tkt2-msg-badge customer">reported</span>}
                        {m.isInternal && <span className="tkt2-msg-badge internal">internal note</span>}
                      </span>
                      <span className="tkt2-msg-time">· {timeStr(m.createdAt)}</span>
                    </div>
                    {m.sender === 'agent' && !m.isInternal && (
                      <div className="tkt2-msg-to">To: {ticket.contactEmail}</div>
                    )}
                    <div className="tkt2-msg-body">{m.content}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div className="tkt2-reply-box">
              <div className="tkt2-reply-avatar" style={{ background: isInternal ? '#CA8A04' : 'var(--blue)' }}>
                {isInternal ? '🔒' : '✉️'}
              </div>
              <div className="tkt2-reply-main">
                <div className="tkt2-reply-tabs">
                  <button className={`tkt2-reply-tab${!isInternal ? ' active' : ''}`} onClick={() => setIsInternal(false)}>
                    ✉️ Reply
                  </button>
                  <button className={`tkt2-reply-tab${isInternal ? ' active' : ''}`} onClick={() => setIsInternal(true)}>
                    📝 Note
                  </button>
                </div>
                <textarea
                  className="tkt2-reply-input"
                  rows={4}
                  placeholder={isInternal ? 'Add an internal note...' : 'Type your response here...'}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
                />
                <div className="tkt2-reply-footer">
                  {!isInternal && (
                    <label className="tkt2-reply-check">
                      <input type="checkbox" checked={sendEmailCheck} onChange={e => setSendEmailCheck(e.target.checked)} />
                      Send email to customer
                    </label>
                  )}
                  {isInternal && <span />}
                  <button className={`tkt2-reply-send${isInternal ? ' note' : ''}`} onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? 'Sending...' : isInternal ? 'Add Note' : 'Send Reply'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar — Properties */}
          <div className="tkt2-props">
            <h3 className="tkt2-props-heading">PROPERTIES</h3>

            <div className="tkt2-prop">
              <label className="tkt2-prop-label">Status <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="tkt2-prop-select" value={ticket.status} onChange={e => updateField('status', e.target.value)}>
                <option value="NEW">New</option><option value="OPEN">Open</option><option value="PENDING">Pending</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option>
              </select>
            </div>

            <div className="tkt2-prop">
              <label className="tkt2-prop-label">Priority</label>
              <select className="tkt2-prop-select" value={ticket.priority} onChange={e => updateField('priority', e.target.value)}>
                <option value="LOW">🟢 Low</option><option value="MEDIUM">🟡 Medium</option><option value="HIGH">🟠 High</option><option value="URGENT">🔴 Urgent</option>
              </select>
            </div>

            <div className="tkt2-prop">
              <label className="tkt2-prop-label">Group</label>
              <select className="tkt2-prop-select" value={ticket.group} onChange={e => updateField('group', e.target.value)}>
                {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="tkt2-prop">
              <label className="tkt2-prop-label">Agent</label>
              <input className="tkt2-prop-input" value={ticket.assignedTo || ''} onBlur={e => updateField('assignedTo', e.target.value)} onChange={e => {
                // Local update for typing
                setTicket(prev => prev ? { ...prev, assignedTo: e.target.value } : null);
              }} placeholder="Assign agent..." />
            </div>

            {/* Contact */}
            <div className="tkt2-prop-divider" />
            <Link href={`/admin/crm/contact/${encodeURIComponent(ticket.contactEmail)}`} className="tkt2-contact" style={{ textDecoration: 'none' }}>
              <div className="tkt2-contact-avatar">{ticket.contactName.charAt(0).toUpperCase()}</div>
              <div>
                <div className="tkt2-contact-name">{ticket.contactName}</div>
                <div className="tkt2-contact-email">{ticket.contactEmail}</div>
              </div>
            </Link>

            {/* Linked Orders */}
            {/* SLA Timers */}
            <div className="tkt2-prop-divider" />
            <h3 className="tkt2-props-heading">SLA</h3>
            {slaDisplay(ticket.firstResponseDue, ticket.firstRespondedAt, 'First Response')}
            {slaDisplay(ticket.resolutionDue, ticket.resolvedAt, 'Resolution')}

            {/* Linked Orders */}
            {ticket.linkedOrders.length > 0 && (
              <>
                <div className="tkt2-prop-divider" />
                <button className="tkt2-activity-toggle" onClick={() => setShowLinkedOrders(!showLinkedOrders)}>
                  {showLinkedOrders ? '▾' : '▸'} Linked Orders ({ticket.linkedOrders.length})
                </button>
                {showLinkedOrders && (
                  <div className="tkt2-linked-orders" style={{ marginTop: '0.5rem' }}>
                    {ticket.linkedOrders.map(o => (
                      <Link key={o.id} href={`/admin/orders/${formatOrderNum(o.orderNumber)}`} className="tkt2-order-link">
                        <span style={{ color: 'var(--blue)', fontWeight: 600 }}>#{formatOrderNum(o.orderNumber)}</span>
                        <span style={{ color: 'var(--slate)', fontSize: '0.78rem' }}>{o.destination} · ${o.totalUSD}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Merge */}
            <div className="tkt2-prop-divider" />
            <h3 className="tkt2-props-heading">MERGE</h3>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input className="tkt2-prop-input" placeholder="Ticket ID to merge into..." value={mergeTicketId} onChange={e => setMergeTicketId(e.target.value)} style={{ flex: 1 }} />
              <button className="crm-new-btn" onClick={mergeTicket} disabled={merging || !mergeTicketId.trim()} style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}>
                {merging ? '...' : 'Merge'}
              </button>
            </div>

            {/* Activity Log */}
            <div className="tkt2-prop-divider" />
            <button className="tkt2-activity-toggle" onClick={() => setShowActivity(!showActivity)}>
              {showActivity ? '▾' : '▸'} Activity Log ({ticket.activities?.length || 0})
            </button>
            {showActivity && ticket.activities && (
              <div className="tkt2-activity-list">
                {ticket.activities.map(a => (
                  <div key={a.id} className="tkt2-activity-item">
                    <span className="tkt2-activity-icon">
                      {a.action === 'created' ? '🆕' : a.action === 'status_changed' ? '🔄' : a.action === 'assigned' ? '👤' : a.action === 'replied' ? '💬' : a.action === 'note_added' ? '📝' : a.action === 'merged' ? '🔗' : '⚡'}
                    </span>
                    <div className="tkt2-activity-details">
                      <span className="tkt2-activity-text">{a.details}</span>
                      <span className="tkt2-activity-time">{a.performedBy && `${a.performedBy} · `}{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
