import { Router, type Request, type Response, type NextFunction } from 'express';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { childEnv, YT_DLP, MEDIA_DIR, DRY_RUN } from './env.js';
import {
  getAllChannels,
  addChannel,
  deleteChannel,
  updateChannel,
  getChannelById,
  getVideosByChannel,
  getPendingVideos,
  getAllVideos,
  getVideoById,
  getVideoByYoutubeId,
  updateVideoStatus,
  deleteVideoRow,
  insertVideo,
  getServerStatus,
  type Video,
} from './db.js';
import { downloadAllApproved, fetchChannelAvatar, getCurrentDownload, removeVideoFiles } from './downloader.js';
import { backfillChannel } from './poller.js';
import { importLocalFile, listLibraryFolders, ImportError } from './localimport.js';

export const router = Router();

/** Background jobs the UI can show ("Backfilling Mark Rober..."). */
const activeJobs = new Map<string, { label: string; startedAt: string }>();

function runInBackground(key: string, label: string, work: () => Promise<unknown>): void {
  if (activeJobs.has(key)) return;
  activeJobs.set(key, { label, startedAt: new Date().toISOString() });
  work()
    .catch((err) => console.error(`[Jobs] ${label} failed:`, err))
    .finally(() => activeJobs.delete(key));
}

// --- Validation helpers ---

const ALLOWED_QUALITY = new Set([480, 720, 1080]);
const QUALITY_HELP = 'maxQuality must be 480, 720 or 1080';

function parseId(raw: unknown): number | null {
  const id = parseInt(String(raw), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const host = u.hostname.replace(/^www\.|^m\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
  } catch {
    return false;
  }
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function optionalInt(raw: unknown, name: string, min: number, max: number): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} must be a whole number between ${min} and ${max}`);
  return n;
}

function optionalQuality(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!ALLOWED_QUALITY.has(n)) throw new HttpError(400, QUALITY_HELP);
  return n;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap an async handler so a throw becomes a JSON error instead of a hang. */
const wrap = (fn: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

// --- Channels ---

router.get('/api/channels', wrap((_req, res) => {
  res.json(getAllChannels());
}));

router.post('/api/channels', wrap(async (req, res) => {
  const { url, fromDate, autoApprove, minDuration, maxQuality } = req.body ?? {};
  if (typeof url !== 'string' || !isYouTubeUrl(url)) throw new HttpError(400, 'Please paste a YouTube channel URL');
  if (!isIsoDate(fromDate)) throw new HttpError(400, 'fromDate must be YYYY-MM-DD');
  const minDur = optionalInt(minDuration, 'minDuration', 0, 24 * 3600);
  const quality = optionalQuality(maxQuality);

  const { channelId, channelName } = await resolveChannel(url.trim());

  let channel;
  try {
    channel = addChannel({
      name: channelName,
      channel_id: channelId,
      channel_url: url.trim(),
      from_date: fromDate,
      auto_approve: !!autoApprove,
      min_duration: minDur,
      max_quality: quality,
    });
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, `${channelName} is already added`);
    throw err;
  }

  res.status(201).json(channel);

  const ch = channel;
  runInBackground(`backfill:${ch.id}`, `Finding videos for ${ch.name}`, async () => {
    await fetchChannelAvatar(channelId, channelName);
    await backfillChannel(ch);
    await downloadAllApproved();
  });
}));

router.patch('/api/channels/:id', wrap((req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new HttpError(400, 'Invalid channel ID');
  const { fromDate, autoApprove, minDuration, maxQuality } = req.body ?? {};
  if (fromDate !== undefined && !isIsoDate(fromDate)) throw new HttpError(400, 'fromDate must be YYYY-MM-DD');
  const updates = {
    from_date: fromDate as string | undefined,
    auto_approve: autoApprove === undefined ? undefined : !!autoApprove,
    min_duration: optionalInt(minDuration, 'minDuration', 0, 24 * 3600),
    max_quality: optionalQuality(maxQuality),
  };
  if (!getChannelById(id)) throw new HttpError(404, 'Channel not found');
  updateChannel(id, updates);
  res.json(getChannelById(id));
}));

router.get('/api/channels/:id/videos', wrap((req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new HttpError(400, 'Invalid channel ID');
  if (!getChannelById(id)) throw new HttpError(404, 'Channel not found');
  res.json(getVideosByChannel(id));
}));

router.post('/api/channels/:id/backfill', wrap((req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new HttpError(400, 'Invalid channel ID');
  const channel = getChannelById(id);
  if (!channel) throw new HttpError(404, 'Channel not found');
  const key = `backfill:${channel.id}`;
  if (activeJobs.has(key)) throw new HttpError(409, `Already looking for videos for ${channel.name}`);
  res.json({ success: true, message: `Looking for videos for ${channel.name}` });
  runInBackground(key, `Finding videos for ${channel.name}`, async () => {
    await backfillChannel(channel);
    await downloadAllApproved();
  });
}));

router.delete('/api/channels/:id', wrap((req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new HttpError(400, 'Invalid channel ID');
  const deleteFiles = String(req.query.deleteFiles) === 'true';
  const result = deleteChannel(id);
  if (!result) throw new HttpError(404, 'Channel not found');

  let filesRemoved = 0;
  if (deleteFiles) {
    for (const fp of result.filePaths) if (removeVideoFiles(fp)) filesRemoved++;
    for (const dir of [path.join(MEDIA_DIR, result.name), path.join(MEDIA_DIR, 'Shorts', result.name)]) {
      try {
        const rest = fs.readdirSync(dir).filter((f) => !['folder.jpg', '.DS_Store'].includes(f));
        if (rest.length === 0) fs.rmSync(dir, { recursive: true, force: true });
      } catch { /* folder absent or not empty; leave it */ }
    }
  }
  res.json({ success: true, videosRemoved: result.filePaths.length, filesRemoved });
}));

// --- Videos ---

router.get('/api/queue', wrap((_req, res) => {
  res.json(getPendingVideos());
}));

router.get('/api/videos', wrap((_req, res) => {
  res.json(getAllVideos());
}));

router.post('/api/videos', wrap(async (req, res) => {
  const { url, maxQuality } = req.body ?? {};
  if (typeof url !== 'string' || !isYouTubeUrl(url)) throw new HttpError(400, 'Please paste a YouTube video URL');
  const quality = optionalQuality(maxQuality);

  const info = await resolveVideo(url.trim());

  // Re-adding something previously rejected, deleted or failed just puts it back in the queue.
  const existing = getVideoByYoutubeId(info.id);
  if (existing) {
    if (existing.status === 'done' || existing.status === 'downloading' || existing.status === 'approved') {
      throw new HttpError(409, `"${existing.title}" is already in the library`);
    }
    if (existing.status === 'pending') throw new HttpError(409, `"${existing.title}" is already waiting for approval`);
    updateVideoStatus(existing.id, 'pending', { error_message: null, file_path: null });
    res.status(200).json(getVideoById(existing.id));
    return;
  }

  const video = insertVideo({
    channel_id: null,
    youtube_id: info.id,
    title: info.title,
    thumbnail_url: info.thumbnail || `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
    published_at: info.uploadDate ?? new Date().toISOString().slice(0, 10),
    status: 'pending',
    max_quality: quality ?? null,
    duration: info.duration,
  });
  if (!video) throw new HttpError(409, 'Video already exists');
  res.status(201).json(video);
}));

