/**
 * Generate a Plex-compatible NFO file next to a video file.
 * Sets the channel name as a Plex "collection" tag so videos
 * from the same channel are grouped together in the Plex UI.
 */
export declare function writeNfo(filePath: string, channelName: string, title: string, publishedAt: string): void;
/**
 * Generate NFO files for all downloaded videos that don't have one yet.
 */
export declare function backfillNfoFiles(videos: Array<{
    file_path: string | null;
    title: string;
    channel_name: string | null;
    published_at: string;
}>): void;
//# sourceMappingURL=nfo.d.ts.map