import { type Channel } from './db.js';
export declare function pollChannels(): Promise<void>;
/**
 * Full backfill for a channel using yt-dlp playlist extraction.
 * Gets ALL videos from a channel (not just the ~15 from RSS),
 * filtered by the channel's from_date. Run once when a channel is added.
 */
export declare function backfillChannel(channel: Channel): Promise<void>;
//# sourceMappingURL=poller.d.ts.map