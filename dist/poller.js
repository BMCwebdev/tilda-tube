import { XMLParser } from 'fast-xml-parser';
import { getAllChannels, videoExists, insertVideo } from './db.js';
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});
export async function pollChannels() {
    const channels = getAllChannels();
    console.log(`[Poller] Polling ${channels.length} channel(s)...`);
    for (const channel of channels) {
        try {
            await pollChannel(channel);
        }
        catch (err) {
            console.error(`[Poller] Error polling channel ${channel.name} (${channel.channel_id}):`, err);
        }
    }
}
async function pollChannel(channel) {
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
    let entries = feed.entry || [];
    if (!Array.isArray(entries)) {
        entries = [entries];
    }
    const fromDate = new Date(channel.from_date);
    let newCount = 0;
    for (const entry of entries) {
        const publishedDate = new Date(entry.published);
        if (publishedDate < fromDate)
            continue;
        const youtubeId = entry['yt:videoId'];
        if (!youtubeId)
            continue;
        if (videoExists(youtubeId))
            continue;
        const thumbnailUrl = entry['media:group']?.['media:thumbnail']?.['@_url'] ||
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
//# sourceMappingURL=poller.js.map