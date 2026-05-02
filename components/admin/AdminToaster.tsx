'use client';

/**
 * Renders the active toast stack in the bottom-right corner of admin
 * pages. Mounted once in app/admin/layout.tsx — components anywhere in
 * /admin/* fire toasts via the imperative `toast.*` API in
 * lib/admin-toast.
 *
 * Each toast auto-dismisses after its `durationMs`. The stack scrolls
 * upward as new toasts arrive (newest at the bottom, oldest fading out
 * at the top of the stack).
 */

import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, X as XIcon, Undo2 } from 'lucide-react';
import { useToasts, dismissToast, type Toast, type ToastKind } from '@/lib/admin-toast';

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; color: string; iconColor: string }> = {
  success: { bg: '#f0fdf4', border: '#86efac', color: '#15803d', iconColor: '#16a34a' },
  error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', iconColor: '#dc2626' },
  info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', iconColor: '#2563eb' },
};

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  info:    Info,
};

export function AdminToaster() {
  const toasts = useToasts();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 999999, // sit above any modal
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'none', // child toasts re-enable
        maxWidth: 'calc(100vw - 2.5rem)',
      }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const style = KIND_STYLES[toast.kind];
  const Icon = ICONS[toast.kind];

  // Auto-dismiss timer — set per-toast so the lifecycle is independent
  // even if multiple toasts are queued.
  useEffect(() => {
    const elapsed = Date.now() - toast.createdAt;
    const remaining = Math.max(0, toast.durationMs - elapsed);
    const timer = setTimeout(() => dismissToast(toast.id), remaining);
    return () => clearTimeout(timer);
  }, [toast.id, toast.createdAt, toast.durationMs]);

  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.7rem 0.85rem',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '0.6rem',
        color: style.color,
        fontSize: '0.85rem',
        fontWeight: 500,
        lineHeight: 1.45,
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.08)',
        minWidth: '280px',
        maxWidth: '420px',
        animation: 'admin-toast-in 0.18s ease-out',
      }}
    >
      <span style={{ color: style.iconColor, flexShrink: 0, marginTop: '0.05rem' }}>
        <Icon size={18} strokeWidth={1.85} aria-hidden />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ wordBreak: 'break-word' }}>{toast.message}</div>
      </div>

      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            try { toast.undo!(); } finally { dismissToast(toast.id); }
          }}
          title="Undo"
          style={{
            background: 'transparent',
            border: `1px solid ${style.border}`,
            borderRadius: '0.35rem',
            padding: '0.2rem 0.5rem',
            color: style.color,
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            flexShrink: 0,
          }}
        >
          <Undo2 size={12} strokeWidth={2} />
          Undo
        </button>
      )}

      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        title="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0.1rem',
          color: style.color,
          opacity: 0.5,
          cursor: 'pointer',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
        }}
        aria-label="Dismiss notification"
      >
        <XIcon size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
