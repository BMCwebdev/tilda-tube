import { execFile } from 'child_process';
import { getApprovedVideos, updateVideoStatus, getChannelById, type Video } from './db.js';
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
export async function downloadAllApproved(): Promise<void> {
  if (isDownloading) {
    console.log('[Downloader] Already downloading, skipping');
    return;
  }

  isDownloading = true;
  try {
    while (true) {
      const approved = getApprovedVideos();
      if (approved.length === 0) break;

      const video = approved[0];
      await downloadOne(video);
    }
  } finally {
    isDownloading = false;
  }
}

async function downloadOne(video: Video): Promise<void> {
  console.log(`[Downloader] Starting download: "${video.title}" (${video.youtube_id})`);
  updateVideoStatus(video.id, 'downloading');

  try {
    if (DRY_RUN) {
      console.log(`[Downloader] DRY_RUN: Skipping yt-dlp for "${video.title}"`);
      const fakePath = `${MEDIA_DIR}/DryRun/${video.youtube_id}.mp4`;
      updateVideoStatus(video.id, 'done', { file_path: fakePath });
      console.log(`[Downloader] DRY_RUN: Marked "${video.title}" as done`);
    } else {
      const filePath = await downloadVideo(video.youtube_id);
      updateVideoStatus(video.id, 'done', { file_path: filePath });

      // Generate Plex NFO file for collection grouping
      if (video.channel_id) {
        const channel = getChannelById(video.channel_id);
        if (channel) {
          writeNfo(filePath, channel.name, video.title, video.published_at);
        }
      }

      console.log(`[Downloader] Completed: "${video.title}"`);
    }
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.error(`[Downloader] Failed: "${video.title}" — ${errorMsg}`);
    updateVideoStatus(video.id, 'error', { error_message: errorMsg });
  }
}

function downloadVideo(youtubeId: string): Promise<string> {
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
