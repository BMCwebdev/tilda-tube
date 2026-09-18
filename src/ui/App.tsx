import React, { useCallback, useEffect, useState } from 'react';
import { ApprovalQueue } from './components/ApprovalQueue';
import { ChannelList } from './components/ChannelList';
import { Library } from './components/Library';
import type { ServerStatus } from './lib/types';
import { api } from './lib/api';
import { colors } from './lib/styles';

type View = 'queue' | 'channels' | 'library';

const VIEW_KEY = 'tildatube.view';

export default function App() {
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === 'channels' || saved === 'library' ? saved : 'queue';
    } catch {
      return 'queue';
    }
  });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [offline, setOffline] = useState(false);

  const refreshStatus = useCallback(() => {
    api<ServerStatus>('/api/status')
      .then((s) => { setStatus(s); setOffline(false); })
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 10_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const pick = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
  };

  const tabStyle = (v: View): React.CSSProperties => ({
    flex: 1,
    padding: '12px 8px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: `3px solid ${view === v ? colors.primary : 'transparent'}`,
    fontWeight: view === v ? 700 : 500,
    color: view === v ? colors.primary : colors.muted,
    fontSize: 15,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  });

  const badge = (n: number, color: string) => (
    <span style={{ background: color, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{n}</span>
  );

  const activity: string[] = [];
  if (status?.currentDownload) activity.push(`Downloading: ${status.currentDownload.title}`);
  if (status && status.approvedCount > 0) activity.push(`${status.approvedCount} in line`);
  for (const j of status?.jobs ?? []) activity.push(j.label);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 40px' }}>
      <header style={{ padding: '16px 0 0', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.3 }}>TildaTube</h1>
          <div style={{ fontSize: 12, color: colors.muted }}>
            {offline ? <span style={{ color: colors.danger, fontWeight: 600 }}>Can't reach the server</span>
              : status ? `${status.doneCount} videos · ${status.channelCount} channels${status.dryRun ? ' · DRY RUN' : ''}` : ''}
          </div>
        </div>
        {activity.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: colors.warn, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activity.join(' · ')}
          </div>
        )}
        <nav style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, marginTop: 12 }}>
          <button style={tabStyle('queue')} onClick={() => pick('queue')}>
            Queue {status && status.pendingCount > 0 && badge(status.pendingCount, colors.danger)}
          </button>
          <button style={tabStyle('channels')} onClick={() => pick('channels')}>Channels</button>
          <button style={tabStyle('library')} onClick={() => pick('library')}>
            Library {status && status.errorCount > 0 && badge(status.errorCount, colors.warn)}
          </button>
        </nav>
      </header>

      {view === 'queue' && <ApprovalQueue onAction={refreshStatus} />}
      {view === 'channels' && <ChannelList onAction={refreshStatus} />}
      {view === 'library' && <Library onAction={refreshStatus} />}
    </div>
  );
}
