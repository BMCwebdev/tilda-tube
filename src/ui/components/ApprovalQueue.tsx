import React, { useState, useEffect } from 'react';

interface Video {
  id: number;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string;
  channel_name: string | null;
}

interface Props {
  onAction: () => void;
}

export function ApprovalQueue({ onAction }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  const fetchQueue = () => {
    fetch('/api/queue')
      .then((r) => r.json())
      .then((data) => {
        setVideos(data);
        setLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15_000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setActing(id);
    try {
      await fetch(`/api/videos/${id}/${action}`, { method: 'POST' });
      setVideos((prev) => prev.filter((v) => v.id !== id));
      onAction();
    } catch (err) {
      console.error(err);
    } finally {
      setActing(null);
    }
  };

  if (loading) return <p style={{ padding: 20, color: '#888' }}>Loading...</p>;
  if (videos.length === 0) {
    return <p style={{ padding: 20, color: '#888' }}>No videos waiting for approval.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {videos.map((video) => (
        <div
          key={video.id}
          style={{
            display: 'flex',
            gap: 16,
            background: '#fff',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            alignItems: 'center',
          }}
        >
          {video.thumbnail_url && (
            <img
              src={video.thumbnail_url}
              alt=""
              style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.title}
            </div>
            <div style={{ fontSize: 13, color: '#888' }}>
              {video.channel_name || 'Single video'} &middot;{' '}
              {new Date(video.published_at).toLocaleDateString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => handleAction(video.id, 'approve')}
              disabled={acting === video.id}
              style={{
                padding: '8px 16px',
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Approve
            </button>
            <button
              onClick={() => handleAction(video.id, 'reject')}
              disabled={acting === video.id}
              style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
