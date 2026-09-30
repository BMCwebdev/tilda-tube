import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getNextApprovedVideo, updateVideoStatus, getChannelById, } from './db.js';
import { childEnv, YT_DLP, MEDIA_DIR, INCOMING_DIR, DRY_RUN } from './env.js';
const MIN_FREE_SPACE_BYTES = 1024 * 1024 * 1024; // 1 GB
const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 h: a hung yt-dlp must not block the queue forever
const MAX_ERROR_CHARS = 2000;
let isDownloading = false;
let current = null;
/** What the downloader is working on right now, for the UI. */
export function getCurrentDownload() {
    return current;
}
/**
 * Download every approved video, one at a time, oldest approval first.
 * Safe to call from anywhere at any time: if a loop is already running it
 * simply returns, and the running loop will pick up newly approved rows.
 */
export async function downloadAllApproved() {
    if (isDownloading)
        return;
    isDownloading = true;
    try {
        while (true) {
            if (!hasFreeSpace())
                break;
            const video = getNextApprovedVideo();
            if (!video)
                break;
            const channel = video.channel_id ? getChannelById(video.channel_id) : undefined;
            await downloadOne(video, channel);
        }
    }
    finally {
        isDownloading = false;
        current = null;
    }
}
function hasFreeSpace() {
    try {
        const stats = fs.statfsSync(MEDIA_DIR);
        const freeBytes = stats.bfree * stats.bsize;
        if (freeBytes < MIN_FREE_SPACE_BYTES) {
            console.error(`[Downloader] Low disk space (${(freeBytes / 1024 ** 3).toFixed(1)} GB free), pausing downloads`);
            return false;
        }
        return true;
    }
    catch {
        console.error('[Downloader] Cannot check disk space. Is the media drive mounted?');
        return false;
    }
}
async function downloadOne(video, channel) {
    const minDuration = channel?.min_duration ?? 0;
    console.log(`[Downloader] Starting: "${video.title}" (${video.youtube_id})`);
    updateVideoStatus(video.id, 'downloading', { error_message: null });
    current = { id: video.id, title: video.title, startedAt: new Date().toISOString() };
    try {
        if (DRY_RUN) {
            await new Promise((r) => setTimeout(r, 1500));
            updateVideoStatus(video.id, 'done', { file_path: `${MEDIA_DIR}/DryRun/${video.youtube_id}.mp4`, duration: 300 });
            console.log(`[Downloader] DRY_RUN: marked "${video.title}" done`);
            return;
        }
        // Quality: per-video override (single videos) > channel setting > 720
        const maxQuality = video.max_quality ?? channel?.max_quality ?? 720;
        const result = await runYtDlp(video.youtube_id, maxQuality);
        // Shorts routing uses the duration yt-dlp reported during the download,
        // so there is no separate metadata call per video any more.
        const isShort = minDuration > 0 && result.duration !== null && result.duration <= minDuration;
        const finalPath = moveIntoLibrary(result.filePath, isShort);
        if (isShort)
            ensureShortsFolderJpg(path.basename(path.dirname(finalPath)));
        updateVideoStatus(video.id, 'done', {
            file_path: finalPath,
            duration: result.duration,
            ...(result.uploadDate ? { published_at: result.uploadDate } : {}),
        });
        console.log(`[Downloader] Done${isShort ? ' (short)' : ''}: "${video.title}" -> ${finalPath}`);
    }
    catch (err) {
        const msg = String(err?.message || err).slice(-MAX_ERROR_CHARS);
        console.error(`[Downloader] Failed: "${video.title}" - ${msg}`);
        updateVideoStatus(video.id, 'error', { error_message: msg });
    }
    finally {
        current = null;
    }
}
/**
 * Run yt-dlp for one video. Downloads into INCOMING_DIR/<channel>/ and
 * prints one JSON line of metadata before the download plus the final
 * file path after it, which is all we need to file the video correctly.
 */
function runYtDlp(youtubeId, maxQuality) {
    return new Promise((resolve, reject) => {
        const url = `https://www.youtube.com/watch?v=${youtubeId}`;
        const args = [
            '--format', `bestvideo[height<=${maxQuality}]+bestaudio/best[height<=${maxQuality}]`,
            '--merge-output-format', 'mp4',
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            '--embed-thumbnail',
            '--embed-metadata',
            '--no-playlist',
            '--no-progress',
            '--print', '%(.{channel,upload_date,duration})j',
            '--print', 'after_move:filepath',
            '-o', `${INCOMING_DIR}/%(channel)s/%(upload_date>%Y-%m-%d)s - %(title)s.%(ext)s`,
            url,
        ];
        execFile(YT_DLP, args, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: DOWNLOAD_TIMEOUT_MS,
            env: childEnv,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr?.trim() || error.message));
                return;
            }
            const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
            const filePath = lines[lines.length - 1] || '';
            if (!filePath || !fs.existsSync(filePath)) {
                reject(new Error(`yt-dlp finished but no file was produced (stdout: ${stdout.slice(0, 300)})`));
                return;
            }
            let meta = {};
            const jsonLine = lines.find((l) => l.startsWith('{'));
            if (jsonLine) {
                try {
                    meta = JSON.parse(jsonLine);
                }
                catch { /* metadata is best-effort */ }
            }
            const raw = meta.upload_date;
            const uploadDate = raw && /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null;
            const duration = typeof meta.duration === 'number' && Number.isFinite(meta.duration) ? Math.round(meta.duration) : null;
            resolve({ filePath, channel: meta.channel ?? null, uploadDate, duration });
        });
    });
}
/**
 * Move a finished download (and its .jpg sidecar) from INCOMING_DIR into the
 * library. The channel folder name is whatever yt-dlp sanitized it to, so it
 * matches folders created by earlier versions.
 */
