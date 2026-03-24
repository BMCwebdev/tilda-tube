import { execFile } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { getAllChannels, videoExists, insertVideo, type Channel } from './db.js';
import { childEnv, YT_DLP } from './env.js';

const MAX_NEW_VIDEOS_PER_CHANNEL = 75;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

interface FeedEntry {
  'yt:videoId': string;
  title: string;
  published: string;
  'media:group'?: {
    'media:thumbnail'?: {
      '@_url'?: string;
    };
  };
}

export async function pollChannels(): Promise<void> {
  const channels = getAllChannels();
  console.log(`[Poller] Polling ${channels.length} channel(s)...`);

  for (const channel of channels) {
    try {
      await pollChannel(channel);
    } catch (err) {
      console.error(`[Poller] Error polling channel ${channel.name} (${channel.channel_id}):`, err);
    }
  }
}

async function pollChannel(channel: Channel): Promise<void> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channel_id}`;
  const response = await fetch(feedUrl);

  if (!response.ok) {
    console.error(`[Poller] Failed to fetch feed for ${channel.name}: HTTP ${response.status}`);
    return;
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);

  const feed = parsed?.feed;
  if (!feed) {
    console.error(`[Poller] No feed element found for ${channel.name}`);
    return;
  }

  // Entries can be a single object or array
  let entries: FeedEntry[] = feed.entry || [];
  if (!Array.isArray(entries)) {
    entries = [entries];
  }

  const fromDate = new Date(channel.from_date);
  let newCount = 0;

  for (const entry of entries) {
    const publishedDate = new Date(entry.published);
    if (publishedDate < fromDate) continue;

    const youtubeId = entry['yt:videoId'];
    if (!youtubeId) continue;
    if (videoExists(youtubeId)) continue;

    if (newCount >= MAX_NEW_VIDEOS_PER_CHANNEL) {
      console.warn(`[Poller] Hit ${MAX_NEW_VIDEOS_PER_CHANNEL} video cap for ${channel.name}, stopping`);
      break;
    }

    const thumbnailUrl =
      entry['media:group']?.['media:thumbnail']?.['@_url'] ||
      `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

    const status = channel.auto_approve ? 'approved' : 'pending';

    insertVideo({
      channel_id: channel.id,
      youtube_id: youtubeId,
      title: entry.title || 'Untitled',
      thumbnail_url: thumbnailUrl,
      published_at: entry.published,
      status,
    });

    newCount++;
    console.log(`[Poller] New video: "${entry.title}" [${status}]`);
  }

  if (newCount > 0) {
    console.log(`[Poller] Found ${newCount} new video(s) for ${channel.name}`);
  }
}

/**
 * Full backfill for a channel using yt-dlp playlist extraction.
 * Gets ALL videos from a channel (not just the ~15 from RSS),
 * filtered by the channel's from_date. Run once when a channel is added.
 */
export async function backfillChannel(channel: Channel): Promise<void> {
  const DRY_RUN = process.env.DRY_RUN === 'true';
  const fromDateCompact = channel.from_date.replace(/-/g, '');
  const channelUrl = `https://www.youtube.com/channel/${channel.channel_id}`;

  console.log(`[Backfill] Starting for ${channel.name} (videos after ${channel.from_date})...`);

  if (DRY_RUN) {
    console.log(`[Backfill] DRY_RUN: Skipping yt-dlp backfill for ${channel.name}`);
    return;
  }

  const videos = await listChannelVideos(channelUrl, fromDateCompact);
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
      published_at: video.uploadDate,
      status,
    });

    newCount++;
    console.log(`[Backfill] New video: "${video.title}" [${status}]`);
  }

  console.log(`[Backfill] Done for ${channel.name}: ${newCount} new, ${videos.length - newCount} already known`);
}

interface PlaylistVideo {
  id: string;
  title: string;
  uploadDate: string;  // ISO format: YYYY-MM-DD
}

function listChannelVideos(channelUrl: string, dateAfter: string): Promise<PlaylistVideo[]> {
  return new Promise((resolve, reject) => {
    // --flat-playlist gets metadata only (no download), much faster
    // --print outputs one field per line: id, title, upload_date in sequence
    const args = [
      '--flat-playlist',
      '--print', 'id',
      '--print', 'title',
      '--print', 'upload_date',
      '--dateafter', dateAfter,
      '--playlist-items', `1:${MAX_NEW_VIDEOS_PER_CHANNEL}`,
      '--no-download',
      channelUrl,
    ];

    execFile(YT_DLP, args, {
      maxBuffer: 50 * 1024 * 1024,  // Large channels may have many videos
      timeout: 5 * 60 * 1000,       // 5 minute timeout
      env: childEnv,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`yt-dlp backfill failed: ${stderr || error.message}`));
        return;
      }

      const lines = stdout.trim().split('\n').filter(Boolean);
      const videos: PlaylistVideo[] = [];

      // Every 3 lines is one video: id, title, upload_date
      for (let i = 0; i + 2 < lines.length; i += 3) {
        const id = lines[i].trim();
        const title = lines[i + 1].trim();
        const rawDate = lines[i + 2].trim();  // YYYYMMDD format

        // Convert YYYYMMDD to YYYY-MM-DD
        const uploadDate = rawDate.length === 8
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : rawDate;

        if (id) {
          videos.push({ id, title: title || 'Untitled', uploadDate });
        }
      }

      resolve(videos);
    });
  });
}
