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
    created_at: string;
}
export interface ChannelWithCounts extends Channel {
    video_count: number;
    pending_count: number;
}
export declare function getAllChannels(): ChannelWithCounts[];
export declare function addChannel(data: {
    name: string;
    channel_id: string;
    channel_url: string;
    from_date: string;
    auto_approve: boolean;
    min_duration?: number;
}): Channel;
export declare function deleteChannel(id: number): boolean;
export declare function getChannelById(id: number): Channel | undefined;
export declare function updateChannel(id: number, data: {
    from_date?: string;
    auto_approve?: boolean;
    min_duration?: number;
}): boolean;
export interface Video {
    id: number;
    channel_id: number | null;
    youtube_id: string;
    title: string;
    thumbnail_url: string | null;
    published_at: string;
    status: string;
    file_path: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}
export interface VideoWithChannel extends Video {
    channel_name: string | null;
}
export declare function getPendingVideos(): VideoWithChannel[];
export declare function getAllVideos(): VideoWithChannel[];
export declare function getApprovedVideos(): Video[];
export declare function insertVideo(data: {
    channel_id: number | null;
    youtube_id: string;
    title: string;
    thumbnail_url: string | null;
    published_at: string;
    status: string;
}): Video | null;
export declare function videoExists(youtubeId: string): boolean;
export declare function updateVideoStatus(id: number, status: string, extra?: {
    file_path?: string;
    error_message?: string;
}): boolean;
export declare function getVideoById(id: number): Video | undefined;
export declare function getDownloadedVideosWithChannel(): Array<{
    file_path: string | null;
    title: string;
    channel_name: string | null;
    published_at: string;
}>;
export declare function getServerStatus(): {
    channelCount: number;
    pendingCount: number;
    downloadingCount: number;
    doneCount: number;
    errorCount: number;
};
//# sourceMappingURL=db.d.ts.map