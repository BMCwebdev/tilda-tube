/**
 * Plex API integration for tagging videos with collections.
 *
 * After a video is downloaded, we:
 * 1. Trigger a partial Plex library scan for the video's folder
 * 2. Wait for Plex to index the file
 * 3. Find the item by its file path
 * 4. Add the collection tag (channel name)
 *
 * Requires PLEX_TOKEN env var. PLEX_URL defaults to http://localhost:32400.
 */
/**
 * Main entry point: after downloading a video, add it to a Plex collection.
 * Triggers a scan, waits for indexing, then tags the item.
 */
export declare function addToPlexCollection(filePath: string, collectionName: string): Promise<void>;
/**
 * Backfill: tag all downloaded videos that aren't already in a collection.
 * Useful for tagging videos downloaded before Plex API integration was added.
 */
export declare function backfillPlexCollections(videos: Array<{
    file_path: string | null;
    channel_name: string | null;
}>): Promise<void>;
//# sourceMappingURL=plex.d.ts.map