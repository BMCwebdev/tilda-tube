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
  const [videoUrl, setVideoUrl] = useState('');
  const [videoQuality, setVideoQuality] = useState(720);
  const [addingVideo, setAddingVideo] = useState(false);
  const [addError, setAddError] = useState('');

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

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    setAddingVideo(true);
    setAddError('');

    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl.trim(), maxQuality: videoQuality }),
      });

      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error || 'Failed to add video');
        return;
      }

      setVideoUrl('');
      fetchQueue();
      onAction();
    } catch (err: any) {
      setAddError(err.message || 'Network error');
    } finally {
      setAddingVideo(false);
    }
  };

  if (loading) return <p style={{ padding: 20, color: '#888' }}>Loading...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <form
        onSubmit={handleAddVideo}
        style={{
          display: 'flex',
          gap: 8,
          background: '#fff',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Paste a YouTube video URL to add it..."
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <select
          value={videoQuality}
          onChange={(e) => setVideoQuality(Number(e.target.value))}
          style={{
            padding: '8px 10px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 13,
            background: '#fff',
          }}
        >
          <option value={480}>480p</option>
          <option value={720}>720p</option>
          <option value={1080}>1080p</option>
        </select>
        <button
          type="submit"
          disabled={addingVideo}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: addingVideo ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: 14,
            opacity: addingVideo ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {addingVideo ? 'Adding...' : 'Add Video'}
        </button>
        {addError && (
          <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 500, width: '100%' }}>{addError}</div>
        )}
      </form>

      {videos.length === 0 && (
        <p style={{ color: '#888', padding: '8px 0' }}>No videos waiting for approval.</p>
      )}
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
