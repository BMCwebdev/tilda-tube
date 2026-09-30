import { execFile } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { getAllChannels, videoExists, insertVideo, type Channel } from './db.js';
import { childEnv, YT_DLP, DRY_RUN } from './env.js';

/** Safety cap so a mis-set "All time" on a huge channel can't queue thousands of downloads at once. */
export const MAX_NEW_VIDEOS_PER_CHANNEL = 75;

/** How many recent uploads to ask yt-dlp for when a channel's RSS feed is unavailable. */
const FALLBACK_RECENT_COUNT = 15;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

interface FeedEntry {
  'yt:videoId': string;
  title: string;
  published: string;
  'media:group'?: { 'media:thumbnail'?: { '@_url'?: string } };
}

interface DiscoveredVideo {
  id: string;
  title: string;
  publishedAt: string;       // ISO date or datetime
  thumbnailUrl?: string;
}

/** Daily poll: RSS first (cheap), yt-dlp listing when the feed is unavailable. */
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

  let videos = await fetchRssEntries(channel);
  let via = 'rss';
  if (videos === null) {
    // YouTube's feeds intermittently answer 404/500. Fall back to a small yt-dlp
    // listing so a feed outage never silently stops new videos from arriving.
    videos = await listChannelVideos(channel, FALLBACK_RECENT_COUNT);
    via = 'yt-dlp';
  }

  const added = addDiscovered(channel, videos);
  if (added > 0) console.log(`[Poller] ${added} new video(s) for ${channel.name} (via ${via})`);
}

/** Returns null when the feed is unavailable (non-200 or unparseable). */
async function fetchRssEntries(channel: Channel): Promise<DiscoveredVideo[] | null> {
  let response: Response;
  try {
    response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channel_id}`);
  } catch (err) {
    console.warn(`[Poller] Feed for ${channel.name}: ${(err as Error).message}; falling back to yt-dlp`);
    return null;
  }
  if (!response.ok) {
    console.warn(`[Poller] Feed for ${channel.name}: HTTP ${response.status}; falling back to yt-dlp`);
    return null;
  }
  const feed = parser.parse(await response.text())?.feed;
  if (!feed) {
    console.warn(`[Poller] Feed for ${channel.name}: no feed element; falling back to yt-dlp`);
    return null;
  }
  let entries: FeedEntry[] = feed.entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  return entries
    .filter((e) => e['yt:videoId'])
    .map((e) => ({
      id: e['yt:videoId'],
      title: e.title || 'Untitled',
      publishedAt: e.published,
      thumbnailUrl: e['media:group']?.['media:thumbnail']?.['@_url'],
    }));
}

/**
 * Insert any videos we haven't seen that are on or after the channel's
 * from_date, honouring the per-pass cap. Returns how many were added.
 */
function addDiscovered(channel: Channel, videos: DiscoveredVideo[]): number {
  const fromDate = new Date(channel.from_date);
  const status = channel.auto_approve ? 'approved' : 'pending';
  let added = 0;
  for (const v of videos) {
    const published = new Date(v.publishedAt);
    if (!Number.isNaN(published.getTime()) && published < fromDate) continue;
    if (videoExists(v.id)) continue;
    if (added >= MAX_NEW_VIDEOS_PER_CHANNEL) {
      console.warn(`[Poller] Hit ${MAX_NEW_VIDEOS_PER_CHANNEL} video cap for ${channel.name}, stopping`);
      break;
    }
    insertVideo({
      channel_id: channel.id,
      youtube_id: v.id,
      title: v.title,
      thumbnail_url: v.thumbnailUrl || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      published_at: v.publishedAt,
      status,
    });
    added++;
    console.log(`[Poller] New video: "${v.title}" [${status}]`);
  }
  return added;
}

/**
 * Full backfill for a channel via yt-dlp playlist extraction: every video
 * back to from_date (capped), not just the RSS ~15. Runs when a channel is
 * added and on demand from the Channels tab. Returns the number of new rows.
 */
export async function backfillChannel(channel: Channel): Promise<number> {
  console.log(`[Backfill] ${channel.name}: videos after ${channel.from_date}...`);
  if (DRY_RUN) return 0;
  const videos = await listChannelVideos(channel, MAX_NEW_VIDEOS_PER_CHANNEL);
  const added = addDiscovered(channel, videos);
  console.log(`[Backfill] ${channel.name}: ${added} new, ${videos.length - added} already known`);
  return added;
}

/**
 * Ask yt-dlp for the channel's uploads on or after from_date, newest first,
 * up to `limit` per tab. The bare channel URL (no /videos) is deliberate: it
 * lists both the Videos and the Shorts tabs, like the RSS feed does, whereas
 * /videos omits Shorts. One JSON object per line, so titles with newlines
 * can't desync the parse. Flat listings often lack an upload date; today's
 * date is used as a placeholder and the downloader replaces it on download.
 */
function listChannelVideos(channel: Channel, limit: number): Promise<DiscoveredVideo[]> {
  const channelUrl = `https://www.youtube.com/channel/${channel.channel_id}`;
  const dateAfter = channel.from_date.replace(/-/g, '');
  return new Promise((resolve, reject) => {
    const args = [
      '--flat-playlist',
      '--print', '%(.{id,title,upload_date})j',
      '--dateafter', dateAfter,
      '--playlist-items', `1:${limit}`,
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
        reject(new Error(`yt-dlp listing failed: ${stderr || error.message}`));
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const videos: DiscoveredVideo[] = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const o = JSON.parse(line) as { id?: string; title?: string; upload_date?: string | null };
          if (!o.id) continue;
          const raw = o.upload_date;
          const uploadDate = raw && /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : today;
          videos.push({ id: o.id, title: o.title || 'Untitled', publishedAt: uploadDate });
        } catch { /* skip malformed line */ }
      }
      resolve(videos);
    });
  });
}
