/**
 * Shared environment for child processes (yt-dlp, etc).
 * Ensures Homebrew paths are available so yt-dlp can find deno/ffmpeg.
 */
export const childEnv: Record<string, string> = {
  ...process.env as Record<string, string>,
  PATH: [
    '/usr/local/bin',      // Homebrew (Intel Mac)
    '/opt/homebrew/bin',   // Homebrew (Apple Silicon)
    process.env.PATH || '/usr/bin:/bin',
  ].join(':'),
};
