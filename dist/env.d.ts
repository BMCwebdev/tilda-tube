/**
 * Shared environment for child processes (yt-dlp, etc).
 * Ensures Homebrew paths are available so yt-dlp can find deno/ffmpeg.
 */
export declare const childEnv: Record<string, string>;
/** Absolute path to yt-dlp. Override with YT_DLP_PATH env var if needed. */
export declare const YT_DLP: string;
//# sourceMappingURL=env.d.ts.map