function moveIntoLibrary(incomingPath, isShort) {
    const channelFolder = path.basename(path.dirname(incomingPath));
    const destDir = isShort ? path.join(MEDIA_DIR, 'Shorts', channelFolder) : path.join(MEDIA_DIR, channelFolder);
    fs.mkdirSync(destDir, { recursive: true });
    const base = incomingPath.slice(0, -path.extname(incomingPath).length);
    const sidecar = `${base}.jpg`;
    const dest = path.join(destDir, path.basename(incomingPath));
    moveFile(incomingPath, dest);
    if (fs.existsSync(sidecar))
        moveFile(sidecar, path.join(destDir, path.basename(sidecar)));
    try {
        fs.rmdirSync(path.dirname(incomingPath));
    }
    catch { /* not empty or already gone */ }
    return dest;
}
function moveFile(from, to) {
    try {
        fs.renameSync(from, to);
    }
    catch (err) {
        if (err.code !== 'EXDEV')
            throw err;
        fs.copyFileSync(from, to);
        fs.unlinkSync(from);
    }
}
/** Give Shorts/<channel>/ the same folder.jpg as the main channel folder. */
function ensureShortsFolderJpg(channelFolder) {
    const src = path.join(MEDIA_DIR, channelFolder, 'folder.jpg');
    const dst = path.join(MEDIA_DIR, 'Shorts', channelFolder, 'folder.jpg');
    try {
        if (fs.existsSync(src) && !fs.existsSync(dst))
            fs.copyFileSync(src, dst);
    }
    catch (err) {
        console.warn(`[Downloader] Could not copy folder.jpg for Shorts/${channelFolder}:`, err);
    }
}
/**
 * Fetch a YouTube channel's avatar and save it as folder.jpg in the channel's
 * media directory (and its Shorts folder, if that exists). Infuse uses
 * folder.jpg as the folder thumbnail when browsing over SMB.
 */
export async function fetchChannelAvatar(channelId, channelName) {
    if (DRY_RUN)
        return;
    const channelDir = path.join(MEDIA_DIR, channelName);
    try {
        const res = await fetch(`https://www.youtube.com/channel/${channelId}`);
        if (!res.ok) {
            console.warn(`[Avatar] Channel page for ${channelName}: HTTP ${res.status}`);
            return;
        }
        const html = await res.text();
        const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
        if (!match) {
            console.warn(`[Avatar] No og:image found for ${channelName}`);
            return;
        }
        const imgRes = await fetch(match[1]);
        if (!imgRes.ok) {
            console.warn(`[Avatar] Avatar download for ${channelName}: HTTP ${imgRes.status}`);
            return;
        }
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.mkdirSync(channelDir, { recursive: true });
        fs.writeFileSync(path.join(channelDir, 'folder.jpg'), buffer);
        const shortsDir = path.join(MEDIA_DIR, 'Shorts', channelName);
        if (fs.existsSync(shortsDir))
            fs.writeFileSync(path.join(shortsDir, 'folder.jpg'), buffer);
        console.log(`[Avatar] Saved folder.jpg for ${channelName}`);
    }
    catch (err) {
        console.error(`[Avatar] Error fetching avatar for ${channelName}:`, err);
    }
}
/**
 * Remove a video file and its .jpg sidecar from disk. Missing files are not
 * an error. Returns true if anything was removed.
 */
export function removeVideoFiles(filePath) {
    let removed = false;
    const base = filePath.slice(0, -path.extname(filePath).length);
    for (const p of [filePath, `${base}.jpg`]) {
        try {
            fs.unlinkSync(p);
            removed = true;
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                console.warn(`[Files] Could not remove ${p}:`, err.message);
        }
    }
    // Tidy an emptied channel folder (only folder.jpg / .DS_Store left)
    const dir = path.dirname(filePath);
    try {
        const rest = fs.readdirSync(dir).filter((f) => !['folder.jpg', '.DS_Store'].includes(f));
        if (rest.length === 0)
            fs.rmSync(dir, { recursive: true, force: true });
    }
    catch { /* ignore */ }
    return removed;
}
let lastUpdate = null;
export function getLastYtDlpUpdate() {
    return lastUpdate;
}
/**
 * Run `yt-dlp -U`. YouTube changes often and a yt-dlp older than ~90 days is
 * the most common reason downloads start failing, so the server does this on
 * a schedule. Never throws; the outcome is logged and kept for /api/status.
 */
export function updateYtDlp() {
    return new Promise((resolve) => {
        if (DRY_RUN) {
            lastUpdate = { at: new Date().toISOString(), ok: true, message: 'DRY_RUN: skipped' };
            resolve(lastUpdate);
            return;
        }
        execFile(YT_DLP, ['-U'], { env: childEnv, timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            const lines = `${stdout}\n${stderr}`.split('\n').map((l) => l.trim()).filter(Boolean);
            const message = (lines[lines.length - 1] || error?.message || 'no output').slice(0, 300);
            lastUpdate = { at: new Date().toISOString(), ok: !error, message };
            if (error)
                console.error(`[Updater] yt-dlp -U failed: ${message}`);
            else
                console.log(`[Updater] ${message}`);
            resolve(lastUpdate);
        });
    });
}
/** Log the installed yt-dlp version at startup so the log shows what ran. */
export function logYtDlpVersion() {
    if (DRY_RUN)
        return;
    execFile(YT_DLP, ['--version'], { env: childEnv, timeout: 30_000 }, (error, stdout) => {
        if (error)
            console.warn(`[Updater] Could not read yt-dlp version: ${error.message}`);
        else
            console.log(`[Updater] yt-dlp ${stdout.trim()}`);
    });
}
//# sourceMappingURL=downloader.js.map