import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
const DB_DIR = process.env.DB_DIR || '/Volumes/TildaTube';
const DB_PATH = path.join(DB_DIR, 'tildatube.db');
let db;
export function getDb() {
    if (db)
        return db;
    if (!fs.existsSync(DB_DIR)) {
        // Never silently create a folder under /Volumes: that means the external
        // drive is not mounted, and creating it would produce an empty shadow
        // database on the boot disk. Fail loudly; launchd's KeepAlive will retry.
        if (DB_DIR.startsWith('/Volumes/')) {
            throw new Error(`[DB] ${DB_DIR} does not exist. Is the media drive mounted?`);
        }
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL UNIQUE,
      channel_url TEXT NOT NULL,
      from_date TEXT NOT NULL,
      auto_approve INTEGER NOT NULL DEFAULT 0,
      min_duration INTEGER NOT NULL DEFAULT 120,
      max_quality INTEGER NOT NULL DEFAULT 720,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
      youtube_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      published_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      max_quality INTEGER,
      file_path TEXT,
      error_message TEXT,
      source TEXT NOT NULL DEFAULT 'youtube',
      duration INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
    // Idempotent migrations for databases created by earlier versions.
    const channelCols = db.prepare('PRAGMA table_info(channels)').all();
    if (!channelCols.find((c) => c.name === 'min_duration')) {
        db.exec('ALTER TABLE channels ADD COLUMN min_duration INTEGER NOT NULL DEFAULT 120');
        console.log('[DB] Added min_duration column to channels');
    }
    if (!channelCols.find((c) => c.name === 'max_quality')) {
        db.exec('ALTER TABLE channels ADD COLUMN max_quality INTEGER NOT NULL DEFAULT 720');
        console.log('[DB] Added max_quality column to channels');
    }
    const videoCols = db.prepare('PRAGMA table_info(videos)').all();
    if (!videoCols.find((c) => c.name === 'max_quality')) {
        db.exec('ALTER TABLE videos ADD COLUMN max_quality INTEGER');
        console.log('[DB] Added max_quality column to videos');
    }
    if (!videoCols.find((c) => c.name === 'source')) {
        db.exec("ALTER TABLE videos ADD COLUMN source TEXT NOT NULL DEFAULT 'youtube'");
        console.log('[DB] Added source column to videos');
    }
    if (!videoCols.find((c) => c.name === 'duration')) {
        db.exec('ALTER TABLE videos ADD COLUMN duration INTEGER');
        console.log('[DB] Added duration column to videos');
    }
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
    CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
  `);
    repairPublishedDates(db);
    return db;
}
/**
 * One-time repair. An earlier backfill stored the literal string "NA" as the
 * publish date for most videos. Downloaded files are named
 * "YYYY-MM-DD - Title.mp4", so the real date can be read back from the file
 * name; anything else falls back to the day the row was created.
 */
function repairPublishedDates(db) {
    const bad = db.prepare(`
    SELECT id, file_path, created_at FROM videos
    WHERE published_at NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
  `).all();
    if (bad.length === 0)
        return;
    const update = db.prepare('UPDATE videos SET published_at = ? WHERE id = ?');
    let fromFile = 0;
    db.transaction(() => {
        for (const row of bad) {
            const m = row.file_path ? /(?:^|\/)(\d{4}-\d{2}-\d{2}) - [^/]*$/.exec(row.file_path) : null;
            if (m)
                fromFile++;
            update.run(m ? m[1] : row.created_at.slice(0, 10), row.id);
        }
    })();
    console.log(`[DB] Repaired ${bad.length} missing publish date(s): ${fromFile} from file names, ${bad.length - fromFile} from row creation date`);
}
export function getAllChannels() {
    return getDb().prepare(`
    SELECT c.*,
      COUNT(v.id) AS video_count,
      COUNT(CASE WHEN v.status = 'pending' THEN 1 END) AS pending_count,
      COUNT(CASE WHEN v.status = 'done' THEN 1 END) AS done_count,
      COUNT(CASE WHEN v.status = 'error' THEN 1 END) AS error_count
    FROM channels c
    LEFT JOIN videos v ON v.channel_id = c.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `).all();
}
export function addChannel(data) {
    const db = getDb();
    const result = db.prepare(`
    INSERT INTO channels (name, channel_id, channel_url, from_date, auto_approve, min_duration, max_quality)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.name, data.channel_id, data.channel_url, data.from_date, data.auto_approve ? 1 : 0, data.min_duration ?? 120, data.max_quality ?? 720);
    return db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
}
/**
 * Delete a channel and all of its video rows in one transaction.
 * Returns the file paths of its downloaded videos so the caller can
 * optionally remove them from disk. Returns null if the channel doesn't exist.
 */
