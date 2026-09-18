import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Video, VideoStatus } from '../lib/types';
import { api, errorMessage, uploadFile } from '../lib/api';
import { btn, card, colors, input, label } from '../lib/styles';
import { VideoRow } from './VideoRow';

type Filter = 'done' | 'error' | 'rejected' | 'all';

interface Props {
  onAction: () => void;
}

function ImportPanel({ onImported, onError }: { onImported: (title: string) => void; onError: (m: string) => void }) {
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    api<string[]>('/api/folders').then((f) => { setFolders(f); if (!folder && f.length) setFolder(f[0]); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetFolder = folder === '__new__' ? newFolder.trim() : folder;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (!targetFolder) { onError('Choose a folder for the video'); return; }
    setProgress(0);
    try {
      await uploadFile(file, { folder: targetFolder, title: title.trim() || undefined, date }, setProgress);
      onImported(title.trim() || file.name);
      setFile(null);
      setTitle('');
      if (folder === '__new__') { setFolders((f) => [...new Set([...f, targetFolder])].sort()); setFolder(targetFolder); setNewFolder(''); }
    } catch (err) {
      onError(`Import failed: ${errorMessage(err)}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={submit} style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 600 }}>Add a video file from this device</div>
      <div style={{ fontSize: 12, color: colors.muted, marginTop: -8 }}>
        For home videos or files that did not come from YouTube. It goes straight into the folder you pick and shows up in Infuse.
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>Folder</label>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ ...input, width: '100%' }}>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="__new__">New folder…</option>
          </select>
          {folder === '__new__' && (
            <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name, e.g. Home Videos" style={{ ...input, width: '100%', marginTop: 6 }} required />
          )}
        </div>
        <div style={{ flex: '0 1 160px' }}>
          <label style={label}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, width: '100%' }} />
        </div>
      </div>
      <div>
        <label style={label}>Title (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file name" style={{ ...input, width: '100%' }} />
      </div>
      <div>
        <label style={label}>Video file</label>
        <input type="file" accept="video/*,.mkv,.avi,.ts,.mpg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 14 }} required />
      </div>
      {progress !== null && (
        <div>
          <div style={{ height: 8, background: colors.subtle, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: colors.primary, transition: 'width .2s' }} />
          </div>
          <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
            {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Making a thumbnail…'}
          </div>
        </div>
      )}
      <button type="submit" disabled={!file || progress !== null} style={{ ...btn('primary', { disabled: !file || progress !== null }), alignSelf: 'flex-start' }}>
        Import
      </button>
    </form>
  );
}

export function Library({ onAction }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('done');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const showError = useCallback((text: string) => setNotice({ ok: false, text }), []);

  const load = useCallback(() => {
    api<Video[]>('/api/videos')
      .then((data) => { setVideos(data); setLoading(false); })
      .catch((err) => showError(errorMessage(err)));
  }, [showError]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const changed = () => { load(); onAction(); };

  const channelNames = useMemo(() => {
    const names = new Set<string>();
    for (const v of videos) names.add(v.channel_name || (v.source === 'local' ? 'Imported files' : 'Single videos'));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [videos]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of videos) c[v.status] = (c[v.status] || 0) + 1;
    return c as Partial<Record<VideoStatus, number>>;
  }, [videos]);

  const filtered = videos.filter((v) => {
    if (filter !== 'all' && v.status !== filter) return false;
    if (filter === 'all' && v.status === 'deleted') return false;
    const name = v.channel_name || (v.source === 'local' ? 'Imported files' : 'Single videos');
    if (channel !== 'all' && name !== channel) return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const retryAllErrors = async () => {
    const ids = filtered.filter((v) => v.status === 'error').map((v) => v.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const r = await api<{ changed: number }>('/api/videos/bulk', { method: 'POST', json: { ids, action: 'retry' } });
      setNotice({ ok: true, text: `Retrying ${r.changed} video${r.changed === 1 ? '' : 's'}.` });
      changed();
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tab = (f: Filter, text: string) => (
    <button key={f} onClick={() => setFilter(f)} style={btn(filter === f ? 'primary' : 'subtle', { small: true })}>{text}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {tab('done', `Downloaded ${counts.done ?? 0}`)}
        {tab('error', `Failed ${counts.error ?? 0}`)}
        {tab('rejected', `Rejected ${counts.rejected ?? 0}`)}
        {tab('all', 'Everything')}
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowImport(!showImport)} style={btn(showImport ? 'subtle' : 'ghost', { small: true })}>
          {showImport ? 'Close import' : 'Import a file'}
        </button>
      </div>

      {showImport && (
        <ImportPanel
          onImported={(t) => { setNotice({ ok: true, text: `Imported "${t}".` }); setShowImport(false); changed(); }}
          onError={showError}
        />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles"
          style={{ ...input, flex: '1 1 180px' }}
        />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ ...input, flex: '0 1 200px' }}>
          <option value="all">All channels</option>
          {channelNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {filter === 'error' && filtered.length > 0 && (
          <button onClick={retryAllErrors} disabled={busy} style={btn('primary', { small: true, disabled: busy })}>
            Retry all {filtered.length}
          </button>
        )}
      </div>

      {notice && (
        <div style={{ ...card, fontSize: 13, color: notice.ok ? colors.success : colors.danger, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{notice.text}</span>
          <button style={btn('subtle', { small: true })} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <p style={{ padding: 20, color: colors.muted }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: colors.muted, padding: 8 }}>Nothing to show.</p>
      ) : (
        <>
          <div style={{ fontSize: 12, color: colors.muted }}>{filtered.length} video{filtered.length === 1 ? '' : 's'}</div>
          {filtered.slice(0, 300).map((v) => (
            <VideoRow key={v.id} video={v} onChanged={changed} onError={showError} />
          ))}
          {filtered.length > 300 && <p style={{ color: colors.muted, fontSize: 13 }}>Showing the first 300. Use search or the channel filter to narrow it down.</p>}
        </>
      )}
    </div>
  );
}
