import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || '/Volumes/TildaTube';
const DB_PATH = path.join(DB_DIR, 'tildatube.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (db) return db;

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
      file_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// --- Channel queries ---

export interface Channel {
  id: number;
  name: string;
  channel_id: string;
  channel_url: string;
  from_date: string;
  auto_approve: number;
  created_at: string;
}

export interface ChannelWithCounts extends Channel {
  video_count: number;
  pending_count: number;
}

export function getAllChannels(): ChannelWithCounts[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*,
      COUNT(v.id) as video_count,
      COUNT(CASE WHEN v.status = 'pending' THEN 1 END) as pending_count
    FROM channels c
    LEFT JOIN videos v ON v.channel_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all() as ChannelWithCounts[];
}

export function addChannel(data: {
  name: string;
  channel_id: string;
  channel_url: string;
  from_date: string;
  auto_approve: boolean;
}): Channel {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO channels (name, channel_id, channel_url, from_date, auto_approve)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.name, data.channel_id, data.channel_url, data.from_date, data.auto_approve ? 1 : 0);

  return db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid) as Channel;
}

export function deleteChannel(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getChannelById(id: number): Channel | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function updateChannel(id: number, data: { from_date?: string; auto_approve?: boolean }): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];

  if (data.from_date !== undefined) {
    sets.push('from_date = ?');
    params.push(data.from_date);
  }
  if (data.auto_approve !== undefined) {
    sets.push('auto_approve = ?');
    params.push(data.auto_approve ? 1 : 0);
  }

  if (sets.length === 0) return false;

  params.push(id);
  const result = db.prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return result.changes > 0;
}

// --- Video queries ---

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

export function getPendingVideos(): VideoWithChannel[] {
  const db = getDb();
  return db.prepare(`
    SELECT v.*, c.name as channel_name
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'pending'
    ORDER BY v.published_at DESC
  `).all() as VideoWithChannel[];
}

export function getAllVideos(): VideoWithChannel[] {
  const db = getDb();
  return db.prepare(`
    SELECT v.*, c.name as channel_name
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.id
    ORDER BY v.created_at DESC
  `).all() as VideoWithChannel[];
}

export function getApprovedVideos(): Video[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM videos WHERE status = 'approved' ORDER BY updated_at ASC LIMIT 1
  `).all() as Video[];
}

export function insertVideo(data: {
  channel_id: number | null;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string;
  status: string;
}): Video | null {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO videos (channel_id, youtube_id, title, thumbnail_url, published_at, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.channel_id, data.youtube_id, data.title, data.thumbnail_url, data.published_at, data.status);
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid) as Video;
  } catch (e: any) {
    // UNIQUE constraint violation means video already exists
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
    throw e;
  }
}

export function videoExists(youtubeId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM videos WHERE youtube_id = ?').get(youtubeId);
  return !!row;
}

export function updateVideoStatus(
  id: number,
  status: string,
  extra?: { file_path?: string; error_message?: string }
): boolean {
  const db = getDb();
  let sql = `UPDATE videos SET status = ?, updated_at = datetime('now')`;
  const params: any[] = [status];

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

export function getVideoById(id: number): Video | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Video | undefined;
}

export function getDownloadedVideosWithChannel(): Array<{
  file_path: string | null;
  title: string;
  channel_name: string | null;
  published_at: string;
}> {
  const db = getDb();
  return db.prepare(`
    SELECT v.file_path, v.title, c.name as channel_name, v.published_at
    FROM videos v
    LEFT JOIN channels c ON v.channel_id = c.id
    WHERE v.status = 'done' AND v.file_path IS NOT NULL
  `).all() as any[];
}

export function getServerStatus(): {
  channelCount: number;
  pendingCount: number;
  downloadingCount: number;
  doneCount: number;
  errorCount: number;
} {
  const db = getDb();
  const channels = db.prepare('SELECT COUNT(*) as count FROM channels').get() as any;
  const videos = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingCount,
      COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloadingCount,
      COUNT(CASE WHEN status = 'done' THEN 1 END) as doneCount,
      COUNT(CASE WHEN status = 'error' THEN 1 END) as errorCount
    FROM videos
  `).get() as any;

  return {
    channelCount: channels.count,
    pendingCount: videos.pendingCount,
    downloadingCount: videos.downloadingCount,
    doneCount: videos.doneCount,
    errorCount: videos.errorCount,
  };
}
