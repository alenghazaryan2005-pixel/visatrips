'use client';

/**
 * /admin/features — site-wide feature toggles.
 *
 * One toggle per FEATURE_FLAGS catalog entry. Persisted to the Setting
 * table via /api/features. Designed to grow as more flags get added.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/AdminSidebar';
import { bustFeatureFlagCache } from '@/lib/useFeatureFlag';

interface FlagRow {
  id: string;
  label: string;
  description: string;
  details: string[];
  enabled: boolean;
  defaultValue: boolean;
}

export default function FeaturesPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/features', { cache: 'no-store' });
      if (res.status === 401) { router.push('/admin'); return; }
      const data = await res.json();
      setFlags(data.flags || []);
      setAuthed(true);
    } catch {
      setError('Failed to load features.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (flag: FlagRow) => {
    if (savingId) return;
    setSavingId(flag.id);
    setError('');
    // Optimistic flip
    setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: !f.enabled } : f));
    try {
      const res = await fetch('/api/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: flag.id, enabled: !flag.enabled }),
      });
      if (!res.ok) {
        // Roll back
        setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: flag.enabled } : f));
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save.');
      } else {
        // Bust the cache used by useFeatureFlag so any other open admin tab
        // re-fetches on its next mount; current tab's flags state is already
        // up to date from the optimistic flip + re-render.
        bustFeatureFlagCache();
      }
    } catch (err: any) {
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, enabled: flag.enabled } : f));
      setError(err?.message || 'Failed to save.');
    } finally {
      setSavingId('');
    }
  };

  if (loading || !authed) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;
  }

  return (
    <div className="admin-shell">
      <AdminSidebar active="settings" />

      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>🧪 Features</h1>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', maxWidth: '640px' }}>
                Site-wide feature toggles. Flip something off to hide it from the admin UI without losing any underlying data — turning it back on restores the feature exactly as it was.
              </p>
            </div>
            <Link href="/admin/settings" style={{ color: 'var(--blue)', fontSize: '0.85rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ← Back to settings
            </Link>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem',
              padding: '0.7rem 0.95rem', marginBottom: '1rem',
              color: '#991b1b', fontSize: '0.85rem',
            }}>⚠️ {error}</div>
          )}

          {flags.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              No feature flags defined yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {flags.map(flag => (
                <div key={flag.id} style={{
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem',
                  padding: '1.1rem 1.25rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>{flag.label}</h2>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                          padding: '0.1rem 0.4rem', borderRadius: '0.3rem',
                          background: flag.enabled ? '#dcfce7' : '#f3f4f6',
                          color:      flag.enabled ? '#166534' : '#6b7280',
                          border: '1px solid ' + (flag.enabled ? '#86efac' : '#e5e7eb'),
                        }}>{flag.enabled ? 'On' : 'Off'}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: flag.details.length ? '0.65rem' : 0 }}>{flag.description}</p>
                      {flag.details.length > 0 && (
                        <ul style={{ fontSize: '0.78rem', color: '#6b7280', paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {flag.details.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      )}
                    </div>
                    <ToggleSwitch
                      enabled={flag.enabled}
                      busy={savingId === flag.id}
                      onClick={() => toggle(flag)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, busy, onClick }: { enabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={busy}
      onClick={onClick}
      title={enabled ? 'Click to turn off' : 'Click to turn on'}
      style={{
        position: 'relative',
        width: '46px', height: '26px',
        background: enabled ? 'var(--blue)' : '#cbd5e1',
        border: 'none', borderRadius: '999px',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: enabled ? '23px' : '3px',
        width: '20px', height: '20px',
        background: 'white', borderRadius: '999px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}
