import React, { useCallback, useEffect, useState } from 'react';
import type { Channel, Video } from '../lib/types';
import { api, errorMessage } from '../lib/api';
import { btn, card, colors, label } from '../lib/styles';
import { AddChannelForm } from './AddChannelForm';
import { DatePresetPicker, dateFromPreset, MinLengthSelect, QualitySelect, type DatePreset } from './DatePresetPicker';
import { VideoRow } from './VideoRow';

interface Props {
  onAction: () => void;
}

function EditChannelForm({ channel, onSaved, onCancel, onError }: {
  channel: Channel;
  onSaved: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [preset, setPreset] = useState<DatePreset>('custom');
  const [customDate, setCustomDate] = useState(channel.from_date);
  const [autoApprove, setAutoApprove] = useState(!!channel.auto_approve);
  const [minDuration, setMinDuration] = useState(channel.min_duration ?? 120);
  const [maxQuality, setMaxQuality] = useState(channel.max_quality ?? 720);
  const [saving, setSaving] = useState(false);

  const fromDate = dateFromPreset(preset, customDate);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/channels/${channel.id}`, { method: 'PATCH', json: { fromDate, autoApprove, minDuration, maxQuality } });
      onSaved();
    } catch (err) {
      onError(`Could not save ${channel.name}: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 10, border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={label}>Download videos from</label>
        <DatePresetPicker compact preset={preset} customDate={customDate} onChange={(p, d) => { setPreset(p); setCustomDate(d); }} />
        <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
          Moving this earlier does not fetch older videos by itself. Save, then press <strong>Find videos</strong>.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 180px' }}>
          <label style={label}>Short videos</label>
          <MinLengthSelect small value={minDuration} onChange={setMinDuration} />
        </div>
        <div>
          <label style={label}>Quality</label>
          <QualitySelect small value={maxQuality} onChange={setMaxQuality} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', paddingBottom: 6 }}>
          <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} style={{ width: 16, height: 16 }} />
          Auto-download new videos
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={btn('primary', { small: true, disabled: saving })}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} style={btn('subtle', { small: true })}>Cancel</button>
      </div>
    </div>
  );
}

function ChannelVideos({ channelId, onError, onAction }: { channelId: number; onError: (m: string) => void; onAction: () => void }) {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'done' | 'error' | 'pending'>('all');

  const load = useCallback(() => {
    api<Video[]>(`/api/channels/${channelId}/videos`).then(setVideos).catch((err) => onError(errorMessage(err)));
  }, [channelId, onError]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!videos) return <p style={{ color: colors.muted, fontSize: 13, padding: 8 }}>Loading…</p>;

  const shown = videos.filter((v) => filter === 'all' || v.status === filter);
  const count = (s: string) => videos.filter((v) => v.status === s).length;
  const chip = (f: typeof filter, text: string) => (
    <button key={f} onClick={() => setFilter(f)} style={btn(filter === f ? 'primary' : 'subtle', { small: true })}>{text}</button>
  );

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chip('all', `All ${videos.length}`)}
        {chip('done', `Downloaded ${count('done')}`)}
        {count('pending') > 0 && chip('pending', `Waiting ${count('pending')}`)}
        {count('error') > 0 && chip('error', `Failed ${count('error')}`)}
      </div>
      {shown.length === 0 && <p style={{ color: colors.muted, fontSize: 13, padding: 8 }}>No videos here.</p>}
      {shown.map((v) => (
        <VideoRow key={v.id} video={v} showChannel={false} onChanged={() => { load(); onAction(); }} onError={onError} />
      ))}
    </div>
  );
}

