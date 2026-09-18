import { execFile } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { getAllChannels, videoExists, insertVideo, type Channel } from './db.js';
import { childEnv, YT_DLP, DRY_RUN } from './env.js';

/** Safety cap so a mis-set "All time" on a huge channel can't queue thousands of downloads at once. */
export const MAX_NEW_VIDEOS_PER_CHANNEL = 75;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

interface FeedEntry {
  'yt:videoId': string;
  title: string;
  published: string;
  'media:group'?: { 'media:thumbnail'?: { '@_url'?: string } };
}

/** Daily RSS poll: cheap, catches the ~15 most recent uploads per channel. */
export async function pollChannels(): Promise<void> {
  const channels = getAllChannels();
  console.log(`[Poller] Polling ${channels.length} channel(s)...`);
  for (const channel of channels) {
    try {
      await pollChannel(channel);
    } catch (err) {
      console.error(`[Poller] Error polling ${channel.name} (${channel.channel_id}):`, err);
    }
  }
}

async function pollChannel(channel: Channel): Promise<void> {
  if (DRY_RUN) return;
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channel_id}`);
  if (!response.ok) {
    console.error(`[Poller] Feed for ${channel.name}: HTTP ${response.status}`);
    return;
  }

  const feed = parser.parse(await response.text())?.feed;
  if (!feed) {
    console.error(`[Poller] No feed element for ${channel.name}`);
    return;
  }
  let entries: FeedEntry[] = feed.entry || [];
  if (!Array.isArray(entries)) entries = [entries];

  const fromDate = new Date(channel.from_date);
  let newCount = 0;

  for (const entry of entries) {
    if (new Date(entry.published) < fromDate) continue;
    const youtubeId = entry['yt:videoId'];
    if (!youtubeId || videoExists(youtubeId)) continue;
    if (newCount >= MAX_NEW_VIDEOS_PER_CHANNEL) {
      console.warn(`[Poller] Hit ${MAX_NEW_VIDEOS_PER_CHANNEL} video cap for ${channel.name}, stopping`);
      break;
    }
    const status = channel.auto_approve ? 'approved' : 'pending';
    insertVideo({
      channel_id: channel.id,
      youtube_id: youtubeId,
      title: entry.title || 'Untitled',
      thumbnail_url: entry['media:group']?.['media:thumbnail']?.['@_url'] || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      published_at: entry.published,
      status,
    });
    newCount++;
    console.log(`[Poller] New video: "${entry.title}" [${status}]`);
  }
  if (newCount > 0) console.log(`[Poller] ${newCount} new video(s) for ${channel.name}`);
}

/**
 * Full backfill for a channel via yt-dlp playlist extraction: every video
 * back to from_date (capped), not just the RSS ~15. Runs when a channel is
 * added and on demand from the Channels tab. Returns the number of new rows.
 */
export async function backfillChannel(channel: Channel): Promise<number> {
  console.log(`[Backfill] ${channel.name}: videos after ${channel.from_date}...`);
  if (DRY_RUN) return 0;

  const videos = await listChannelVideos(
    `https://www.youtube.com/channel/${channel.channel_id}`,
    channel.from_date.replace(/-/g, ''),
  );
  let newCount = 0;
  for (const video of videos) {
    if (videoExists(video.id)) continue;
    if (newCount >= MAX_NEW_VIDEOS_PER_CHANNEL) {
      console.warn(`[Backfill] Hit ${MAX_NEW_VIDEOS_PER_CHANNEL} video cap for ${channel.name}, stopping`);
      break;
    }
    const status = channel.auto_approve ? 'approved' : 'pending';
    insertVideo({
      channel_id: channel.id,
      youtube_id: video.id,
      title: video.title,
      thumbnail_url: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      // Flat playlist listings often have no upload date. Use today's date as a
      // placeholder; the downloader replaces it with the real one on download.
      published_at: video.uploadDate ?? new Date().toISOString().slice(0, 10),
      status,
    });
    newCount++;
    console.log(`[Backfill] New video: "${video.title}" [${status}]`);
  }
  console.log(`[Backfill] ${channel.name}: ${newCount} new, ${videos.length - newCount} already known`);
  return newCount;
}

interface PlaylistVideo {
  id: string;
  title: string;
  uploadDate: string | null; // YYYY-MM-DD
}

function listChannelVideos(channelUrl: string, dateAfter: string): Promise<PlaylistVideo[]> {
  return new Promise((resolve, reject) => {
    // One JSON object per line: immune to titles that contain newlines.
    const args = [
      '--flat-playlist',
      '--print', '%(.{id,title,upload_date})j',
      '--dateafter', dateAfter,
      '--playlist-items', `1:${MAX_NEW_VIDEOS_PER_CHANNEL}`,
      '--no-download',
      '--no-warnings',
      channelUrl,
    ];
    execFile(YT_DLP, args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      env: childEnv,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`yt-dlp backfill failed: ${stderr || error.message}`));
        return;
      }
      const videos: PlaylistVideo[] = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const o = JSON.parse(line) as { id?: string; title?: string; upload_date?: string | null };
          if (!o.id) continue;
          const raw = o.upload_date;
          const uploadDate = raw && /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null;
          videos.push({ id: o.id, title: o.title || 'Untitled', uploadDate });
        } catch { /* skip malformed line */ }
      }
      resolve(videos);
    });
  });
}