function transition(video: Video, action: 'approve' | 'reject' | 'retry'): void {
  const allowed: Record<typeof action, Video['status'][]> = {
    approve: ['pending', 'rejected'],
    reject: ['pending', 'approved', 'error'],
    retry: ['error', 'rejected', 'deleted'],
  };
  if (!allowed[action].includes(video.status)) {
    throw new HttpError(400, `Cannot ${action} a video that is "${video.status}"`);
  }
  if (action === 'reject') updateVideoStatus(video.id, 'rejected');
  else updateVideoStatus(video.id, 'approved', { error_message: null, file_path: null });
}

for (const action of ['approve', 'reject', 'retry'] as const) {
  router.post(`/api/videos/:id/${action}`, wrap((req, res) => {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid video ID');
    const video = getVideoById(id);
    if (!video) throw new HttpError(404, 'Video not found');
    if (video.source === 'local') throw new HttpError(400, 'Imported files cannot be re-downloaded');
    transition(video, action);
    res.json({ success: true, status: action === 'reject' ? 'rejected' : 'approved' });
    if (action !== 'reject') downloadAllApproved().catch((err) => console.error('[API] Download error:', err));
  }));
}

/** Bulk approve / reject / retry / delete. Body: { ids: number[], action, deleteFiles? } */
router.post('/api/videos/bulk', wrap((req, res) => {
  const { ids, action, deleteFiles } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) throw new HttpError(400, 'ids must be a non-empty list');
  if (!['approve', 'reject', 'retry', 'delete'].includes(action)) throw new HttpError(400, 'Unknown action');
  let changed = 0;
  const skipped: number[] = [];
  for (const raw of ids) {
    const id = parseId(raw);
    const video = id ? getVideoById(id) : undefined;
    if (!video) { skipped.push(Number(raw)); continue; }
    try {
      if (action === 'delete') deleteVideo(video, !!deleteFiles);
      else {
        if (video.source === 'local') throw new Error('local');
        transition(video, action);
      }
      changed++;
    } catch {
      skipped.push(video.id);
    }
  }
  res.json({ success: true, changed, skipped });
  if (action === 'approve' || action === 'retry') downloadAllApproved().catch((err) => console.error('[API] Download error:', err));
}));

/**
 * Remove a video. The file (and its .jpg) is deleted when deleteFile=true.
 * YouTube videos keep a row marked "deleted" so the next poll doesn't
 * re-download them; imported files are removed outright.
 */
function deleteVideo(video: Video, deleteFile: boolean): void {
  if (deleteFile && video.file_path) removeVideoFiles(video.file_path);
  if (video.source === 'local') deleteVideoRow(video.id);
  else updateVideoStatus(video.id, 'deleted', { file_path: null, error_message: null });
}

