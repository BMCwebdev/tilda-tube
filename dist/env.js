/**
 * Shared configuration and child-process environment.
 *
 * Everything that used to be read ad hoc from process.env in several files
 * lives here so there is exactly one place to look.
 */
import os from 'os';
const HOME = process.env.HOME || os.homedir();
/** Environment for yt-dlp / ffmpeg child processes. */
export const childEnv = {
    ...process.env,
    PATH: [
        '/usr/local/bin', // Homebrew (Intel Mac)
        '/opt/homebrew/bin', // Homebrew (Apple Silicon)
        `${HOME}/.deno/bin`, // Deno installed via its own installer (yt-dlp needs it for YouTube)
        process.env.PATH || '/usr/bin:/bin',
    ].join(':'),
};
/** Absolute path to yt-dlp. Override with YT_DLP_PATH. */
export const YT_DLP = process.env.YT_DLP_PATH || '/usr/local/bin/yt-dlp';
/** ffmpeg binary; resolved via childEnv.PATH unless FFMPEG_PATH is set. */
export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
/** Where videos live. Infuse browses this folder over SMB. */
export const MEDIA_DIR = process.env.MEDIA_DIR || '/Volumes/TildaTube/media';
/** Downloads land here first and are moved into MEDIA_DIR when complete, so partial files never show in Infuse. */
export const INCOMING_DIR = `${MEDIA_DIR}/.incoming`;
/** Skip every yt-dlp/ffmpeg call. For local UI/API development only. */
export const DRY_RUN = process.env.DRY_RUN === 'true';
console.log(`[env] yt-dlp: ${YT_DLP}  media: ${MEDIA_DIR}${DRY_RUN ? '  (DRY_RUN)' : ''}`);
//# sourceMappingURL=env.js.map