import { execFile } from 'child_process';
import { getApprovedVideos, updateVideoStatus, getChannelById } from './db.js';
import { childEnv, YT_DLP } from './env.js';
import { writeNfo } from './nfo.js';
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
            const filePath = await downloadVideo(video.youtube_id, minDuration);
            updateVideoStatus(video.id, 'done', { file_path: filePath });
            // Generate Plex NFO file for collection grouping
            if (channel) {
                writeNfo(filePath, channel.name, video.title, video.published_at);
            }
            console.log(`[Downloader] Completed: "${video.title}"`);
        }
    }
    catch (err) {
        const errorMsg = err.message || String(err);
        // yt-dlp match-filter rejection — mark as rejected, not error
        if (errorMsg.includes('does not pass filter')) {
            console.log(`[Downloader] Skipped (too short): "${video.title}"`);
            updateVideoStatus(video.id, 'rejected', { error_message: 'Too short (duration filter)' });
            return;
        }
        console.error(`[Downloader] Failed: "${video.title}" — ${errorMsg}`);
        updateVideoStatus(video.id, 'error', { error_message: errorMsg });
    }
}
function downloadVideo(youtubeId, minDuration = 0) {
    return new Promise((resolve, reject) => {
        const outputTemplate = `${MEDIA_DIR}/%(channel)s/%(upload_date>%Y-%m-%d)s - %(title)s.%(ext)s`;
        const url = `https://www.youtube.com/watch?v=${youtubeId}`;
        const args = [
            '--format', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
            '--merge-output-format', 'mp4',
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            '--embed-thumbnail',
            '--embed-metadata',
            '--no-playlist',
            '--print', 'after_move:filepath',
            '-o', outputTemplate,
        ];
        if (minDuration > 0) {
            args.push('--match-filter', `duration > ${minDuration}`);
        }
        args.push(url);
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