import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
const DB_DIR = process.env.DB_DIR || '/Volumes/TildaTube';
const DB_PATH = path.join(DB_DIR, 'tildatube.db');
let db;
export function getDb() {
    if (db)
        return db;
    // Ensure directory exists
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Run migrations
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
      channel_id INTEGER REFERENCES channels(id),
      youtube_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      thumbnail_url TEXT,
      published_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      max_quality INTEGER,
      file_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
    // Migrations for existing databases
    const channelCols = db.prepare("PRAGMA table_info(channels)").all();
    if (!channelCols.find((c) => c.name === 'min_duration')) {
        db.exec("ALTER TABLE channels ADD COLUMN min_duration INTEGER NOT NULL DEFAULT 120");
        console.log('[DB] Added min_duration column to channels');
    }
    if (!channelCols.find((c) => c.name === 'max_quality')) {
        db.exec("ALTER TABLE channels ADD COLUMN max_quality INTEGER NOT NULL DEFAULT 720");
        console.log('[DB] Added max_quality column to channels');
    }
    const videoCols = db.prepare("PRAGMA table_info(videos)").all();
    if (!videoCols.find((c) => c.name === 'max_quality')) {
        db.exec("ALTER TABLE videos ADD COLUMN max_quality INTEGER");
        console.log('[DB] Added max_quality column to videos');
    }
    return db;
}
export function getAllChannels() {
    const db = getDb();
    return db.prepare(`
    SELECT c.*,
      COUNT(v.id) as video_count,
      COUNT(CASE WHEN v.status = 'pending' THEN 1 END) as pending_count
    FROM channels c
    LEFT JOIN videos v ON v.channel_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
}
export function addChannel(data) {
    const db = getDb();
    const minDur = data.min_duration ?? 120;
    const maxQual = data.max_quality ?? 720;
    const result = db.prepare(`
    INSERT INTO channels (name, channel_id, channel_url, from_date, auto_approve, min_duration, max_quality)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.name, data.channel_id, data.channel_url, data.from_date, data.auto_approve ? 1 : 0, minDur, maxQual);
    return db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
}
export function deleteChannel(id) {
    const db = getDb();
    const result = db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    return result.changes > 0;
}
export function getChannelById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
}
export function updateChannel(id, data) {
    const db = getDb();
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
    const result = db.prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return result.changes > 0;
}
export function getPendingVideos() {
    const db = getDb();
    return db.prepare(`
    SELECT v.*, c.name as channel_name
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'pending'
    ORDER BY v.published_at DESC
  `).all();
}
export function getAllVideos() {
    const db = getDb();
    return db.prepare(`
    SELECT v.*, c.name as channel_name
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.id
    ORDER BY v.created_at DESC
  `).all();
}
export function getApprovedVideos() {
    const db = getDb();
    return db.prepare(`
    SELECT * FROM videos WHERE status = 'approved' ORDER BY updated_at ASC LIMIT 1
  `).all();
}
export function insertVideo(data) {
    const db = getDb();
    try {
        const result = db.prepare(`
      INSERT INTO videos (channel_id, youtube_id, title, thumbnail_url, published_at, status, max_quality)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.channel_id, data.youtube_id, data.title, data.thumbnail_url, data.published_at, data.status, data.max_quality ?? null);
        return db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);
    }
    catch (e) {
        // UNIQUE constraint violation means video already exists
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE')
            return null;
        throw e;
    }
}
export function videoExists(youtubeId) {
    const db = getDb();
    const row = db.prepare('SELECT 1 FROM videos WHERE youtube_id = ?').get(youtubeId);
    return !!row;
}
export function updateVideoStatus(id, status, extra) {
    const db = getDb();
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
    sql += ' WHERE id = ?';
    params.push(id);
    const result = db.prepare(sql).run(...params);
    return result.changes > 0;
}
export function getVideoById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
}
export function getServerStatus() {
    const db = getDb();
    const channels = db.prepare('SELECT COUNT(*) as count FROM channels').get();
    const videos = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount,
      COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloadingCount,
      COUNT(CASE WHEN status = 'done' THEN 1 END) as doneCount,
      COUNT(CASE WHEN status = 'error' THEN 1 END) as errorCount
    FROM videos
  `).get();
    return {
        channelCount: channels.count,
        pendingCount: videos.pendingCount,
        downloadingCount: videos.downloadingCount,
        doneCount: videos.doneCount,
        errorCount: videos.errorCount,
    };
}
//# sourceMappingURL=db.js.map