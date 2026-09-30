export interface CurrentDownload {
    id: number;
    title: string;
    startedAt: string;
}
/** What the downloader is working on right now, for the UI. */
export declare function getCurrentDownload(): CurrentDownload | null;
/**
 * Download every approved video, one at a time, oldest approval first.
 * Safe to call from anywhere at any time: if a loop is already running it
 * simply returns, and the running loop will pick up newly approved rows.
 */
export declare function downloadAllApproved(): Promise<void>;
/**
 * Fetch a YouTube channel's avatar and save it as folder.jpg in the channel's
 * media directory (and its Shorts folder, if that exists). Infuse uses
 * folder.jpg as the folder thumbnail when browsing over SMB.
 */
export declare function fetchChannelAvatar(channelId: string, channelName: string): Promise<void>;
/**
 * Remove a video file and its .jpg sidecar from disk. Missing files are not
 * an error. Returns true if anything was removed.
 */
export declare function removeVideoFiles(filePath: string): boolean;
export interface UpdateResult {
    at: string;
    ok: boolean;
    message: string;
}
export declare function getLastYtDlpUpdate(): UpdateResult | null;
/**
 * Run `yt-dlp -U`. YouTube changes often and a yt-dlp older than ~90 days is
 * the most common reason downloads start failing, so the server does this on
 * a schedule. Never throws; the outcome is logged and kept for /api/status.
 */
export declare function updateYtDlp(): Promise<UpdateResult>;
/** Log the installed yt-dlp version at startup so the log shows what ran. */
export declare function logYtDlpVersion(): void;
//# sourceMappingURL=downloader.d.ts.map