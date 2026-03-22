import { execFile } from 'child_process';
import { getApprovedVideos, updateVideoStatus } from './db.js';

const DRY_RUN = process.env.DRY_RUN === 'true';
const MEDIA_DIR = process.env.MEDIA_DIR || '/Volumes/TubeSafe/media';

let isDownloading = false;

export function startDownloader(): void {
  setInterval(async () => {
    if (isDownloading) return;

    const approved = getApprovedVideos();
    if (approved.length === 0) return;

    const video = approved[0];
    isDownloading = true;

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
        console.log(`[Downloader] Completed: "${video.title}"`);
      }
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      console.error(`[Downloader] Failed: "${video.title}" — ${errorMsg}`);
      updateVideoStatus(video.id, 'error', { error_message: errorMsg });
    } finally {
      isDownloading = false;
    }
  }, 30_000);

  console.log(`[Downloader] Watcher started (30s interval, DRY_RUN=${DRY_RUN})`);
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

    execFile('yt-dlp', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      // --print after_move:filepath outputs the final file path
      const filePath = stdout.trim().split('\n').pop() || '';
      resolve(filePath);
    });
  });
}
