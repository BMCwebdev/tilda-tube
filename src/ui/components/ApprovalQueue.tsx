import React, { useCallback, useEffect, useState } from 'react';
import type { Video } from '../lib/types';
import { api, errorMessage } from '../lib/api';
import { btn, card, colors, input } from '../lib/styles';
import { QualitySelect } from './DatePresetPicker';
import { VideoRow } from './VideoRow';

interface Props {
  onAction: () => void;
}

export function ApprovalQueue({ onAction }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState('');

  const [videoUrl, setVideoUrl] = useState('');
  const [videoQuality, setVideoQuality] = useState(720);
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchQueue = useCallback(() => {
    api<Video[]>('/api/queue')
      .then((data) => {
        setVideos(data);
        setSelected((prev) => new Set([...prev].filter((id) => data.some((v) => v.id === id))));
        setLoading(false);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const changed = () => {
    fetchQueue();
    onAction();
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = videoUrl.trim();
    if (!url) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const v = await api<Video>('/api/videos', { method: 'POST', json: { url, maxQuality: videoQuality } });
      setVideoUrl('');
      setAddMsg({ ok: true, text: `Added "${v.title}". Approve it below to download.` });
      changed();
    } catch (err) {
      setAddMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const bulk = async (action: 'approve' | 'reject', ids: number[]) => {
    if (ids.length === 0) return;
    if (action === 'reject' && !confirm(`Reject ${ids.length} video${ids.length === 1 ? '' : 's'}?`)) return;
    setBulkBusy(true);
    try {
      await api('/api/videos/bulk', { method: 'POST', json: { ids, action } });
      setSelected(new Set());
      changed();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const allIds = videos.map((v) => v.id);
  const sel = [...selected];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <form onSubmit={handleAddVideo} style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Paste a YouTube video link to add just that video"
          style={{ ...input, flex: '1 1 240px' }}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <QualitySelect value={videoQuality} onChange={setVideoQuality} />
        <button type="submit" disabled={adding} style={btn('primary', { disabled: adding })}>
          {adding ? 'Checking…' : 'Add video'}
        </button>
        {addMsg && (
          <div style={{ width: '100%', fontSize: 13, fontWeight: 500, color: addMsg.ok ? colors.success : colors.danger }}>{addMsg.text}</div>
        )}
      </form>

      {error && (
        <div style={{ ...card, color: colors.danger, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{error}</span>
          <button style={btn('subtle', { small: true })} onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <p style={{ padding: 20, color: colors.muted }}>Loading…</p>
      ) : videos.length === 0 ? (
        <div style={{ ...card, color: colors.muted, textAlign: 'center', padding: 28 }}>
          Nothing waiting for approval.
          <div style={{ fontSize: 13, marginTop: 4 }}>Channels set to auto-approve skip this list entirely.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: colors.muted }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sel.length === allIds.length && allIds.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(allIds) : new Set())}
                style={{ width: 18, height: 18 }}
              />
              Select all ({videos.length})
            </label>
            {sel.length > 0 && (
              <>
                <button style={btn('success', { small: true, disabled: bulkBusy })} disabled={bulkBusy} onClick={() => bulk('approve', sel)}>
                  Approve {sel.length}
                </button>
                <button style={btn('danger', { small: true, disabled: bulkBusy })} disabled={bulkBusy} onClick={() => bulk('reject', sel)}>
                  Reject {sel.length}
                </button>
              </>
            )}
            {sel.length === 0 && (
              <button style={btn('ghost', { small: true, disabled: bulkBusy })} disabled={bulkBusy} onClick={() => bulk('approve', allIds)}>
                Approve all
              </button>
            )}
          </div>
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              onChanged={changed}
              onError={setError}
              selectable
              selected={selected.has(video.id)}
              onToggle={() => toggle(video.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}