router.delete('/api/videos/:id', wrap((req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new HttpError(400, 'Invalid video ID');
  const video = getVideoById(id);
  if (!video) throw new HttpError(404, 'Video not found');
  if (video.status === 'downloading') throw new HttpError(409, 'That video is downloading right now; try again when it finishes');
  deleteVideo(video, String(req.query.deleteFile) === 'true');
  res.json({ success: true });
}));

// --- Local file import ---

router.get('/api/folders', wrap((_req, res) => {
  const fromDisk = listLibraryFolders();
  const fromChannels = getAllChannels().map((c) => c.name);
  res.json([...new Set([...fromDisk, ...fromChannels])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
}));

/**
 * POST /api/import?folder=...&filename=...&title=...&date=YYYY-MM-DD
 * Body is the raw file (Content-Type: application/octet-stream).
 */
router.post('/api/import', wrap(async (req, res) => {
  const folder = String(req.query.folder || '').trim();
  const filename = String(req.query.filename || '').trim();
  if (!folder) throw new HttpError(400, 'folder is required');
  if (!filename) throw new HttpError(400, 'filename is required');
  try {
    const video = await importLocalFile(req, {
      folder,
      filename,
      title: req.query.title ? String(req.query.title) : undefined,
      date: req.query.date ? String(req.query.date) : undefined,
    });
    res.status(201).json(video);
  } catch (err) {
    req.resume(); // drain whatever the client is still sending so the reply gets through
    if (err instanceof ImportError) throw new HttpError(400, err.message);
    throw err;
  }
}));

// --- Status ---

router.get('/api/status', wrap((_req, res) => {
  res.json({
    ...getServerStatus(),
    currentDownload: getCurrentDownload(),
    jobs: [...activeJobs.values()],
    dryRun: DRY_RUN,
  });
}));

// --- yt-dlp helpers (never with shell: true — the URL is user input) ---

function ytdlpJson<T>(args: string[], timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(YT_DLP, ['--no-warnings', '--no-download', ...args], { timeout: timeoutMs, env: childEnv, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message).split('\n').filter((l) => l.startsWith('ERROR')).pop() || stderr || error.message;
          reject(new HttpError(502, msg.replace(/^ERROR:\s*(\[\w+\]\s*)?/, '').trim() || 'yt-dlp failed'));
          return;
        }
        const line = stdout.split('\n').find((l) => l.trim().startsWith('{'));
        if (!line) { reject(new HttpError(502, 'yt-dlp returned nothing for that URL')); return; }
        try { resolve(JSON.parse(line) as T); } catch { reject(new HttpError(502, 'Could not read yt-dlp output')); }
      });
  });
}

async function resolveChannel(url: string): Promise<{ channelId: string; channelName: string }> {
  if (DRY_RUN) {
    const idMatch = url.match(/channel\/(UC[\w-]+)/);
    const nameMatch = url.match(/@([\w-]+)/) || url.match(/channel\/([\w-]+)/);
    return {
      channelId: idMatch ? idMatch[1] : 'UC_DRYRUN_' + Buffer.from(url).toString('base64').slice(0, 16),
      channelName: nameMatch ? nameMatch[1] : 'Unknown Channel',
    };
  }
  console.log(`[API] Resolving channel: ${url}`);
  const info = await ytdlpJson<{ channel_id?: string; channel?: string }>(
    ['--playlist-items', '1', '--print', '%(.{channel_id,channel})j', url], 90_000,
  );
  if (!info.channel_id) throw new HttpError(400, 'That does not look like a YouTube channel');
  console.log(`[API] Resolved: ${info.channel} (${info.channel_id})`);
  return { channelId: info.channel_id, channelName: info.channel || 'Unknown Channel' };
}

interface VideoInfo {
  id: string;
  title: string;
  uploadDate: string | null;
  thumbnail: string | null;
  duration: number | null;
}

async function resolveVideo(url: string): Promise<VideoInfo> {
  if (DRY_RUN) {
    const match = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/) || url.match(/shorts\/([\w-]{11})/);
    return { id: match ? match[1] : 'DRY' + Math.random().toString(36).slice(2, 10), title: 'Dry Run Video', uploadDate: null, thumbnail: null, duration: 300 };
  }
  // One call instead of two; --no-playlist so a "watch?v=...&list=..." URL yields one video.
  const info = await ytdlpJson<{ id?: string; title?: string; upload_date?: string; thumbnail?: string; duration?: number }>(
    ['--no-playlist', '--print', '%(.{id,title,upload_date,thumbnail,duration})j', url], 90_000,
  );
  if (!info.id) throw new HttpError(400, 'That does not look like a YouTube video');
  const raw = info.upload_date;
  return {
    id: info.id,
    title: info.title || 'Untitled',
    uploadDate: raw && /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null,
    thumbnail: info.thumbnail || null,
    duration: typeof info.duration === 'number' ? Math.round(info.duration) : null,
  };
}
