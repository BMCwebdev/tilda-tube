import Database from 'better-sqlite3';
export declare function getDb(): Database.Database;
export interface Channel {
    id: number;
    name: string;
    channel_id: string;
    channel_url: string;
    from_date: string;
    auto_approve: number;
    min_duration: number;
    max_quality: number;
    created_at: string;
}
export interface ChannelWithCounts extends Channel {
    video_count: number;
    pending_count: number;
    done_count: number;
    error_count: number;
}
export declare function getAllChannels(): ChannelWithCounts[];
export declare function addChannel(data: {
    name: string;
    channel_id: string;
    channel_url: string;
    from_date: string;
    auto_approve: boolean;
    min_duration?: number;
    max_quality?: number;
}): Channel;
/**
 * Delete a channel and all of its video rows in one transaction.
 * Returns the file paths of its downloaded videos so the caller can
 * optionally remove them from disk. Returns null if the channel doesn't exist.
 */
export declare function deleteChannel(id: number): {
    name: string;
    filePaths: string[];
} | null;
export declare function getChannelById(id: number): Channel | undefined;
export declare function updateChannel(id: number, data: {
    from_date?: string;
    auto_approve?: boolean;
    min_duration?: number;
    max_quality?: number;
}): boolean;
export type VideoStatus = 'pending' | 'approved' | 'downloading' | 'done' | 'rejected' | 'error' | 'deleted';
export interface Video {
    id: number;
    channel_id: number | null;
    youtube_id: string;
    title: string;
    thumbnail_url: string | null;
    published_at: string;
    status: VideoStatus;
    max_quality: number | null;
    file_path: string | null;
    error_message: string | null;
    source: 'youtube' | 'local';
    duration: number | null;
    created_at: string;
    updated_at: string;
}
export interface VideoWithChannel extends Video {
    channel_name: string | null;
}
export declare function getPendingVideos(): VideoWithChannel[];
export declare function getAllVideos(): VideoWithChannel[];
export declare function getVideosByChannel(channelId: number): VideoWithChannel[];
/** Oldest approved video, or undefined. The downloader works one at a time. */
export declare function getNextApprovedVideo(): Video | undefined;
export declare function countApproved(): number;
export declare function insertVideo(data: {
    channel_id: number | null;
    youtube_id: string;
    title: string;
    thumbnail_url: string | null;
    published_at: string;
    status: VideoStatus;
    max_quality?: number | null;
    source?: 'youtube' | 'local';
    duration?: number | null;
    file_path?: string | null;
}): Video | null;
export declare function videoExists(youtubeId: string): boolean;
export declare function getVideoByYoutubeId(youtubeId: string): Video | undefined;
export declare function getVideoById(id: number): Video | undefined;
export declare function updateVideoStatus(id: number, status: VideoStatus, extra?: {
    file_path?: string | null;
    error_message?: string | null;
    published_at?: string;
    duration?: number | null;
    title?: string;
    channel_id?: number | null;
}): boolean;
export declare function deleteVideoRow(id: number): boolean;
/**
 * Called once at startup. Anything still marked "downloading" was interrupted
 * by a crash or restart; surface it as an error the parent can retry.
 */
export declare function resetStuckDownloads(): number;
export interface ServerCounts {
    channelCount: number;
    pendingCount: number;
    approvedCount: number;
    downloadingCount: number;
    doneCount: number;
    errorCount: number;
}
export declare function getServerStatus(): ServerCounts;
//# sourceMappingURL=db.d.ts.map