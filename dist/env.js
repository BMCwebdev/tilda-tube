import { execFileSync } from 'child_process';
/**
 * Shared environment for child processes (yt-dlp, etc).
 * Ensures Homebrew paths are available so yt-dlp can find deno/ffmpeg.
 */
export const childEnv = {
    ...process.env,
    PATH: [
        '/usr/local/bin', // Homebrew (Intel Mac)
        '/opt/homebrew/bin', // Homebrew (Apple Silicon)
        process.env.PATH || '/usr/bin:/bin',
    ].join(':'),
};
/**
 * Resolve full path to yt-dlp binary.
 * Using the absolute path avoids PATH resolution issues with execFile.
 */
function findYtDlp() {
    const candidates = ['/usr/local/bin/yt-dlp', '/opt/homebrew/bin/yt-dlp'];
    for (const p of candidates) {
        try {
            execFileSync(p, ['--version'], { timeout: 5000 });
            return p;
        }
        catch { }
    }
    return 'yt-dlp'; // fallback to PATH lookup
}
export const YT_DLP = findYtDlp();
//# sourceMappingURL=env.js.map