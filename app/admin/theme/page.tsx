'use client';

/**
 * Theme editor — /admin/theme
 *
 * - Loads active theme + presets from /api/theme on mount.
 * - Edits update both local state AND :root inline styles, so the rest of
 *   the page (and sidebar) preview the theme live as the admin tweaks colors.
 * - Saving POSTs to /api/theme; the server inline-style on next navigation
 *   then matches the local override.
 * - Apply preset = copy that preset's colors into local state (still must
 *   click Save Theme to persist).
 * - Save current as preset = creates a new user preset via /api/theme/presets.
 * - Delete preset = removes a user preset via DELETE /api/theme/presets.
 *
 * Built-in presets cannot be deleted, only applied. Beforeunload warning
 * fires if the admin tries to leave with unsaved changes.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/AdminSidebar';
import {
  BUILT_IN_PRESETS,
  DEFAULT_THEME,
  GROUP_META,
  KEYS_BY_GROUP,
  TOKEN_META,
  THEME_KEYS,
  applyThemeToDocument,
  isValidHex,
  type Preset,
  type ThemeColors,
  type ThemeGroup,
  type ThemeKey,
  type UserPreset,
} from '@/lib/theme';

interface PresetsBundle {
  builtIn: Preset[];
  user: UserPreset[];
}

export default function ThemeAdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Theme state — `saved` is the last persisted version, `colors` is the
  // working draft. Dirty = saved !== colors.
  const [saved, setSaved] = useState<ThemeColors>(DEFAULT_THEME);
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_THEME);

  // Preset state.
  const [presets, setPresets] = useState<PresetsBundle>({ builtIn: BUILT_IN_PRESETS, user: [] });

  // Save-as-preset modal.
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [creatingPreset, setCreatingPreset] = useState(false);

  /* ── Live preview: mutate :root inline styles whenever `colors` changes ──
   * Highest specificity, so edits override the server-injected
   * <style id="theme-active"> for instant feedback. On unmount we clear the
   * inline overrides — at that point either:
   *   (a) the admin saved → save handler already updated <style id="theme-active">
   *       with the canonical new theme, so falling back to it is correct, OR
   *   (b) the admin didn't save → falling back to the (unchanged) <style> block
   *       reverts the page to the last-saved theme, also correct. */
  useEffect(() => {
    const root = document.documentElement;
    for (const k of THEME_KEYS) {
      root.style.setProperty(`--${k}`, colors[k]);
    }
    return () => {
      for (const k of THEME_KEYS) {
        root.style.removeProperty(`--${k}`);
      }
    };
  }, [colors]);

  const isDirty = useMemo(() => {
    for (const k of THEME_KEYS) {
      if (colors[k] !== saved[k]) return true;
    }
    return false;
  }, [colors, saved]);

  /* ── Beforeunload warning when dirty ─────────────────────────────────── */
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  /* ── Initial load — themes are per-user, so any admin can edit their own. ── */
  const loadAll = useCallback(async () => {
    try {
      const themeRes = await fetch('/api/theme', { cache: 'no-store' });
      if (themeRes.status === 401) { router.push('/admin'); return; }
      const data = await themeRes.json();
      if (data.active) {
        setSaved(data.active);
        setColors(data.active);
      }
      if (data.presets) {
        setPresets({
          builtIn: data.presets.builtIn ?? BUILT_IN_PRESETS,
          user: data.presets.user ?? [],
        });
      }
      setAuthed(true);
    } catch {
      setError('Failed to load theme.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── Color edits ─────────────────────────────────────────────────────── */
  const updateColor = (k: ThemeKey, raw: string) => {
    // Auto-add # if user pasted something like "FF8800".
    let v = raw.trim();
    if (v && !v.startsWith('#')) v = `#${v}`;
    setColors(prev => ({ ...prev, [k]: v.toUpperCase() }));
    setError('');
    setSuccess('');
  };

  const resetTokenToDefault = (k: ThemeKey) => {
    setColors(prev => ({ ...prev, [k]: DEFAULT_THEME[k] }));
  };

  /* ── Apply preset (no save yet — just loads into draft) ──────────────── */
  const applyPreset = (preset: Preset) => {
    setColors({ ...preset.colors });
    setError('');
    setSuccess(`Loaded "${preset.name}" — click Save Theme to apply permanently.`);
  };

  /* ── Save active theme ───────────────────────────────────────────────── */
  const saveTheme = async () => {
    // Pre-validate locally so the server doesn't have to lecture.
    for (const k of THEME_KEYS) {
      if (!isValidHex(colors[k])) {
        setError(`"${TOKEN_META[k].label}" must be a valid hex color (got "${colors[k]}").`);
        return;
      }
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Save failed.');
        return;
      }
      setSaved(data.active);
      setColors(data.active);
      // Lock the new theme into the persistent <style id="theme-active"> block
      // so navigating to another admin page (where the shared layout doesn't
      // re-render) doesn't fall back to the previous server-rendered palette.
      // ThemeWatcher does the same on SSE pushes — but SSE is suppressed on
      // this editor page, so we update the block explicitly here.
      applyThemeToDocument(data.active);
      setSuccess('Theme saved. Pushed live to every other tab on your account — other admins see their own theme.');
    } catch (err: any) {
      setError(err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Discard ─────────────────────────────────────────────────────────── */
  const discardChanges = () => {
    setColors({ ...saved });
    setError('');
    setSuccess('');
  };

  /* ── Reset everything to factory defaults (in draft only) ────────────── */
  const resetToDefaults = () => {
    setColors({ ...DEFAULT_THEME });
    setSuccess('Reset to factory defaults — click Save Theme to apply permanently.');
  };

  /* ── Save current as new user preset ─────────────────────────────────── */
  const saveAsPreset = async () => {
    const name = presetName.trim();
    if (!name) { setError('Preset name is required.'); return; }
    setCreatingPreset(true);
    setError('');
    try {
      const res = await fetch('/api/theme/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: presetDesc.trim() || undefined, colors }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create preset.');
        return;
      }
      setPresets(prev => ({ ...prev, user: data.presets ?? prev.user }));
      setPresetName('');
      setPresetDesc('');
      setSuccess(`Preset "${name}" saved.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create preset.');
    } finally {
      setCreatingPreset(false);
    }
  };

  /* ── Delete user preset ──────────────────────────────────────────────── */
  const deletePreset = async (preset: UserPreset) => {
    if (!confirm(`Delete preset "${preset.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/theme/presets?id=${encodeURIComponent(preset.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Delete failed.');
        return;
      }
      setPresets(prev => ({ ...prev, user: data.presets ?? prev.user }));
      setSuccess(`Deleted "${preset.name}".`);
    } catch (err: any) {
      setError(err?.message || 'Delete failed.');
    }
  };

  if (loading || !authed) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>Loading…</div>;
  }

  return (
    <div className="admin-shell">
      <AdminSidebar active="settings" />

      <div className="admin-main" style={{ maxWidth: '100%' }}>
        <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.25rem' }}>🎨 Color Palette</h1>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', maxWidth: '640px' }}>
                Customize the colors used across the <strong>admin panel</strong> — and only on <strong>your account</strong>. Other admins see their own theme; customer-facing pages always use the brand defaults. Changes preview live as you edit; they only persist when you click <strong>Save Theme</strong>. Apply a preset to start from a known palette.
              </p>
            </div>
            <Link href="/admin/settings" style={{ color: 'var(--blue)', fontSize: '0.85rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ← Back to settings
            </Link>
          </div>

          {/* Status bar */}
          {(error || success || isDirty) && (
            <div style={{
              padding: '0.7rem 1rem',
              borderRadius: '0.6rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              border: '1px solid ' + (error ? '#fecaca' : isDirty ? '#fde68a' : '#bbf7d0'),
              background: error ? '#fef2f2' : isDirty ? '#fffbeb' : '#f0fdf4',
              color: error ? '#991b1b' : isDirty ? '#92400e' : '#166534',
            }}>
              {error || success || (isDirty ? 'You have unsaved changes — click Save Theme to apply, or Discard to revert.' : '')}
            </div>
          )}

          {/* ── Color editors — grouped by purpose so the picker doesn't
               feel like a wall of swatches. Each group renders its own
               header + a grid of token cards. ── */}
          <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem' }}>Tokens</h2>
            <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
              {THEME_KEYS.length} tokens drive every colour in the admin panel. Hex values only — pasting without <code>#</code> is fine, we'll add it.
            </p>

            {(Object.keys(KEYS_BY_GROUP) as ThemeGroup[]).map(group => {
              const keys = KEYS_BY_GROUP[group];
              if (keys.length === 0) return null;
              const groupMeta = GROUP_META[group];
              return (
                <div key={group} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ marginBottom: '0.6rem' }}>
                    <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>
                      {groupMeta.label}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>{groupMeta.description}</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                    {keys.map(k => {
                      const meta = TOKEN_META[k];
                      const value = colors[k];
                      const isDefault = value === DEFAULT_THEME[k];
                      const valid = isValidHex(value);
                      return (
                        <div key={k} style={{
                          border: '1px solid ' + (valid ? '#e5e7eb' : '#fecaca'),
                          borderRadius: '0.6rem',
                          padding: '0.75rem',
                          background: valid ? 'white' : '#fef2f2',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                            <input
                              type="color"
                              value={valid ? value : '#000000'}
                              onChange={e => updateColor(k, e.target.value)}
                              style={{
                                width: '38px', height: '38px', padding: 0, border: '1px solid #d1d5db',
                                borderRadius: '0.4rem', cursor: 'pointer', background: 'transparent',
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{meta.label}</div>
                              <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace' }}>--{k}</div>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={value}
                            onChange={e => updateColor(k, e.target.value)}
                            placeholder="#RRGGBB"
                            maxLength={7}
                            style={{
                              width: '100%', padding: '0.45rem 0.6rem', border: '1px solid #d1d5db',
                              borderRadius: '0.4rem', fontSize: '0.85rem', fontFamily: 'monospace',
                              textTransform: 'uppercase', marginBottom: '0.4rem',
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.72rem' }}>
                            <span style={{ color: '#6b7280', flex: 1 }}>{meta.description}</span>
                            {!isDefault && (
                              <button
                                type="button"
                                onClick={() => resetTokenToDefault(k)}
                                style={{
                                  background: 'transparent', border: 'none', color: '#6b7280',
                                  cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline',
                                  padding: 0, whiteSpace: 'nowrap',
                                }}
                                title={`Reset to ${DEFAULT_THEME[k]}`}
                              >
                                reset
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          {/* ── Preview card ── */}
          <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>Live preview</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {/* Mock CTA card */}
              <div style={{
                background: 'var(--sky)', border: '1px solid var(--cloud)', borderRadius: '0.75rem',
                padding: '1rem', color: 'var(--ink)',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginBottom: '0.25rem' }}>Sample card</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Apply for your visa</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--slate)', marginBottom: '0.75rem' }}>This is what body copy looks like in your active palette.</div>
                <button style={{
                  background: 'var(--blue)', color: 'white', border: 'none', borderRadius: '0.5rem',
                  padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                }}>
                  Get started →
                </button>
              </div>
              {/* Mock admin sidebar — uses --sidebar (which decoupled from --ink) */}
              <div style={{
                background: 'var(--sidebar)', borderRadius: '0.75rem', padding: '1rem', color: 'white',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--blue2)', marginBottom: '0.5rem' }}>Admin sidebar</div>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem', opacity: 0.9 }}>📋 Orders</div>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem', opacity: 0.9 }}>👥 Customers</div>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.4rem', background: 'var(--blue)', padding: '0.3rem 0.5rem', borderRadius: '0.4rem', display: 'inline-block' }}>🎨 Theme</div>
              </div>
              {/* Mock form */}
              <div style={{
                background: 'var(--white)', border: '1px solid var(--cloud)', borderRadius: '0.75rem', padding: '1rem',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginBottom: '0.4rem' }}>Form preview</div>
                <input
                  readOnly
                  value="user@example.com"
                  style={{
                    width: '100%', padding: '0.45rem 0.6rem', background: 'var(--mist)',
                    border: '1px solid var(--cloud)', borderRadius: '0.4rem', fontSize: '0.85rem',
                    color: 'var(--ink)', marginBottom: '0.4rem',
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--slate)' }}>Your email address.</div>
              </div>
              {/* Status badges — uses --success/--warning/--danger/--info */}
              <div style={{
                background: 'var(--white)', border: '1px solid var(--cloud)', borderRadius: '0.75rem', padding: '1rem',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginBottom: '0.55rem' }}>Status badges</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <span className="admin-status status-pending">Pending</span>
                  <span className="admin-status status-submitted">Submitted</span>
                  <span className="admin-status status-approved">Approved</span>
                  <span className="admin-status status-rejected">Rejected</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '0.55rem' }}>
                  Backgrounds tint automatically from the foreground colour.
                </div>
              </div>
            </div>
          </section>

          {/* ── Action bar ── */}
          <section style={{
            position: 'sticky', bottom: '1rem', zIndex: 10,
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem',
            padding: '0.85rem 1rem', marginBottom: '1.25rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              {isDirty ? <strong style={{ color: '#92400e' }}>● Unsaved changes</strong> : <span style={{ color: '#16a34a' }}>● Saved</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={resetToDefaults}
                style={{
                  background: 'transparent', border: '1px solid #d1d5db', borderRadius: '0.5rem',
                  padding: '0.5rem 0.85rem', fontSize: '0.85rem', cursor: 'pointer', color: '#374151',
                }}
              >
                Factory defaults
              </button>
              <button
                type="button"
                onClick={discardChanges}
                disabled={!isDirty || saving}
                style={{
                  background: 'transparent', border: '1px solid #d1d5db', borderRadius: '0.5rem',
                  padding: '0.5rem 0.85rem', fontSize: '0.85rem', cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
                  opacity: !isDirty || saving ? 0.5 : 1, color: '#374151',
                }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={saveTheme}
                disabled={!isDirty || saving}
                style={{
                  background: !isDirty || saving ? '#9ca3af' : 'var(--blue)',
                  color: 'white', border: 'none', borderRadius: '0.5rem',
                  padding: '0.5rem 0.85rem', fontSize: '0.85rem', fontWeight: 600,
                  cursor: !isDirty || saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save Theme'}
              </button>
            </div>
          </section>

          {/* ── Presets ── */}
          <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.85rem', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem' }}>Presets</h2>
            <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: '1rem' }}>
              Apply loads a preset's colors into the editor — you still need to click Save Theme to make it the live palette.
            </p>

            {/* Built-in presets */}
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Built-in</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {presets.builtIn.map(p => (
                <PresetCard key={p.id} preset={p} onApply={() => applyPreset(p)} />
              ))}
            </div>

            {/* User presets */}
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Your saved presets {presets.user.length > 0 && <span style={{ fontWeight: 500, color: '#9ca3af', textTransform: 'none' }}>({presets.user.length})</span>}
            </div>
            {presets.user.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic', marginBottom: '1.25rem' }}>
                No saved presets yet. Save the current colors as a preset using the form below.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {presets.user.map(p => (
                  <PresetCard
                    key={p.id}
                    preset={p}
                    onApply={() => applyPreset(p)}
                    onDelete={() => deletePreset(p)}
                  />
                ))}
              </div>
            )}

            {/* Save-as-preset form */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.6rem', padding: '0.85rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Save current colors as a new preset</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Preset name (e.g. Holiday 2025)"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  maxLength={60}
                  style={{
                    flex: 1, minWidth: '200px', padding: '0.45rem 0.6rem',
                    border: '1px solid #d1d5db', borderRadius: '0.4rem', fontSize: '0.85rem',
                  }}
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={presetDesc}
                  onChange={e => setPresetDesc(e.target.value)}
                  maxLength={240}
                  style={{
                    flex: 1.5, minWidth: '200px', padding: '0.45rem 0.6rem',
                    border: '1px solid #d1d5db', borderRadius: '0.4rem', fontSize: '0.85rem',
                  }}
                />
                <button
                  type="button"
                  onClick={saveAsPreset}
                  disabled={!presetName.trim() || creatingPreset}
                  style={{
                    background: !presetName.trim() || creatingPreset ? '#9ca3af' : 'var(--blue)',
                    color: 'white', border: 'none', borderRadius: '0.4rem',
                    padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 600,
                    cursor: !presetName.trim() || creatingPreset ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creatingPreset ? 'Saving…' : 'Save preset'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── PresetCard component ──────────────────────────────────────────────── */
function PresetCard({ preset, onApply, onDelete }: {
  preset: Preset;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: '0.6rem', padding: '0.75rem',
      background: 'white', display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preset.name}
        </div>
        {!('builtIn' in preset && preset.builtIn) && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete this preset"
            style={{
              background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer',
              fontSize: '1.05rem', padding: 0, lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      {/* Color strip */}
      <div style={{ display: 'flex', borderRadius: '0.35rem', overflow: 'hidden', height: '24px', border: '1px solid #e5e7eb' }}>
        {THEME_KEYS.map(k => (
          <div
            key={k}
            title={`${k}: ${preset.colors[k]}`}
            style={{ flex: 1, background: preset.colors[k] }}
          />
        ))}
      </div>
      {('description' in preset) && preset.description && (
        <div style={{ fontSize: '0.72rem', color: '#6b7280', minHeight: '1.5em' }}>
          {preset.description}
        </div>
      )}
      <button
        type="button"
        onClick={onApply}
        style={{
          background: 'var(--blue)', color: 'white', border: 'none', borderRadius: '0.4rem',
          padding: '0.4rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        Apply
      </button>
    </div>
  );
}
