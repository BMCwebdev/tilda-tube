/**
 * Import a video file that did not come from YouTube (a home video, a file
 * someone sent you) straight into the library so Infuse can play it.
 *
 * The upload is streamed to disk, a thumbnail sidecar is made with ffmpeg,
 * and a row is inserted with source = 'local' so it shows up in the Library.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { insertVideo } from './db.js';
import { childEnv, FFMPEG, MEDIA_DIR, INCOMING_DIR, DRY_RUN } from './env.js';
/** A problem with what the user sent, as opposed to a server failure. */
export class ImportError extends Error {
}
const ALLOWED_EXT = new Set(['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.mpg', '.mpeg', '.ts']);
/** Make a name safe to use as a single path component on an exFAT drive. */
export function sanitizeName(input, fallback) {
    const cleaned = input
        .normalize('NFC')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+/, '');
    return cleaned.slice(0, 120) || fallback;
}
/** Top-level library folders (channel folders plus anything else the parent made). */
export function listLibraryFolders() {
    try {
        return fs.readdirSync(MEDIA_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'Shorts')
            .map((d) => d.name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    catch {
        return [];
    }
}
export async function importLocalFile(stream, opts) {
    const ext = path.extname(opts.filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
        throw new ImportError(`Unsupported file type "${ext || 'none'}". Use mp4, m4v, mov, mkv, webm, avi, mpg or ts.`);
    }
    const folder = sanitizeName(opts.folder, 'Imported');
    const baseName = sanitizeName(path.basename(opts.filename, path.extname(opts.filename)), 'video');
    const title = (opts.title || '').trim() || baseName;
    const date = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : new Date().toISOString().slice(0, 10);
    const destDir = path.join(MEDIA_DIR, folder);
    const finalBase = uniqueBase(destDir, `${date} - ${baseName}`, ext);
    const finalPath = path.join(destDir, `${finalBase}${ext}`);
    const tmpDir = path.join(INCOMING_DIR, 'import');
    const tmpPath = path.join(tmpDir, `${randomUUID()}${ext}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(destDir, { recursive: true });
    try {
        await writeStream(stream, tmpPath);
        const size = fs.statSync(tmpPath).size;
        if (size === 0)
            throw new ImportError('Uploaded file was empty');
        let duration = null;
        if (!DRY_RUN) {
            duration = await probeDuration(tmpPath);
            const jpgPath = path.join(destDir, `${finalBase}.jpg`);
            await makeThumbnail(tmpPath, jpgPath, duration);
            ensureFolderJpg(destDir, jpgPath);
        }
        fs.renameSync(tmpPath, finalPath);
        const video = insertVideo({
            channel_id: null,
            youtube_id: `local:${randomUUID()}`,
            title,
            thumbnail_url: null,
            published_at: date,
            status: 'done',
            source: 'local',
            duration,
            file_path: finalPath,
        });
        if (!video)
            throw new Error('Could not record imported video');
        console.log(`[Import] ${title} -> ${finalPath} (${(size / 1024 ** 2).toFixed(1)} MB)`);
        return video;
    }
    catch (err) {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { /* already gone */ }
        throw err;
    }
}
/**
 * Channel folders get a folder.jpg (the channel avatar) so Infuse shows them
 * with artwork. A folder the parent made by importing has no avatar, so use the
 * first imported video's thumbnail; never overwrite one that is already there.
 */
function ensureFolderJpg(dir, jpgPath) {
    const target = path.join(dir, 'folder.jpg');
    if (fs.existsSync(target) || !fs.existsSync(jpgPath))
        return;
    try {
        fs.copyFileSync(jpgPath, target);
    }
    catch (err) {
        console.warn(`[Import] Could not create folder.jpg in ${path.basename(dir)}:`, err);
    }
}
function uniqueBase(dir, base, ext) {
    let candidate = base;
    for (let i = 2; fs.existsSync(path.join(dir, `${candidate}${ext}`)); i++)
        candidate = `${base} (${i})`;
    return candidate;
}
function writeStream(stream, dest) {
    return new Promise((resolve, reject) => {
        const out = fs.createWriteStream(dest);
        stream.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        stream.pipe(out);
    });
}
function probeDuration(file) {
    return new Promise((resolve) => {
        // ffmpeg prints "Duration: HH:MM:SS.xx" on stderr; no ffprobe dependency needed.
        execFile(FFMPEG, ['-i', file], { env: childEnv, timeout: 60_000 }, (_err, _out, stderr) => {
            const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr || '');
            resolve(m ? Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : null);
        });
    });
}
function makeThumbnail(file, jpgPath, duration) {
    return new Promise((resolve) => {
        const at = duration && duration > 10 ? Math.min(10, Math.floor(duration / 4)) : 1;
        execFile(FFMPEG, [
            '-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', jpgPath,
        ], { env: childEnv, timeout: 120_000 }, (err) => {
            if (err)
                console.warn(`[Import] Thumbnail failed for ${path.basename(file)}: ${err.message}`);
            resolve(); // a missing thumbnail is not fatal; Infuse will still play the file
        });
    });
}
//# sourceMappingURL=localimport.js.map