export function ChannelList({ onAction }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const showError = useCallback((text: string) => setNotice({ ok: false, text }), []);

  const fetchChannels = useCallback(() => {
    api<Channel[]>('/api/channels')
      .then((data) => { setChannels(data); setLoading(false); })
      .catch((err) => showError(errorMessage(err)));
  }, [showError]);

  useEffect(() => {
    fetchChannels();
    const t = setInterval(fetchChannels, 20_000);
    return () => clearInterval(t);
  }, [fetchChannels]);

  const changed = () => { fetchChannels(); onAction(); };

  const handleDelete = async (ch: Channel) => {
    if (!confirm(`Remove ${ch.name}? It will stop checking for new videos.`)) return;
    const deleteFiles = ch.done_count > 0 && confirm(
      `Also delete the ${ch.done_count} downloaded video${ch.done_count === 1 ? '' : 's'} from the drive?\n\nOK = delete the files too.\nCancel = keep the files so Infuse can still play them.`,
    );
    setBusyId(ch.id);
    try {
      const r = await api<{ filesRemoved: number }>(`/api/channels/${ch.id}?deleteFiles=${deleteFiles}`, { method: 'DELETE' });
      setNotice({ ok: true, text: deleteFiles ? `Removed ${ch.name} and ${r.filesRemoved} file${r.filesRemoved === 1 ? '' : 's'}.` : `Removed ${ch.name}. Files were kept.` });
      changed();
    } catch (err) {
      showError(`Could not remove ${ch.name}: ${errorMessage(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleBackfill = async (ch: Channel) => {
    setBusyId(ch.id);
    try {
      await api(`/api/channels/${ch.id}/backfill`, { method: 'POST' });
      setNotice({ ok: true, text: `Looking for videos from ${ch.name} since ${ch.from_date}. New ones will appear over the next few minutes.` });
      onAction();
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p style={{ padding: 20, color: colors.muted }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Channels ({channels.length})</h2>
        <button onClick={() => setShowAdd(!showAdd)} style={btn(showAdd ? 'subtle' : 'primary')}>{showAdd ? 'Cancel' : 'Add channel'}</button>
      </div>

      {showAdd && (
        <AddChannelForm onAdded={(name) => {
          setShowAdd(false);
          setNotice({ ok: true, text: `Added ${name}. Finding its videos now; they will show up over the next few minutes.` });
          changed();
        }} />
      )}

      {notice && (
        <div style={{ ...card, marginBottom: 12, fontSize: 13, color: notice.ok ? colors.success : colors.danger, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{notice.text}</span>
          <button style={btn('subtle', { small: true })} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {channels.length === 0 && !showAdd && (
        <p style={{ color: colors.muted }}>No channels yet. Press "Add channel" to get started.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {channels.map((ch) => {
          const busy = busyId === ch.id;
          const open = openId === ch.id;
          return (
            <div key={ch.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{ch.name}</div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {ch.done_count} downloaded
                    {ch.pending_count > 0 && <span style={{ color: colors.primary }}> · {ch.pending_count} waiting for approval</span>}
                    {ch.error_count > 0 && <span style={{ color: colors.danger }}> · {ch.error_count} failed</span>}
                    {' · since '}{ch.from_date}
                    {' · '}{ch.auto_approve ? 'auto-download' : 'manual approval'}
                    {ch.min_duration > 0 ? ` · shorts under ${Math.round(ch.min_duration / 60)} min` : ''}
                    {` · ${ch.max_quality || 720}p`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setOpenId(open ? null : ch.id)} style={btn(open ? 'primary' : 'ghost', { small: true })}>
                    {open ? 'Hide videos' : 'Videos'}
                  </button>
                  <button onClick={() => handleBackfill(ch)} disabled={busy} style={btn('ghost', { small: true, disabled: busy })} title="Check YouTube for videos back to the start date">
                    Find videos
                  </button>
                  <button onClick={() => setEditingId(editingId === ch.id ? null : ch.id)} style={btn('subtle', { small: true })}>
                    {editingId === ch.id ? 'Cancel' : 'Settings'}
                  </button>
                  <button onClick={() => handleDelete(ch)} disabled={busy} style={btn('danger', { small: true, disabled: busy })}>
                    Remove
                  </button>
                </div>
              </div>

              {editingId === ch.id && (
                <EditChannelForm
                  channel={ch}
                  onSaved={() => { setEditingId(null); setNotice({ ok: true, text: `Saved ${ch.name}.` }); changed(); }}
                  onCancel={() => setEditingId(null)}
                  onError={showError}
                />
              )}

              {open && <ChannelVideos channelId={ch.id} onError={showError} onAction={changed} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
