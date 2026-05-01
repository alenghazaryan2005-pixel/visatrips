'use client';

/**
 * /admin/employees — owner-only.
 *
 * Lists every admin user. Owner can create new employees (name, email,
 * password, role), edit existing ones (rename, change email, reset
 * password, change role), and delete them. The API enforces:
 *   - Owner role required on every endpoint
 *   - Self-demotion blocked
 *   - Self-delete blocked
 *   - Last-owner protection (can't demote/delete the only remaining owner)
 *
 * Employees who navigate here directly get an "Access denied" view —
 * they're not even shown what the page is for.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/AdminSidebar';

interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'employee';
  createdAt: string;
}

interface SessionInfo {
  authenticated: boolean;
  name?: string;
  email?: string;
  role?: 'owner' | 'employee';
}

export default function EmployeesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create form state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'employee'>('employee');
  const [savingNew, setSavingNew] = useState(false);

  // Edit modal state — null = no edit open
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'owner' | 'employee'>('employee');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [sessRes, listRes] = await Promise.all([
        fetch('/api/admin/session', { cache: 'no-store' }),
        fetch('/api/admin/employees', { cache: 'no-store' }),
      ]);
      if (sessRes.status === 401) { router.push('/admin'); return; }
      const sess = await sessRes.json();
      setSession(sess);
      // List endpoint may 403 for employees — that's fine, we'll show the
      // access-denied view based on session.role.
      if (listRes.ok) {
        const data = await listRes.json();
        setEmployees(data.employees || []);
      }
    } catch {
      setError('Failed to load.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNew(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create.'); return; }
      setEmployees(prev => [...prev, data.employee]);
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewRole('employee');
      setCreating(false);
      setSuccess(`Created ${data.employee.email}.`);
    } catch (err: any) { setError(err?.message || 'Failed to create.'); }
    finally { setSavingNew(false); }
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setEditName(emp.name);
    setEditEmail(emp.email);
    setEditPassword(''); // empty = unchanged
    setEditRole(emp.role);
    setError(''); setSuccess('');
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true); setError('');
    try {
      const body: Record<string, any> = {};
      if (editName.trim() && editName.trim() !== editing.name) body.name = editName.trim();
      if (editEmail.trim().toLowerCase() !== editing.email) body.email = editEmail.trim().toLowerCase();
      if (editPassword) body.password = editPassword;
      if (editRole !== editing.role) body.role = editRole;
      if (Object.keys(body).length === 0) { setEditing(null); return; }

      const res = await fetch(`/api/admin/employees/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save.'); return; }
      setEmployees(prev => prev.map(e => e.id === editing.id ? data.employee : e));
      setEditing(null);
      setSuccess(`Updated ${data.employee.email}.`);
    } catch (err: any) { setError(err?.message || 'Failed to save.'); }
    finally { setSavingEdit(false); }
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Delete admin user "${emp.email}"? This cannot be undone.`)) return;
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to delete.'); return; }
      setEmployees(prev => prev.filter(e => e.id !== emp.id));
      setSuccess(`Deleted ${emp.email}.`);
    } catch (err: any) { setError(err?.message || 'Failed to delete.'); }
  };

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;
  }

  if (!session?.authenticated) return null; // redirected

  // Access-denied view for employees
  if (session.role !== 'owner') {
    return (
      <div className="admin-shell">
        <AdminSidebar />
        <div className="admin-main" style={{ maxWidth: '100%' }}>
          <div style={{ padding: '4rem 1.5rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔒</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Owner access required</h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              Employee management is restricted to owner accounts. Contact the account owner if you need access.
            </p>
            <Link href="/admin" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
              ← Back to admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminSidebar />

      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>👥 Admin Users</h1>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', maxWidth: '640px' }}>
                Manage owner and employee accounts. Owners have full access; employees can use the admin panel but can&apos;t change site config or manage other admins.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setCreating(v => !v); setError(''); setSuccess(''); }}
              style={{
                background: creating ? '#f3f4f6' : 'var(--blue)',
                color: creating ? '#374151' : 'white',
                border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {creating ? 'Cancel' : '+ New employee'}
            </button>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.7rem 0.95rem', marginBottom: '1rem', color: '#991b1b', fontSize: '0.85rem' }}>⚠️ {error}</div>
          )}
          {success && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.7rem 0.95rem', marginBottom: '1rem', color: '#166534', fontSize: '0.85rem' }}>✓ {success}</div>
          )}

          {/* Create form */}
          {creating && (
            <form onSubmit={handleCreate} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem' }}>New employee</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Name</label>
                  <input type="text" required value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Email</label>
                  <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Password</label>
                  <input type="text" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value as any)} style={inputStyle}>
                    <option value="employee">Employee</option>
                    <option value="owner">Owner (full access)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setCreating(false)} style={btnSecondary}>Cancel</button>
                <button type="submit" disabled={savingNew} style={{ ...btnPrimary, opacity: savingNew ? 0.6 : 1, cursor: savingNew ? 'wait' : 'pointer' }}>
                  {savingNew ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          )}

          {/* Employee list */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Created</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const isYou = session.email?.toLowerCase() === emp.email.toLowerCase();
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>
                        {emp.name}
                        {isYou && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}>(you)</span>}
                      </td>
                      <td style={tdStyle}>{emp.email}</td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                          padding: '0.15rem 0.45rem', borderRadius: '0.3rem',
                          background: emp.role === 'owner' ? '#fef3c7' : '#dbeafe',
                          color:      emp.role === 'owner' ? '#92400e' : '#1e40af',
                          border: '1px solid ' + (emp.role === 'owner' ? '#fde68a' : '#93c5fd'),
                        }}>{emp.role}</span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: '#6b7280' }}>
                        {new Date(emp.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => openEdit(emp)} style={btnRow}>Edit</button>
                        {!isYou && (
                          <button type="button" onClick={() => handleDelete(emp)} style={{ ...btnRow, color: '#dc2626', marginLeft: '0.4rem' }}>Delete</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr><td colSpan={5} style={{ ...tdStyle, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>No admin users.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          onClick={() => setEditing(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: '0.85rem', padding: '1.5rem',
              maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Edit {editing.email}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Email</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>New password <span style={{ color: '#9ca3af', fontWeight: 400 }}>(leave blank to keep current)</span></label>
                <input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="•••••••• unchanged" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as any)}
                  disabled={session.email?.toLowerCase() === editing.email.toLowerCase()}
                  title={session.email?.toLowerCase() === editing.email.toLowerCase() ? 'You cannot change your own role.' : ''}
                  style={inputStyle}
                >
                  <option value="employee">Employee</option>
                  <option value="owner">Owner (full access)</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button type="button" onClick={() => setEditing(null)} style={btnSecondary}>Cancel</button>
              <button type="button" onClick={handleSaveEdit} disabled={savingEdit} style={{ ...btnPrimary, opacity: savingEdit ? 0.6 : 1, cursor: savingEdit ? 'wait' : 'pointer' }}>
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #d1d5db',
  borderRadius: '0.4rem', fontSize: '0.88rem', background: 'white',
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '0.7rem 1rem', fontSize: '0.7rem',
  fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
};
const tdStyle: React.CSSProperties = {
  padding: '0.85rem 1rem', fontSize: '0.88rem', color: 'var(--ink)',
};
const btnPrimary: React.CSSProperties = {
  background: 'var(--blue)', color: 'white', border: 'none',
  borderRadius: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 600,
  cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'transparent', color: '#374151', border: '1px solid #d1d5db',
  borderRadius: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 600,
  cursor: 'pointer',
};
const btnRow: React.CSSProperties = {
  background: 'transparent', color: 'var(--blue)', border: 'none',
  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', padding: '0.25rem 0.45rem',
};
