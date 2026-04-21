'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ErrorLog {
  id: string;
  createdAt: string;
  level: string;
  source: string;
  message: string;
  stack: string | null;
  url: string | null;
  method: string | null;
  statusCode: number | null;
  userAgent: string | null;
  ipAddress: string | null;
  userEmail: string | null;
  userType: string | null;
  context: string | null;
  sentryId: string | null;
  fingerprint: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  notes: string | null;
}

export default function ErrorLogsPage() {
  const router = useRouter();
  const [errors, setErrors]   = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed]   = useState(false);
  const [counts, setCounts]   = useState({ unresolved: 0, resolved: 0 });
  const [filter, setFilter]   = useState<'unresolved' | 'resolved' | 'all'>('unresolved');
  const [levelF, setLevelF]   = useState<string>('');
  const [sourceF, setSourceF] = useState<string>('');
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<ErrorLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('resolved', filter === 'resolved' ? 'true' : 'false');
    if (levelF) params.set('level', levelF);
    if (sourceF) params.set('source', sourceF);
    if (search) params.set('search', search);
    params.set('limit', '200');
    try {
      const res = await fetch('/api/errors?' + params.toString());
      if (res.status === 401) {
        // Not logged in — redirect to admin login
        router.push('/admin');
        return;
      }
      const data = await res.json();
      setErrors(data.errors || []);
      setCounts(data.counts || { unresolved: 0, resolved: 0 });
      setAuthed(true);
    } catch {}
    setLoading(false);
  }, [filter, levelF, sourceF, search, router]);

  useEffect(() => { load(); }, [load]);

  const toggleResolved = async (id: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/errors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: !resolved }),
      });
      if (res.ok) {
        load();
        if (selected?.id === id) setSelected(null);
      }
    } catch {}
  };

  const deleteError = async (id: string) => {
    if (!confirm('Delete this error log?')) return;
    try {
      await fetch(`/api/errors/${id}`, { method: 'DELETE' });
      load();
      if (selected?.id === id) setSelected(null);
    } catch {}
  };

  const saveNotes = async (id: string, notes: string) => {
    try {
      await fetch(`/api/errors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      load();
    } catch {}
  };

  const fmtDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const levelColor = (lvl: string) => lvl === 'error' ? '#dc2626' : lvl === 'warning' ? '#f59e0b' : '#3b82f6';
  const sourceColor = (src: string) => src === 'server' ? '#8b5cf6' : src === 'client' ? '#06b6d4' : '#10b981';

  // Show blank while checking auth
  if (loading && !authed) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <Link href="/" className="logo" style={{ color: 'white', fontSize: '1rem' }}>VisaTrips<sup style={{ color: 'var(--blue2)' }}>®</sup></Link>
          <span className="admin-sidebar-badge">Admin</span>
        </div>
        <nav className="admin-nav">
          <div className="admin-nav-section-label">Admin Panel</div>
          <Link href="/admin" className="admin-nav-item" style={{ textDecoration: 'none' }}>📋 Orders</Link>
          <div className="admin-nav-section-label" style={{ marginTop: '1rem' }}>Dashboard</div>
          <Link href="/admin/crm" className="admin-nav-item" style={{ textDecoration: 'none' }}>💬 Emails</Link>
          <Link href="/admin/errors" className="admin-nav-item active" style={{ textDecoration: 'none' }}>⚠️ Error Logs</Link>
        </nav>
        <button className="admin-logout-btn" onClick={async () => { await fetch('/api/admin/logout', { method: 'POST' }); window.location.href = '/admin'; }}>← Sign Out</button>
      </aside>
      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>⚠️ Error Logs</h1>
        <Link href="/admin" style={{ textDecoration: 'none', color: 'var(--blue)' }}>← Back to Admin</Link>
      </div>

      {/* Summary + filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('unresolved')} className={`err-filter${filter === 'unresolved' ? ' active' : ''}`}>
          Unresolved ({counts.unresolved})
        </button>
        <button onClick={() => setFilter('resolved')} className={`err-filter${filter === 'resolved' ? ' active' : ''}`}>
          Resolved ({counts.resolved})
        </button>
        <button onClick={() => setFilter('all')} className={`err-filter${filter === 'all' ? ' active' : ''}`}>
          All
        </button>
        <select value={levelF} onChange={e => setLevelF(e.target.value)} className="err-select">
          <option value="">All levels</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select value={sourceF} onChange={e => setSourceF(e.target.value)} className="err-select">
          <option value="">All sources</option>
          <option value="server">Server</option>
          <option value="client">Client</option>
          <option value="bot">Bot</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search message, URL, email…"
          className="err-search"
        />
        <button onClick={load} className="err-refresh">🔄 Refresh</button>
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>}
      {!loading && errors.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: '0.75rem' }}>
          ✨ No errors here. Nice.
        </div>
      )}

      {!loading && errors.length > 0 && (
        <div className="err-table">
          <div className="err-row err-header">
            <div>Time</div>
            <div>Level</div>
            <div>Source</div>
            <div>Message</div>
            <div>URL / User</div>
            <div></div>
          </div>
          {errors.map(e => (
            <div key={e.id} className={`err-row${e.resolved ? ' resolved' : ''}`}>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{fmtDate(e.createdAt)}</div>
              <div><span className="err-badge" style={{ background: levelColor(e.level) }}>{e.level}</span></div>
              <div><span className="err-badge" style={{ background: sourceColor(e.source) }}>{e.source}</span></div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setSelected(e)}>
                {e.message}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.url && <div title={e.url}>{e.url.replace(/^https?:\/\/[^/]+/, '')}</div>}
                {e.userEmail && <div>{e.userEmail}</div>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="err-action" onClick={() => setSelected(e)}>View</button>
                <button className="err-action" onClick={() => toggleResolved(e.id, e.resolved)}>
                  {e.resolved ? 'Reopen' : 'Resolve'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="err-modal-bg" onClick={() => setSelected(null)}>
          <div className="err-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Error Details</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1rem', fontSize: '0.88rem', marginBottom: '1rem' }}>
              <div style={{ color: '#6b7280' }}>Time:</div><div>{new Date(selected.createdAt).toLocaleString()}</div>
              <div style={{ color: '#6b7280' }}>Level:</div><div><span className="err-badge" style={{ background: levelColor(selected.level) }}>{selected.level}</span></div>
              <div style={{ color: '#6b7280' }}>Source:</div><div><span className="err-badge" style={{ background: sourceColor(selected.source) }}>{selected.source}</span></div>
              {selected.url && <><div style={{ color: '#6b7280' }}>URL:</div><div style={{ wordBreak: 'break-all' }}>{selected.url}</div></>}
              {selected.method && <><div style={{ color: '#6b7280' }}>Method:</div><div>{selected.method}</div></>}
              {selected.statusCode && <><div style={{ color: '#6b7280' }}>Status:</div><div>{selected.statusCode}</div></>}
              {selected.userEmail && <><div style={{ color: '#6b7280' }}>User:</div><div>{selected.userEmail} ({selected.userType})</div></>}
              {selected.ipAddress && <><div style={{ color: '#6b7280' }}>IP:</div><div>{selected.ipAddress}</div></>}
              {selected.userAgent && <><div style={{ color: '#6b7280' }}>User Agent:</div><div style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{selected.userAgent}</div></>}
              {selected.sentryId && <><div style={{ color: '#6b7280' }}>Sentry ID:</div><div style={{ fontFamily: 'monospace' }}>{selected.sentryId}</div></>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem' }}>Message</div>
              <pre className="err-code">{selected.message}</pre>
            </div>

            {selected.stack && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem' }}>Stack Trace</div>
                <pre className="err-code err-stack">{selected.stack}</pre>
              </div>
            )}

            {selected.context && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem' }}>Context</div>
                <pre className="err-code">{(() => { try { return JSON.stringify(JSON.parse(selected.context), null, 2); } catch { return selected.context; } })()}</pre>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem' }}>Resolution Notes</div>
              <textarea
                defaultValue={selected.notes || ''}
                onBlur={e => saveNotes(selected.id, e.target.value)}
                placeholder="Notes on how this was fixed..."
                className="err-notes"
              />
              {selected.resolved && selected.resolvedAt && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.3rem' }}>
                  Resolved {new Date(selected.resolvedAt).toLocaleString()}{selected.resolvedBy ? ` by ${selected.resolvedBy}` : ''}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="err-action-danger" onClick={() => deleteError(selected.id)}>🗑 Delete</button>
              <button className="err-action-primary" onClick={() => toggleResolved(selected.id, selected.resolved)}>
                {selected.resolved ? 'Mark Unresolved' : '✓ Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .err-filter {
          background: white; border: 1px solid #e5e7eb; padding: 0.5rem 1rem; border-radius: 0.5rem;
          cursor: pointer; font-size: 0.88rem; font-weight: 500;
        }
        .err-filter.active { background: var(--blue); color: white; border-color: var(--blue); }
        .err-select, .err-search {
          padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.88rem; background: white;
        }
        .err-search { flex: 1; min-width: 200px; }
        .err-refresh {
          background: white; border: 1px solid #e5e7eb; padding: 0.5rem 1rem; border-radius: 0.5rem;
          cursor: pointer; font-size: 0.88rem;
        }
        .err-table {
          background: white; border: 1px solid #e5e7eb; border-radius: 0.75rem; overflow: hidden;
        }
        .err-row {
          display: grid; grid-template-columns: 110px 80px 80px 1fr 1fr 180px;
          gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid #f3f4f6; align-items: center;
        }
        .err-row:last-child { border-bottom: none; }
        .err-row.resolved { opacity: 0.5; }
        .err-header { background: #f9fafb; font-weight: 600; font-size: 0.85rem; color: #6b7280; }
        .err-badge {
          display: inline-block; padding: 0.15rem 0.5rem; border-radius: 0.3rem; color: white;
          font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
        }
        .err-action, .err-action-primary, .err-action-danger {
          padding: 0.3rem 0.65rem; border-radius: 0.35rem; font-size: 0.78rem; cursor: pointer; border: 1px solid #e5e7eb; background: white;
        }
        .err-action-primary { background: var(--blue); color: white; border-color: var(--blue); padding: 0.5rem 1rem; font-size: 0.88rem; }
        .err-action-danger { background: #dc2626; color: white; border-color: #dc2626; padding: 0.5rem 1rem; font-size: 0.88rem; }
        .err-modal-bg {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem;
        }
        .err-modal {
          background: white; border-radius: 1rem; padding: 1.5rem; max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto;
        }
        .err-code {
          background: #1f2937; color: #f3f4f6; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.78rem; overflow-x: auto;
          font-family: 'SF Mono', Menlo, monospace; margin: 0;
        }
        .err-stack { max-height: 300px; overflow-y: auto; }
        .err-notes {
          width: 100%; padding: 0.5rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; font-size: 0.88rem; font-family: inherit; resize: vertical;
          min-height: 70px;
        }
      `}</style>
        </div>
      </div>
    </div>
  );
}
