'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CrmSidebar } from '@/components/CrmSidebar';
import { crmPath } from '@/lib/urls';
import { writeQueue } from '@/lib/admin-queue';

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  status: string;
  priority: string;
  type: string;              // General / Question / Refund / Status Check / Payment Issue / Application Help / Document Issue / Call Request
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

// Values used in the "New Ticket" form and the filter panel. Free-form
// strings server-side (the DB accepts anything) — these are just the
// blessed set the UI offers by default.
const TYPE_OPTIONS = [
  'General', 'Question', 'Refund', 'Status Check',
  'Payment Issue', 'Application Help', 'Document Issue', 'Call Request',
];
const GROUP_OPTIONS = [
  'General', 'India', 'Aruba', 'Payments', 'Documents',
  'Refunds', 'Technical', 'Miscellaneous',
];
const PAGE_SIZES = [25, 50, 100];
const SORT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'updated',  label: 'Last activity' },
  { key: 'created',  label: 'Newest first'  },
  { key: 'oldest',   label: 'Oldest first'  },
  { key: 'priority', label: 'Priority'      },
];

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
  const [filterType, setFilterType] = useState('');
  const [filterContact, setFilterContact] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sidebar view (?view=mine|all — see CrmSidebar VIEW_NAV). Default =
  // "inbox" = tickets that aren't CLOSED, i.e. the active work queue.
  const searchParams = useSearchParams();
  const view = searchParams?.get('view') || 'inbox';

  // Current admin name for "My Tickets" view + "assign to me" defaults.
  const [me, setMe] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !cancelled && typeof d.name === 'string') setMe(d.name); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // New ticket form
  const [newSubject, setNewSubject] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newPriority, setNewPriority] = useState('LOW');
  const [newGroup, setNewGroup] = useState('General');
  const [newType, setNewType] = useState('General');
  const [creating, setCreating] = useState(false);
  const [newSendEmail, setNewSendEmail] = useState(true);

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
          type: newType,
          sendNotification: newSendEmail,
        }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewSubject(''); setNewEmail(''); setNewName(''); setNewMessage('');
        setNewPriority('LOW'); setNewGroup('General'); setNewType('General');
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

  // Sidebar view is a coarse pre-filter applied BEFORE the fine-grained
  // status/type/etc. filters. Inbox = the active work queue (anything
  // not CLOSED); My Tickets = anything assigned to the current admin;
  // All = every row.
  const inView = (t: Ticket): boolean => {
    if (view === 'mine') return !!me && t.assignedTo === me;
    if (view === 'all')  return true;
    // 'inbox' (default): the working queue
    return t.status !== 'CLOSED';
  };

  // Derive unique values for filter dropdowns (from the in-view slice,
  // so options don't include stuff you can't see under the current view).
  const inViewTickets = tickets.filter(inView);
  const allAgents = [...new Set(inViewTickets.map(t => t.assignedTo).filter(Boolean))] as string[];
  const allGroups = [...new Set(inViewTickets.map(t => t.group))];
  const allTypes  = [...new Set(inViewTickets.map(t => t.type))];
  const activeFilterCount = [filterAgent, filterGroup, filterPriority, filterType, filterContact].filter(Boolean).length;

  // Simple per-value counts against the in-view slice (not narrowed
  // by other filters). Good enough for the "(N)" badges in the filter
  // dropdowns — matches what the user sees if they set just that one
  // filter with no others.
  const countStatus   = (v: string) => inViewTickets.filter(t => t.status === v).length;
  const countPriority = (v: string) => inViewTickets.filter(t => t.priority === v).length;
  const countType     = (v: string) => inViewTickets.filter(t => t.type === v).length;
  const countGroup    = (v: string) => inViewTickets.filter(t => t.group === v).length;
  const countAgent    = (v: string) => inViewTickets.filter(t => t.assignedTo === v).length;

  const filtered = inViewTickets.filter(t => {
    if (filter !== 'ALL' && t.status !== filter) return false;
    if (filterAgent && t.assignedTo !== filterAgent) return false;
    if (filterGroup && t.group !== filterGroup) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterType && t.type !== filterType) return false;
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
      case 'created': cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); break;
      case 'oldest':  cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
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

  // Reset to page 1 when any filter / view / search changes so we
  // don't strand the user on an empty later page.
  useEffect(() => { setPage(1); }, [view, filter, filterAgent, filterGroup, filterPriority, filterType, filterContact, search]);

  // Client-side pagination slice (server still returns everything;
  // OK at current scale, and it keeps the UI responsive).
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedFiltered = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Unread heuristic: a ticket is "unread" when the LATEST message on
  // it is from the customer (i.e. waiting for our reply). The API
  // returns messages newest-first, so messages[0] is what we check.
  // Cheap, no schema change; row gets a leading dot + bolder subject.
  const isUnread = (t: Ticket): boolean => {
    const last = t.messages[0];
    return !!last && last.sender === 'customer';
  };

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
      <CrmSidebar />
      <div className="admin-main" style={{ maxWidth: '100%' }}>

        {/* Header — title reflects the active view. */}
        <div className="crm-page-header">
          <div>
            <h1 className="crm-page-title">
              {view === 'mine' ? 'My Tickets' : view === 'all' ? 'All Tickets' : 'Inbox'}
            </h1>
            <p className="crm-page-sub">
              {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
              {view === 'inbox' && ` · ${counts.new} new`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Sort — controls the .sort() at the bottom of the derived
                filtered list. Value maps to sortBy; direction is fixed
                per option (Newest/Oldest already encode direction). */}
            <select
              className="ap-select"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.82rem', width: 'auto' }}
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setSortDir('desc'); }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button className="crm-new-btn" onClick={() => setShowNew(!showNew)}>+ New Ticket</button>
            <button className="admin-refresh-btn" onClick={fetchTickets}>↻</button>
          </div>
        </div>

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
              <div className="ap-field"><label className="ap-field-label">Type</label>
                <select className="ap-select" value={newType} onChange={e => setNewType(e.target.value)}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="ap-field"><label className="ap-field-label">Group</label>
                <select className="ap-select" value={newGroup} onChange={e => setNewGroup(e.target.value)}>
                  {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select></div>
              <div className="ap-field" style={{ gridColumn: '1/-1' }}><label className="ap-field-label">Initial Message (optional)</label>
                <textarea className="ap-input contact-textarea" rows={3} value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Customer's message..." /></div>
            </div>
            <label className="tkt2-reply-check" style={{ marginTop: '0.5rem' }}>
              <input type="checkbox" checked={newSendEmail} onChange={e => setNewSendEmail(e.target.checked)} />
              Send email notification to customer
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
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
                    <input type="checkbox" checked={selected.length === pagedFiltered.length && pagedFiltered.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="crm-th" style={{ width: '20px' }}></th>{/* unread dot */}
                  <th className="crm-th" style={{ width: '40px' }}></th>{/* avatar */}
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('email')}>Contact {sortBy === 'email' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('subject')}>Subject {sortBy === 'subject' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('status')}>Status {sortBy === 'status' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th">Type</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('sla')}>SLA {sortBy === 'sla' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('group')}>Group {sortBy === 'group' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th">Agent</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('priority')}>Priority {sortBy === 'priority' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                  <th className="crm-th crm-th-sort" onClick={() => toggleSort('updated')}>Updated {sortBy === 'updated' && (sortDir === 'asc' ? '↑' : '↓')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedFiltered.map(t => {
                  const ss = STATUS_STYLES[t.status] || STATUS_STYLES.NEW;
                  const ps = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.LOW;
                  const frSla = slaStatus(t.firstResponseDue, t.firstRespondedAt);
                  const resSla = slaStatus(t.resolutionDue, t.resolvedAt);
                  const worstSla = frSla === 'breached' || resSla === 'breached' ? 'breached' : frSla === 'warning' || resSla === 'warning' ? 'warning' : 'ok';
                  const unread = isUnread(t);
                  return (
                    <tr key={t.id} className={`crm-tr${selected.includes(t.id) ? ' selected' : ''}`} onClick={() => {
                      // Snapshot the full filtered list (not just current page)
                      // so Prev/Next on the detail page walk the whole queue,
                      // matching the same UX the orders queue provides.
                      const parts: string[] = [];
                      if (view === 'mine') parts.push('My Tickets');
                      else if (view === 'all') parts.push('All Tickets');
                      else parts.push('Inbox');
                      if (filter !== 'ALL') parts.push(`Status: ${filter}`);
                      if (filterPriority) parts.push(`Priority: ${filterPriority}`);
                      if (filterType) parts.push(`Type: ${filterType}`);
                      if (filterGroup) parts.push(`Group: ${filterGroup}`);
                      if (filterAgent) parts.push(`Agent: ${filterAgent}`);
                      if (search) parts.push(`Search: "${search}"`);
                      writeQueue('tickets', { ids: filtered.map(x => x.id), filterLabel: parts.join(' · ') || null });
                      window.location.href = crmPath('ticket', t.id);
                    }}>
                      <td className="crm-td" onClick={e => { e.stopPropagation(); toggleSelect(t.id); }}>
                        <input type="checkbox" checked={selected.includes(t.id)} readOnly />
                      </td>
                      <td className="crm-td" title={unread ? 'Awaiting your reply' : ''}>
                        {unread && (
                          <span style={{
                            display: 'inline-block', width: 8, height: 8,
                            borderRadius: '50%', background: 'var(--blue)',
                          }} aria-hidden />
                        )}
                      </td>
                      <td className="crm-td">
                        <div className="crm-avatar" style={{ background: ss.bg, color: ss.color }}>
                          {t.contactName.charAt(0).toUpperCase()}
                        </div>
                      </td>
                      <td className="crm-td">
                        <div className="crm-contact-name" style={{ fontWeight: unread ? 700 : undefined }}>{t.contactName}</div>
                        <div className="crm-contact-email">{t.contactEmail}</div>
                      </td>
                      <td className="crm-td">
                        <div className="crm-subject" style={{ fontWeight: unread ? 700 : undefined, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{t.subject}</span>
                          <span className="crm-ticket-num">#{t.ticketNumber}</span>
                          {t._count?.messages > 1 && (
                            <span style={{
                              fontSize: '0.66rem', fontWeight: 700,
                              padding: '0.05rem 0.4rem', borderRadius: '999px',
                              background: 'var(--cloud)', color: 'var(--slate)',
                            }} title={`${t._count.messages} messages in this thread`}>
                              {t._count.messages}
                            </span>
                          )}
                        </div>
                        {t.messages[0] && <div className="crm-last-msg">{t.messages[0].content.slice(0, 80)}{t.messages[0].content.length > 80 ? '...' : ''}</div>}
                      </td>
                      <td className="crm-td">
                        <span className="crm-status-badge" style={{ background: ss.bg, color: ss.color }}>{t.status.replace('_', ' ')}</span>
                      </td>
                      <td className="crm-td"><span className="crm-group">{t.type || 'General'}</span></td>
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

            {/* Pagination — client-side slice on the filtered list. */}
            {filtered.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem', borderTop: '1px solid var(--cloud)',
                fontSize: '0.82rem', color: 'var(--slate)',
              }}>
                <div>
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <select
                    className="ap-select"
                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem', width: 'auto' }}
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  >
                    {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <button className="admin-refresh-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={{ fontSize: '0.78rem' }}>‹ Prev</button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button className="admin-refresh-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} style={{ fontSize: '0.78rem' }}>Next ›</button>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* Filter Panel — dropdown options carry a "(N)" count of
            matching in-view tickets so employees can see at a glance
            where the work is before applying a filter. Type is new;
            Contact is the free-text email filter (kept because it's
            substring-matching, not a fixed set). */}
        {showFilters && (
          <div className="crm-filter-panel">
            <div className="crm-filter-panel-header">
              <span className="crm-filter-panel-title">Filters</span>
              {activeFilterCount > 0 && (
                <button className="crm-filter-clear" onClick={() => { setFilterAgent(''); setFilterGroup(''); setFilterPriority(''); setFilterType(''); setFilterContact(''); }}>
                  Clear all
                </button>
              )}
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Status</label>
              <select className="crm-filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="ALL">All ({inViewTickets.length})</option>
                <option value="NEW">New ({countStatus('NEW')})</option>
                <option value="OPEN">Open ({countStatus('OPEN')})</option>
                <option value="PENDING">Pending ({countStatus('PENDING')})</option>
                <option value="RESOLVED">Resolved ({countStatus('RESOLVED')})</option>
                <option value="CLOSED">Closed ({countStatus('CLOSED')})</option>
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Priority</label>
              <select className="crm-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="">Any priority</option>
                <option value="LOW">Low ({countPriority('LOW')})</option>
                <option value="MEDIUM">Medium ({countPriority('MEDIUM')})</option>
                <option value="HIGH">High ({countPriority('HIGH')})</option>
                <option value="URGENT">Urgent ({countPriority('URGENT')})</option>
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Type</label>
              <select className="crm-filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Any type</option>
                {[...new Set([...TYPE_OPTIONS, ...allTypes])].map(t => (
                  <option key={t} value={t}>{t} ({countType(t)})</option>
                ))}
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Group</label>
              <select className="crm-filter-select" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
                <option value="">Any group</option>
                {[...new Set([...GROUP_OPTIONS, ...allGroups])].map(g => (
                  <option key={g} value={g}>{g} ({countGroup(g)})</option>
                ))}
              </select>
            </div>

            <div className="crm-filter-section">
              <label className="crm-filter-label">Agent</label>
              <select className="crm-filter-select" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
                <option value="">Any agent</option>
                {allAgents.map(a => <option key={a} value={a}>{a} ({countAgent(a)})</option>)}
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
