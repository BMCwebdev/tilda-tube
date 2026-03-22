import React, { useState, useEffect } from 'react';
import { AddChannelForm } from './AddChannelForm';

interface Channel {
  id: number;
  name: string;
  channel_id: string;
  channel_url: string;
  from_date: string;
  auto_approve: number;
  video_count: number;
  pending_count: number;
}

interface Props {
  onAction: () => void;
}

export function ChannelList({ onAction }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

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
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fff',
              borderRadius: 8,
              padding: '12px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{ch.name}</div>
              <div style={{ fontSize: 13, color: '#888' }}>
                Since {ch.from_date} &middot; {ch.video_count} video{ch.video_count !== 1 ? 's' : ''}{' '}
                {ch.pending_count > 0 && `(${ch.pending_count} pending)`} &middot;{' '}
                {ch.auto_approve ? 'Auto-approve' : 'Manual review'}
              </div>
            </div>
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
        ))}
      </div>
    </div>
  );
}
