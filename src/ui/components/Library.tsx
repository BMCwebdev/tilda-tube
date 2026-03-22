import React, { useState, useEffect } from 'react';

interface Video {
  id: number;
  youtube_id: string;
  title: string;
  published_at: string;
  status: string;
  file_path: string | null;
  error_message: string | null;
  channel_name: string | null;
}

export function Library() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'done' | 'error' | 'all'>('done');

  useEffect(() => {
    fetch('/api/videos')
      .then((r) => r.json())
      .then((data) => {
        setVideos(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  if (loading) return <p style={{ padding: 20, color: '#888' }}>Loading...</p>;

  const filtered = videos.filter((v) => {
    if (filter === 'done') return v.status === 'done';
    if (filter === 'error') return v.status === 'error';
    return true;
  });

  const tabStyle = (f: string): React.CSSProperties => ({
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    background: filter === f ? '#2563eb' : '#e5e7eb',
    color: filter === f ? '#fff' : '#333',
    fontWeight: 600,
    fontSize: 13,
  });

  const statusColor: Record<string, string> = {
    done: '#22c55e',
    error: '#ef4444',
    downloading: '#f59e0b',
    approved: '#3b82f6',
    pending: '#9ca3af',
    rejected: '#6b7280',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle('done')} onClick={() => setFilter('done')}>
          Downloaded
        </button>
        <button style={tabStyle('error')} onClick={() => setFilter('error')}>
          Errors
        </button>
        <button style={tabStyle('all')} onClick={() => setFilter('all')}>
          All
        </button>
      </div>

      {filtered.length === 0 && (
        <p style={{ color: '#888' }}>No videos to show.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((v) => (
          <div
            key={v.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fff',
              borderRadius: 6,
              padding: '10px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              fontSize: 14,
            }}
          >
            <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.title}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {v.channel_name || 'Single video'} &middot;{' '}
                {new Date(v.published_at).toLocaleDateString()}
                {v.error_message && (
                  <span style={{ color: '#ef4444' }}> &middot; {v.error_message}</span>
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: statusColor[v.status] || '#888',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              {v.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
