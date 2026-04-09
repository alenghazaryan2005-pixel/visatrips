'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  priority: string;
  group: string;
  contactEmail: string;
  contactName: string;
  assignedTo: string | null;
  firstResponseDue: string | null;
  resolutionDue: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: { content: string; sender: string; createdAt: string }[];
  _count: { messages: number };
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  NEW:      { bg: '#DBEAFE', color: '#1D4ED8' },
  OPEN:     { bg: '#FEF3C7', color: '#B45309' },
  PENDING:  { bg: '#E0E7FF', color: '#4338CA' },
  RESOLVED: { bg: '#D1FAE5', color: '#065F46' },
  CLOSED:   { bg: '#F3F4F6', color: '#6B7280' },
};

const PRIORITY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  LOW:    { bg: '#F0FDF4', color: '#16A34A', label: 'Low' },
  MEDIUM: { bg: '#FEF9C3', color: '#CA8A04', label: 'Medium' },
  HIGH:   { bg: '#FEF2F2', color: '#DC2626', label: 'High' },
  URGENT: { bg: '#FEE2E2', color: '#991B1B', label: 'Urgent' },
};

export default function CrmPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [sortBy, setSortBy] = useState<string>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterContact, setFilterContact] = useState('');

  // New ticket form
  const [newSubject, setNewSubject] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newPriority, setNewPriority] = useState('LOW');
  const [newGroup, setNewGroup] = useState('Miscellaneous');
  const [creating, setCreating] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) setTickets(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const createTicket = async () => {
    if (!newSubject || !newEmail || !newName) return;
    setCreating(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newSubject,
          contactEmail: newEmail,
          contactName: newName,
          message: newMessage,
          priority: newPriority,
          group: newGroup,
        }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewSubject(''); setNewEmail(''); setNewName(''); setNewMessage(''); setNewPriority('LOW'); setNewGroup('Miscellaneous');
        fetchTickets();
      }
    } catch {} finally { setCreating(false); }
  };

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const statusOrder: Record<string, number> = { NEW: 0, OPEN: 1, PENDING: 2, RESOLVED: 3, CLOSED: 4 };

  // Derive unique values for filter dropdowns
  const allAgents = [...new Set(tickets.map(t => t.assignedTo).filter(Boolean))] as string[];
  const allGroups = [...new Set(tickets.map(t => t.group))];
  const allContacts = [...new Set(tickets.map(t => t.contactEmail))];
  const activeFilterCount = [filterAgent, filterGroup, filterPriority, filterContact].filter(Boolean).length;

  const filtered = tickets.filter(t => {
    if (filter !== 'ALL' && t.status !== filter) return false;
    if (filterAgent && t.assignedTo !== filterAgent) return false;
    if (filterGroup && t.group !== filterGroup) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterContact && !t.contactEmail.toLowerCase().includes(filterContact.toLowerCase())) return false;
    if (search) {
      const s = search.toLowerCase();
      return t.subject.toLowerCase().includes(s) || t.contactName.toLowerCase().includes(s) || t.contactEmail.toLowerCase().includes(s) || String(t.ticketNumber).includes(s);
    }
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'email': cmp = a.contactEmail.localeCompare(b.contactEmail); break;
      case 'subject': cmp = a.subject.localeCompare(b.subject); break;
      case 'status': cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9); break;
      case 'priority': cmp = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9); break;
      case 'group': cmp = a.group.localeCompare(b.group); break;
      case 'sla': {
        const slaTime = (t: Ticket) => {
          if (!t.resolutionDue) return Infinity;
          if (t.resolvedAt) return Infinity;
          return new Date(t.resolutionDue).getTime() - Date.now();
        };
        cmp = slaTime(a) - slaTime(b);
        break;
      }
      case 'updated': default: cmp = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const counts = {
    all: tickets.length,
    new: tickets.filter(t => t.status === 'NEW').length,
    open: tickets.filter(t => t.status === 'OPEN').length,
    pending: tickets.filter(t => t.status === 'PENDING').length,
    resolved: tickets.filter(t => t.status === 'RESOLVED').length,
  };

  const toggleSelect = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(prev => prev.length === filtered.length ? [] : filtered.map(t => t.id));

  const executeBulk = async () => {
    if (!bulkAction || selected.length === 0) return;
    setBulkProcessing(true);
    try {
      await fetch('/api/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketIds: selected, action: bulkAction, value: bulkAssignee }),
      });
      setSelected([]);
      setBulkAction('');
      setBulkAssignee('');
      fetchTickets();
    } catch {} finally { setBulkProcessing(false); }
  };

  const slaStatus = (due: string | null, completed: string | null) => {
    if (!due) return null;
    if (completed) return 'met';
    const now = Date.now();
    const dueTime = new Date(due).getTime();
    const remaining = dueTime - now;
    if (remaining < 0) return 'breached';
    if (remaining < 60 * 60 * 1000) return 'warning'; // < 1 hour
    return 'ok';
  };

  const slaLabel = (due: string | null, completed: string | null) => {
    if (!due) return '';
    if (completed) return 'Met';
    const now = Date.now();
    const remaining = new Date(due).getTime() - now;
    if (remaining < 0) {
      const hrs = Math.abs(Math.floor(remaining / 3600000));
      return `${hrs}h overdue`;
    }
    const hrs = Math.floor(remaining / 3600000);
    if (hrs < 1) return `${Math.floor(remaining / 60000)}m left`;
    return `${hrs}h left`;
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="admin-shell">
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
        <button className="admin-logout-btn" onClick={async () => { await fetch('/api/admin/logout', { method: 'POST' }); window.location.href = '/admin'; }}>
          {sidebarCollapsed ? '←' : '← Sign Out'}
        </button>
      </aside>
      <div className="admin-main" style={{ maxWidth: '100%' }}>

        {/* Header */}
        <div className="crm-page-header">
          <div>
            <h1 className="crm-page-title">Tickets</h1>
            <p className="crm-page-sub">{counts.all} total · {counts.new} new · {counts.open} open</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="crm-new-btn" onClick={() => setShowNew(!showNew)}>+ New Ticket</button>
            <button className="admin-refresh-btn" onClick={fetchTickets}>↻</button>
          </div>
        </div>

        {/* Filters */}
        <div className="crm-filters">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="crm-search" style={{ flex: 1 }} placeholder="Search by subject, name, email, or ticket #..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className={`crm-filter-toggle${showFilters ? ' active' : ''}`} onClick={() => setShowFilters(!showFilters)}>
              🔍 Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
          <div className="crm-filter-tabs">
            {[
              { key: 'ALL', label: `All (${counts.all})` },
              { key: 'NEW', label: `New (${counts.new})` },
              { key: 'OPEN', label: `Open (${counts.open})` },
              { key: 'PENDING', label: `Pending (${counts.pending})` },
              { key: 'RESOLVED', label: `Resolved (${counts.resolved})` },
              { key: 'CLOSED', label: 'Closed' },
            ].map(f => (
              <button key={f.key} className={`crm-filter-tab${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* New Ticket Form */}
        {showNew && (
          <div className="crm-new-form">
            <h3 style={{ marginBottom: '1rem', fontWeight: 700 }}>Create New Ticket</h3>
            <div className="crm-new-grid">
              <div className="ap-field"><label className="ap-field-label">Contact Name</label>
                <input className="ap-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Smith" /></div>
              <div className="ap-field"><label className="ap-field-label">Contact Email</label>
                <input className="ap-input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@example.com" /></div>
              <div className="ap-field" style={{ gridColumn: '1/-1' }}><label className="ap-field-label">Subject</label>
                <input className="ap-input" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Question about visa application" /></div>
              <div className="ap-field"><label className="ap-field-label">Priority</label>
                <select className="ap-select" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                </select></div>
              <div className="ap-field"><label className="ap-field-label">Group</label>
                <select className="ap-select" value={newGroup} onChange={e => setNewGroup(e.target.value)}>
                  <option value="Miscellaneous">Miscellaneous</option><option value="Visa Processing">Visa Processing</option><option value="Billing">Billing</option><option value="Technical">Technical</option>
                </select></div>
              <div className="ap-field" style={{ gridColumn: '1/-1' }}><label className="ap-field-label">Initial Message (optional)</label>
                <textarea className="ap-input contact-textarea" rows={3} value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Customer's message..." /></div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="crm-new-btn" onClick={createTicket} disabled={creating || !newSubject || !newEmail || !newName}>
                {creating ? 'Creating...' : 'Create Ticket'}
              </button>
              <button className="crm-cancel-btn" onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Ticket Table */}
        <div style={{ display: 'flex', gap: '1rem' }}>
        <div className="crm-table-wrap" style={{ flex: 1 }}>
          {loading ? (
            <div className="admin-empty">Loading tickets...</div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">{tickets.length === 0 ? 'No tickets yet. Create one to get started.' : 'No tickets match your filter.'}</div>
          ) : (
            <>
            {/* Bulk Actions Bar */}
            {selected.length > 0 && (
              <div className="crm-bulk-bar">
                <span className="crm-bulk-count">{selected.length} selected</span>
                <select className="crm-bulk-select" value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
                  <option value="">Choose action...</option>
                  <option value="close">Close</option>
                  <option value="resolve">Resolve</option>
                  <option value="assign">Assign to...</option>
                  <option value="delete">Delete</option>
                </select>
                {bulkAction === 'assign' && (
                  <input className="crm-bulk-input" placeholder="Agent name..." value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} />
                )}
                <button className="crm-bulk-btn" onClick={executeBulk} disabled={bulkProcessing || !bulkAction}>
                  {bulkProcessing ? 'Processing...' : 'Apply'}
                </button>
                <button className="crm-bulk-cancel" onClick={() => { setSelected([]); setBulkAction(''); }}>Cancel</button>
              </div>
            )}

            <table className="crm-table">
              <thead>
                <tr>
                  <th className="crm-th" style={{ width: '32px' }}>
                    <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="crm-th" style={{ width: '40px' }}></th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('email')}>Contact {sortBy === 'email' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('subject')}>Subject {sortBy === 'subject' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('status')}>Status {sortBy === 'status' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('sla')}>SLA {sortBy === 'sla' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('group')}>Group {sortBy === 'group' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th">Agent</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('priority')}>Priority {sortBy === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('updated')}>Updated {sortBy === 'updated' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const ss = STATUS_STYLES[t.status] || STATUS_STYLES.NEW;
                  const ps = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.LOW;
                  const frSla = slaStatus(t.firstResponseDue, t.firstRespondedAt);
                  const resSla = slaStatus(t.resolutionDue, t.resolvedAt);
                  const worstSla = frSla === 'breached' || resSla === 'breached' ? 'breached' : frSla === 'warning' || resSla === 'warning' ? 'warning' : 'ok';
                  return (
                    <tr key={t.id} className={`crm-tr${selected.includes(t.id) ? ' selected' : ''}`} onClick={() => window.location.href = `/admin/crm/${t.id}`}>
                      <td className="crm-td" onClick={e => { e.stopPropagation(); toggleSelect(t.id); }}>
                        <input type="checkbox" checked={selected.includes(t.id)} readOnly />
                      </td>
                      <td className="crm-td">
                        <div className="crm-avatar" style={{ background: ss.bg, color: ss.color }}>
                          {t.contactName.charAt(0).toUpperCase()}
                        </div>
                      </td>
                      <td className="crm-td">
                        <div className="crm-contact-name">{t.contactName}</div>
                        <div className="crm-contact-email">{t.contactEmail}</div>
                      </td>
                      <td className="crm-td">
                        <div className="crm-subject">{t.subject} <span className="crm-ticket-num">#{t.ticketNumber}</span></div>
                        {t.messages[0] && <div className="crm-last-msg">{t.messages[0].content.slice(0, 80)}{t.messages[0].content.length > 80 ? '...' : ''}</div>}
                      </td>
                      <td className="crm-td">
                        <span className="crm-status-badge" style={{ background: ss.bg, color: ss.color }}>{t.status.replace('_', ' ')}</span>
                      </td>
                      <td className="crm-td">
                        {t.status !== 'CLOSED' && t.status !== 'RESOLVED' && (
                          <span className={`crm-sla-badge ${worstSla}`} title={`Response: ${slaLabel(t.firstResponseDue, t.firstRespondedAt)} | Resolution: ${slaLabel(t.resolutionDue, t.resolvedAt)}`}>
                            {worstSla === 'breached' ? '🔴' : worstSla === 'warning' ? '🟡' : '🟢'} {slaLabel(t.resolutionDue, t.resolvedAt)}
                          </span>
                        )}
                      </td>
                      <td className="crm-td"><span className="crm-group">{t.group}</span></td>
                      <td className="crm-td"><span className="crm-agent">{t.assignedTo || '—'}</span></td>
                      <td className="crm-td">
                        <span className="crm-priority-dot" style={{ background: ps.color }} title={ps.label} />
                      </td>
                      <td className="crm-td"><span className="crm-time">{timeAgo(t.updatedAt)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="crm-filter-panel">
            <div className="crm-filter-panel-header">
              <span className="crm-filter-panel-title">Filters</span>
              {activeFilterCount > 0 && (
                <button className="crm-filter-clear" onClick={() => { setFilterAgent(''); setFilterGroup(''); setFilterPriority(''); setFilterContact(''); }}>
                  Clear all
                </button>
              )}
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Agent</label>
              <select className="crm-filter-select" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
                <option value="">Any agent</option>
                {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Group</label>
              <select className="crm-filter-select" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
                <option value="">Any group</option>
                {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Status</label>
              <select className="crm-filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="NEW">New</option>
                <option value="OPEN">Open</option>
                <option value="PENDING">Pending</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Priority</label>
              <select className="crm-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="">Any priority</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Contact</label>
              <input className="crm-filter-select" value={filterContact} onChange={e => setFilterContact(e.target.value)} placeholder="Filter by email..." />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
