import { type Channel } from './db.js';
/** Safety cap so a mis-set "All time" on a huge channel can't queue thousands of downloads at once. */
export declare const MAX_NEW_VIDEOS_PER_CHANNEL = 75;
/** Daily poll: RSS first (cheap), yt-dlp listing when the feed is unavailable. */
export declare function pollChannels(): Promise<void>;
/**
 * Full backfill for a channel via yt-dlp playlist extraction: every video
 * back to from_date (capped), not just the RSS ~15. Runs when a channel is
 * added and on demand from the Channels tab. Returns the number of new rows.
 */
export declare function backfillChannel(channel: Channel): Promise<number>;
//# sourceMappingURL=poller.d.ts.map