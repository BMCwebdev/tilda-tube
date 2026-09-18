/** Environment for yt-dlp / ffmpeg child processes. */
export declare const childEnv: Record<string, string>;
/** Absolute path to yt-dlp. Override with YT_DLP_PATH. */
export declare const YT_DLP: string;
/** ffmpeg binary; resolved via childEnv.PATH unless FFMPEG_PATH is set. */
export declare const FFMPEG: string;
/** Where videos live. Infuse browses this folder over SMB. */
export declare const MEDIA_DIR: string;
/** Downloads land here first and are moved into MEDIA_DIR when complete, so partial files never show in Infuse. */
export declare const INCOMING_DIR: string;
/** Skip every yt-dlp/ffmpeg call. For local UI/API development only. */
export declare const DRY_RUN: boolean;
//# sourceMappingURL=env.d.ts.map