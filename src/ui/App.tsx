import React, { useState, useEffect } from 'react';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ChannelList } from './components/ChannelList';
import { Library } from './components/Library';

type View = 'queue' | 'channels' | 'library';

interface StatusData {
  pendingCount: number;
  channelCount: number;
  doneCount: number;
  downloadingCount: number;
  errorCount: number;
}

export default function App() {
  const [view, setView] = useState<View>('queue');
  const [status, setStatus] = useState<StatusData | null>(null);

  const refreshStatus = () => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error);
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 10_000);
    return () => clearInterval(interval);
  }, []);

  const navStyle = (v: View): React.CSSProperties => ({
    padding: '10px 20px',
    cursor: 'pointer',
    borderBottom: view === v ? '3px solid #2563eb' : '3px solid transparent',
    fontWeight: view === v ? 700 : 400,
    color: view === v ? '#2563eb' : '#666',
    background: 'none',
    border: 'none',
    borderBottomWidth: '3px',
    borderBottomStyle: 'solid',
    borderBottomColor: view === v ? '#2563eb' : 'transparent',
    fontSize: '15px',
    position: 'relative' as const,
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      <header style={{ padding: '20px 0 0', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>TildaTube</h1>
        <nav style={{ display: 'flex', gap: 0, borderBottom: '1px solid #ddd' }}>
          <button style={navStyle('queue')} onClick={() => setView('queue')}>
            Queue
            {status && status.pendingCount > 0 && (
              <span
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '2px 8px',
                  fontSize: 12,
                  marginLeft: 8,
                  fontWeight: 600,
                }}
              >
                {status.pendingCount}
              </span>
            )}
          </button>
          <button style={navStyle('channels')} onClick={() => setView('channels')}>
            Channels
          </button>
          <button style={navStyle('library')} onClick={() => setView('library')}>
            Library
          </button>
        </nav>
      </header>

      {view === 'queue' && <ApprovalQueue onAction={refreshStatus} />}
      {view === 'channels' && <ChannelList onAction={refreshStatus} />}
      {view === 'library' && <Library />}
    </div>
  );
}
