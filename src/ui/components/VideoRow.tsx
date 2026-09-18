import React, { useState } from 'react';
import type { Video } from '../lib/types';
import { api, errorMessage } from '../lib/api';
import { btn, colors, formatDate, formatDuration, shortError, statusColor, statusLabel } from '../lib/styles';

interface Props {
  video: Video;
  /** Re-fetch the list after an action. */
  onChanged: () => void;
  onError: (msg: string) => void;
  showChannel?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

export function VideoRow({ video, onChanged, onError, showChannel = true, selectable, selected, onToggle }: Props) {
  const [busy, setBusy] = useState(false);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      onError(`${label} failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const post = (action: 'approve' | 'reject' | 'retry') => act(action, () => api(`/api/videos/${video.id}/${action}`, { method: 'POST' }));

  const remove = (deleteFile: boolean) => {
    const what = deleteFile ? `Delete "${video.title}" and remove the file from the library?` : `Remove "${video.title}" from the list?`;
    if (!confirm(what)) return;
    act('Delete', () => api(`/api/videos/${video.id}?deleteFile=${deleteFile}`, { method: 'DELETE' }));
  };

  const small = { small: true, disabled: busy };
  const actions: React.ReactNode = (() => {
    switch (video.status) {
      case 'pending':
        return (
          <>
            <button style={btn('success', small)} disabled={busy} onClick={() => post('approve')}>Approve</button>
            <button style={btn('danger', small)} disabled={busy} onClick={() => post('reject')}>Reject</button>
          </>
        );
      case 'approved':
        return <button style={btn('subtle', small)} disabled={busy} onClick={() => post('reject')}>Un-queue</button>;
      case 'downloading':
        return <span style={{ fontSize: 12, color: colors.warn, fontWeight: 600 }}>Downloading…</span>;
      case 'error':
        return (
          <>
            <button style={btn('primary', small)} disabled={busy} onClick={() => post('retry')}>Retry</button>
            <button style={btn('danger', small)} disabled={busy} onClick={() => remove(false)}>Remove</button>
          </>
        );
      case 'rejected':
        return <button style={btn('primary', small)} disabled={busy} onClick={() => post('approve')}>Download</button>;
      case 'deleted':
        return <button style={btn('ghost', small)} disabled={busy} onClick={() => post('retry')}>Download again</button>;
      case 'done':
        return <button style={btn('danger', small)} disabled={busy} onClick={() => remove(true)}>Delete file</button>;
    }
  })();

  const isShort = video.file_path?.includes('/Shorts/');
  const meta = [
    showChannel ? (video.channel_name || (video.source === 'local' ? 'Imported file' : 'Single video')) : null,
    formatDate(video.published_at),
    formatDuration(video.duration) || null,
    isShort ? 'Shorts' : null,
    video.max_quality ? `${video.max_quality}p` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        background: selected ? colors.primarySoft : '#fff',
        borderRadius: 10,
        padding: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        flexWrap: 'wrap',
      }}
    >
      {selectable && (
        <input type="checkbox" checked={!!selected} onChange={onToggle} style={{ width: 18, height: 18, flexShrink: 0 }} aria-label="Select video" />
      )}
      <div style={{ width: 120, height: 68, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: colors.subtle }}>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: colors.muted, fontSize: 11 }}>
            {video.source === 'local' ? 'file' : 'no image'}
          </div>
        )}
      </div>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={video.title}>
          {video.title}
        </div>
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{meta}</div>
        <div style={{ fontSize: 12, marginTop: 2, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ color: statusColor[video.status], fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>
            {statusLabel[video.status] ?? video.status}
          </span>
          {video.status === 'error' && video.error_message && (
            <span style={{ color: colors.danger }} title={video.error_message}>{shortError(video.error_message)}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>{actions}</div>
    </div>
  );
}
