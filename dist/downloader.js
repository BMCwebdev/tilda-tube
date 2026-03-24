import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getApprovedVideos, updateVideoStatus, getChannelById } from './db.js';
import { childEnv, YT_DLP } from './env.js';
const DRY_RUN = process.env.DRY_RUN === 'true';
const MEDIA_DIR = process.env.MEDIA_DIR || '/Volumes/TildaTube/media';
let isDownloading = false;
/**
 * Download all approved videos sequentially.
 * Called after the daily poll completes, and also triggered immediately
 * when a parent approves a video or adds a single video via the UI.
 */
export async function downloadAllApproved() {
    if (isDownloading) {
        console.log('[Downloader] Already downloading, skipping');
        return;
    }
    isDownloading = true;
    try {
        while (true) {
            const approved = getApprovedVideos();
            if (approved.length === 0)
                break;
            const video = approved[0];
            const channel = video.channel_id ? getChannelById(video.channel_id) : undefined;
            await downloadOne(video, channel);
        }
    }
    finally {
        isDownloading = false;
    }
}
async function downloadOne(video, channel) {
    const minDuration = channel?.min_duration ?? 0;
    console.log(`[Downloader] Starting download: "${video.title}" (${video.youtube_id})${minDuration ? ` [min ${minDuration}s]` : ''}`);
    updateVideoStatus(video.id, 'downloading');
    try {
        if (DRY_RUN) {
            console.log(`[Downloader] DRY_RUN: Skipping yt-dlp for "${video.title}"`);
            const fakePath = `${MEDIA_DIR}/DryRun/${video.youtube_id}.mp4`;
            updateVideoStatus(video.id, 'done', { file_path: fakePath });
            console.log(`[Downloader] DRY_RUN: Marked "${video.title}" as done`);
        }
        else {
            // Check if this is a "short" video that should go in the Shorts collection
            let isShort = false;
            if (minDuration > 0) {
                const duration = await getVideoDuration(video.youtube_id);
                if (duration !== null && duration <= minDuration) {
                    isShort = true;
                    console.log(`[Downloader] Short video (${duration}s <= ${minDuration}s): "${video.title}"`);
                }
            }
            // Quality: video override (single videos) > channel setting > 720 default
            const maxQuality = video.max_quality ?? channel?.max_quality ?? 720;
            const filePath = await downloadVideo(video.youtube_id, isShort, maxQuality);
            updateVideoStatus(video.id, 'done', { file_path: filePath });
            console.log(`[Downloader] Completed${isShort ? ' (short)' : ''}: "${video.title}"`);
        }
    }
    catch (err) {
        const errorMsg = err.message || String(err);
        console.error(`[Downloader] Failed: "${video.title}" — ${errorMsg}`);
        updateVideoStatus(video.id, 'error', { error_message: errorMsg });
    }
}
/**
 * Get the duration of a YouTube video in seconds.
 * Returns null if duration can't be determined.
 */
function getVideoDuration(youtubeId) {
    return new Promise((resolve) => {
        const url = `https://www.youtube.com/watch?v=${youtubeId}`;
        execFile(YT_DLP, ['--print', 'duration', '--no-download', url], {
            timeout: 60_000,
            env: childEnv,
        }, (error, stdout) => {
            if (error) {
                console.warn(`[Downloader] Could not get duration for ${youtubeId}, treating as full-length`);
                resolve(null);
                return;
            }
            const seconds = parseFloat(stdout.trim());
            resolve(isNaN(seconds) ? null : seconds);
        });
    });
}
/**
 * Fetch a YouTube channel's avatar and save it as folder.jpg in the channel's media directory.
 * Infuse uses folder.jpg as the folder thumbnail when browsing via SMB.
 */
export async function fetchChannelAvatar(channelId, channelName) {
    const channelDir = path.join(MEDIA_DIR, channelName);
    try {
        // Fetch the YouTube channel page and extract the avatar URL from og:image
        const channelUrl = `https://www.youtube.com/channel/${channelId}`;
        const res = await fetch(channelUrl);
        if (!res.ok) {
            console.warn(`[Avatar] Failed to fetch channel page: HTTP ${res.status}`);
            return;
        }
        const html = await res.text();
        const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
        if (!match) {
            console.warn(`[Avatar] No og:image found for ${channelName}`);
            return;
        }
        const avatarUrl = match[1];
        // Download the avatar image
        const imgRes = await fetch(avatarUrl);
        if (!imgRes.ok) {
            console.warn(`[Avatar] Failed to download avatar: HTTP ${imgRes.status}`);
            return;
        }
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        // Save to the channel's media folder (create if needed)
        fs.mkdirSync(channelDir, { recursive: true });
        const folderJpg = path.join(channelDir, 'folder.jpg');
        fs.writeFileSync(folderJpg, buffer);
        console.log(`[Avatar] Saved folder.jpg for ${channelName}`);
    }
    catch (err) {
        console.error(`[Avatar] Error fetching avatar for ${channelName}:`, err);
    }
}
function downloadVideo(youtubeId, isShort = false, maxQuality = 720) {
    return new Promise((resolve, reject) => {
        // Shorts go into a Shorts/ subfolder, grouped by channel
        const baseDir = isShort ? `${MEDIA_DIR}/Shorts` : MEDIA_DIR;
        const outputTemplate = `${baseDir}/%(channel)s/%(upload_date>%Y-%m-%d)s - %(title)s.%(ext)s`;
        const url = `https://www.youtube.com/watch?v=${youtubeId}`;
        const args = [
            '--format', `bestvideo[height<=${maxQuality}]+bestaudio/best[height<=${maxQuality}]`,
            '--merge-output-format', 'mp4',
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            '--embed-thumbnail',
            '--embed-metadata',
            '--no-playlist',
            '--print', 'after_move:filepath',
            '-o', outputTemplate,
            url,
        ];
        execFile(YT_DLP, args, { maxBuffer: 10 * 1024 * 1024, env: childEnv }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            const filePath = stdout.trim().split('\n').pop() || '';
            resolve(filePath);
        });
    });
}
//# sourceMappingURL=downloader.js.map