export function deleteChannel(id) {
    const db = getDb();
    return db.transaction(() => {
        const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
        if (!channel)
            return null;
        const rows = db.prepare('SELECT file_path FROM videos WHERE channel_id = ? AND file_path IS NOT NULL').all(id);
        db.prepare('DELETE FROM videos WHERE channel_id = ?').run(id);
        db.prepare('DELETE FROM channels WHERE id = ?').run(id);
        return { name: channel.name, filePaths: rows.map((r) => r.file_path) };
    })();
}
export function getChannelById(id) {
    return getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id);
}
export function updateChannel(id, data) {
    const sets = [];
    const params = [];
    if (data.from_date !== undefined) {
        sets.push('from_date = ?');
        params.push(data.from_date);
    }
    if (data.auto_approve !== undefined) {
        sets.push('auto_approve = ?');
        params.push(data.auto_approve ? 1 : 0);
    }
    if (data.min_duration !== undefined) {
        sets.push('min_duration = ?');
        params.push(data.min_duration);
    }
    if (data.max_quality !== undefined) {
        sets.push('max_quality = ?');
        params.push(data.max_quality);
    }
    if (sets.length === 0)
        return false;
    params.push(id);
    return getDb().prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes > 0;
}
const VIDEO_SELECT = `
  SELECT v.*, c.name AS channel_name
  FROM videos v
  LEFT JOIN channels c ON v.channel_id = c.id
`;
export function getPendingVideos() {
    return getDb().prepare(`${VIDEO_SELECT} WHERE v.status = 'pending' ORDER BY v.published_at DESC`).all();
}
export function getAllVideos() {
    return getDb().prepare(`${VIDEO_SELECT} ORDER BY v.published_at DESC, v.id DESC`).all();
}
export function getVideosByChannel(channelId) {
    return getDb().prepare(`${VIDEO_SELECT} WHERE v.channel_id = ? ORDER BY v.published_at DESC, v.id DESC`).all(channelId);
}
/** Oldest approved video, or undefined. The downloader works one at a time. */
export function getNextApprovedVideo() {
    return getDb().prepare(`SELECT * FROM videos WHERE status = 'approved' ORDER BY updated_at ASC LIMIT 1`).get();
}
export function countApproved() {
    return getDb().prepare(`SELECT COUNT(*) AS n FROM videos WHERE status = 'approved'`).get().n;
}
export function insertVideo(data) {
    const db = getDb();
    try {
        const result = db.prepare(`
      INSERT INTO videos (channel_id, youtube_id, title, thumbnail_url, published_at, status, max_quality, source, duration, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.channel_id, data.youtube_id, data.title, data.thumbnail_url, data.published_at, data.status, data.max_quality ?? null, data.source ?? 'youtube', data.duration ?? null, data.file_path ?? null);
        return db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);
    }
    catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE')
            return null; // already known
        throw e;
    }
}
export function videoExists(youtubeId) {
    return !!getDb().prepare('SELECT 1 FROM videos WHERE youtube_id = ?').get(youtubeId);
}
export function getVideoByYoutubeId(youtubeId) {
    return getDb().prepare('SELECT * FROM videos WHERE youtube_id = ?').get(youtubeId);
}
export function getVideoById(id) {
    return getDb().prepare('SELECT * FROM videos WHERE id = ?').get(id);
}
export function updateVideoStatus(id, status, extra) {
    let sql = `UPDATE videos SET status = ?, updated_at = datetime('now')`;
    const params = [status];
    if (extra?.file_path !== undefined) {
        sql += ', file_path = ?';
        params.push(extra.file_path);
    }
    if (extra?.error_message !== undefined) {
        sql += ', error_message = ?';
        params.push(extra.error_message);
    }
    if (extra?.published_at !== undefined) {
        sql += ', published_at = ?';
        params.push(extra.published_at);
    }
    if (extra?.duration !== undefined) {
        sql += ', duration = ?';
        params.push(extra.duration);
    }
    if (extra?.title !== undefined) {
        sql += ', title = ?';
        params.push(extra.title);
    }
    if (extra?.channel_id !== undefined) {
        sql += ', channel_id = ?';
        params.push(extra.channel_id);
    }
    sql += ' WHERE id = ?';
    params.push(id);
    return getDb().prepare(sql).run(...params).changes > 0;
}
export function deleteVideoRow(id) {
    return getDb().prepare('DELETE FROM videos WHERE id = ?').run(id).changes > 0;
}
/**
 * Called once at startup. Anything still marked "downloading" was interrupted
 * by a crash or restart; surface it as an error the parent can retry.
 */
export function resetStuckDownloads() {
    return getDb().prepare(`
    UPDATE videos
    SET status = 'error',
        error_message = 'Download was interrupted by a server restart. Press Retry to try again.',
        updated_at = datetime('now')
    WHERE status = 'downloading'
  `).run().changes;
}
export function getServerStatus() {
    const db = getDb();
    const channels = db.prepare('SELECT COUNT(*) AS count FROM channels').get();
    const videos = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pendingCount,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approvedCount,
      COUNT(CASE WHEN status = 'downloading' THEN 1 END) AS downloadingCount,
      COUNT(CASE WHEN status = 'done' THEN 1 END) AS doneCount,
      COUNT(CASE WHEN status = 'error' THEN 1 END) AS errorCount
    FROM videos
  `).get();
    return { channelCount: channels.count, ...videos };
}
//# sourceMappingURL=db.js.map