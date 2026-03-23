import React, { useState, useEffect } from 'react';
import { AddChannelForm } from './AddChannelForm';

interface Channel {
  id: number;
  name: string;
  channel_id: string;
  channel_url: string;
  from_date: string;
  auto_approve: number;
  min_duration: number;
  video_count: number;
  pending_count: number;
}

interface Props {
  onAction: () => void;
}

type DatePreset = '6months' | '1year' | '2years' | 'all' | 'custom';

function getDateFromPreset(preset: DatePreset): string {
  const now = new Date();
  switch (preset) {
    case '6months':
      now.setMonth(now.getMonth() - 6);
      return now.toISOString().split('T')[0];
    case '1year':
      now.setFullYear(now.getFullYear() - 1);
      return now.toISOString().split('T')[0];
    case '2years':
      now.setFullYear(now.getFullYear() - 2);
      return now.toISOString().split('T')[0];
    case 'all':
      return '2005-01-01';
    case 'custom':
      return now.toISOString().split('T')[0];
  }
}

function EditChannelForm({ channel, onSave, onCancel }: {
  channel: Channel;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [datePreset, setDatePreset] = useState<DatePreset>('custom');
  const [customDate, setCustomDate] = useState(channel.from_date);
  const [autoApprove, setAutoApprove] = useState(!!channel.auto_approve);
  const [minDuration, setMinDuration] = useState(channel.min_duration ?? 120);
  const [saving, setSaving] = useState(false);

  const fromDate = datePreset === 'custom' ? customDate : getDateFromPreset(datePreset);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, autoApprove, minDuration }),
      });
      onSave();
    } catch (err) {
      console.error('Failed to update channel:', err);
    } finally {
      setSaving(false);
    }
  };

  const presetButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px',
    border: active ? '2px solid #2563eb' : '1px solid #ddd',
    borderRadius: 6,
    background: active ? '#eff6ff' : '#fff',
    color: active ? '#2563eb' : '#333',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{
      background: '#f8fafc',
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
      border: '1px solid #e2e8f0',
    }}>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#555' }}>
          Download videos from
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setDatePreset('6months')} style={presetButtonStyle(datePreset === '6months')}>
            Last 6 months
          </button>
          <button type="button" onClick={() => setDatePreset('1year')} style={presetButtonStyle(datePreset === '1year')}>
            Last year
          </button>
          <button type="button" onClick={() => setDatePreset('2years')} style={presetButtonStyle(datePreset === '2years')}>
            Last 2 years
          </button>
          <button type="button" onClick={() => setDatePreset('all')} style={presetButtonStyle(datePreset === 'all')}>
            All time
          </button>
          <button type="button" onClick={() => setDatePreset('custom')} style={presetButtonStyle(datePreset === 'custom')}>
            Custom
          </button>
        </div>
        {datePreset === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            style={{
              marginTop: 6,
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 13,
            }}
          />
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Auto-approve new videos
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Min length</label>
          <select
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            style={{
              padding: '4px 8px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 12,
              background: '#fff',
            }}
          >
            <option value={0}>No filter</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
            <option value={300}>5 minutes</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 14px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            background: '#f1f5f9',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ChannelList({ onAction }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchChannels = () => {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((data) => {
        setChannels(data);
        setLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this channel? Downloaded files will not be deleted.')) return;
    await fetch(`/api/channels/${id}`, { method: 'DELETE' });
    fetchChannels();
    onAction();
  };

  const handleAdded = () => {
    setShowAdd(false);
    fetchChannels();
    onAction();
  };

  const handleEditSave = () => {
    setEditingId(null);
    fetchChannels();
    onAction();
  };

  if (loading) return <p style={{ padding: 20, color: '#888' }}>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Channels ({channels.length})</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {showAdd ? 'Cancel' : 'Add Channel'}
        </button>
      </div>

      {showAdd && <AddChannelForm onAdded={handleAdded} />}

      {channels.length === 0 && !showAdd && (
        <p style={{ color: '#888' }}>No channels added yet. Click "Add Channel" to get started.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {channels.map((ch) => (
          <div
            key={ch.id}
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '12px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{ch.name}</div>
                <div style={{ fontSize: 13, color: '#888' }}>
                  Since {ch.from_date} &middot; {ch.video_count} video{ch.video_count !== 1 ? 's' : ''}{' '}
                  {ch.pending_count > 0 && `(${ch.pending_count} pending)`} &middot;{' '}
                  {ch.auto_approve ? 'Auto-approve' : 'Manual review'}
                  {ch.min_duration > 0 && ` · Min ${Math.floor(ch.min_duration / 60)}m`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setEditingId(editingId === ch.id ? null : ch.id)}
                  style={{
                    padding: '6px 12px',
                    background: '#f0f9ff',
                    color: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {editingId === ch.id ? 'Cancel' : 'Edit'}
                </button>
                <button
                  onClick={() => handleDelete(ch.id)}
                  style={{
                    padding: '6px 12px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Remove
                </button>
              </div>
            </div>

            {editingId === ch.id && (
              <EditChannelForm
                channel={ch}
                onSave={handleEditSave}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
