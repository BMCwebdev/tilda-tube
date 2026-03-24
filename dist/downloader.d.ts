/**
 * Download all approved videos sequentially.
 * Called after the daily poll completes, and also triggered immediately
 * when a parent approves a video or adds a single video via the UI.
 */
export declare function downloadAllApproved(): Promise<void>;
/**
 * Fetch a YouTube channel's avatar and save it as folder.jpg in the channel's media directory.
 * Infuse uses folder.jpg as the folder thumbnail when browsing via SMB.
 */
export declare function fetchChannelAvatar(channelId: string, channelName: string): Promise<void>;
//# sourceMappingURL=downloader.d.ts.map