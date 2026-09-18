import type { CSSProperties } from 'react';
import type { VideoStatus } from './types';

export const colors = {
  primary: '#2563eb',
  primarySoft: '#eff6ff',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  success: '#16a34a',
  successSoft: '#dcfce7',
  warn: '#d97706',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  card: '#ffffff',
  subtle: '#f3f4f6',
};

export const card: CSSProperties = {
  background: colors.card,
  borderRadius: 10,
  padding: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

export const input: CSSProperties = {
  padding: '8px 12px',
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  fontSize: 14,
  background: '#fff',
  minWidth: 0,
};

export const label: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: colors.muted,
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
};

type Variant = 'primary' | 'danger' | 'success' | 'ghost' | 'subtle';

export function btn(variant: Variant = 'primary', opts: { small?: boolean; disabled?: boolean } = {}): CSSProperties {
  const palette: Record<Variant, CSSProperties> = {
    primary: { background: colors.primary, color: '#fff' },
    danger: { background: colors.dangerSoft, color: colors.danger },
    success: { background: colors.success, color: '#fff' },
    ghost: { background: 'transparent', color: colors.primary, border: `1px solid ${colors.border}` },
    subtle: { background: colors.subtle, color: colors.text },
  };
  return {
    border: 'none',
    borderRadius: 8,
    padding: opts.small ? '6px 10px' : '9px 14px',
    fontSize: opts.small ? 13 : 14,
    fontWeight: 600,
    cursor: opts.disabled ? 'not-allowed' : 'pointer',
    opacity: opts.disabled ? 0.6 : 1,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
    ...palette[variant],
  };
}

export const statusColor: Record<VideoStatus, string> = {
  done: colors.success,
  error: colors.danger,
  downloading: colors.warn,
  approved: colors.primary,
  pending: colors.muted,
  rejected: colors.muted,
  deleted: colors.muted,
};

export const statusLabel: Record<VideoStatus, string> = {
  done: 'Downloaded',
  error: 'Failed',
  downloading: 'Downloading',
  approved: 'Queued',
  pending: 'Needs approval',
  rejected: 'Rejected',
  deleted: 'Removed',
};

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Trim the yt-dlp noise so the parent sees the actual reason. */
export function shortError(msg: string | null): string {
  if (!msg) return '';
  const lines = msg.split('\n').map((l) => l.trim()).filter(Boolean);
  const err = [...lines].reverse().find((l) => l.startsWith('ERROR'));
  const picked = err || lines[lines.length - 1] || '';
  return picked.replace(/^ERROR:\s*(\[\w+\]\s*)?([\w-]{11}:\s*)?/, '').slice(0, 220);
}
