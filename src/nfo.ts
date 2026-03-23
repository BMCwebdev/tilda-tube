import fs from 'fs';
import path from 'path';

/**
 * Generate a Plex-compatible NFO file next to a video file.
 * Sets the channel name as a Plex "collection" tag so videos
 * from the same channel are grouped together in the Plex UI.
 */
export function writeNfo(filePath: string, channelName: string, title: string, publishedAt: string): void {
  const nfoPath = filePath.replace(/\.[^.]+$/, '.nfo');

  // Extract year from published date
  const year = publishedAt ? publishedAt.slice(0, 4) : '';

  const nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${escapeXml(title)}</title>
  <year>${year}</year>
  <set>
    <name>${escapeXml(channelName)}</name>
  </set>
  <tag>${escapeXml(channelName)}</tag>
  <genre>YouTube</genre>
</movie>
`;

  try {
    fs.writeFileSync(nfoPath, nfoContent, 'utf-8');
    console.log(`[NFO] Written: ${nfoPath}`);
  } catch (err) {
    console.error(`[NFO] Failed to write ${nfoPath}:`, err);
  }
}

/**
 * Generate NFO files for all downloaded videos that don't have one yet.
 */
export function backfillNfoFiles(videos: Array<{ file_path: string | null; title: string; channel_name: string | null; published_at: string }>): void {
  let created = 0;
  let skipped = 0;

  for (const video of videos) {
    if (!video.file_path || !video.channel_name) {
      skipped++;
      continue;
    }

    const nfoPath = video.file_path.replace(/\.[^.]+$/, '.nfo');

    // Skip if NFO already exists
    if (fs.existsSync(nfoPath)) {
      skipped++;
      continue;
    }

    // Skip if the video file doesn't exist
    if (!fs.existsSync(video.file_path)) {
      skipped++;
      continue;
    }

    // Videos in the Shorts/ subfolder get a "Shorts - ChannelName" collection
    const isShort = video.file_path.includes('/Shorts/');
    const collectionName = isShort ? `Shorts - ${video.channel_name}` : video.channel_name;

    writeNfo(video.file_path, collectionName, video.title, video.published_at);
    created++;
  }

  if (created > 0) {
    console.log(`[NFO] Backfill complete: ${created} created, ${skipped} skipped`);
  } else {
    console.log(`[NFO] Backfill: all ${skipped} videos already have NFO files`);
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
