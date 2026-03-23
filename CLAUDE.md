# CLAUDE.md

## What is this project?

TildaTube is a self-hosted YouTube media server for kids. Parents curate channels and approve videos via a web UI, videos are downloaded via yt-dlp, and Plex serves them on Apple TV — no YouTube UI, no ads, no algorithm.

Runs on a Mac Mini (Intel) with an external drive at `/Volumes/TildaTube`.

## Architecture

```
src/
  server.ts       — Express app, cron job (daily 2am sync), startup backfill
  api.ts          — REST API routes (channels CRUD, video approval, single video add)
  db.ts           — SQLite via better-sqlite3, schema migrations, all queries
  poller.ts       — Fetches YouTube RSS feeds, inserts new videos as pending/approved
  downloader.ts   — Downloads approved videos via yt-dlp, handles Shorts routing
  nfo.ts          — Generates Plex NFO files for collection grouping
  env.ts          — Shared child process env (PATH for Homebrew, yt-dlp path)
  ui/             — React SPA (Vite + React 18, no framework)
    App.tsx        — Main app with tab navigation (Queue, Channels, Library)
    components/
      ApprovalQueue.tsx — Pending videos + "Add Video" URL input
      ChannelList.tsx   — Channel management + AddChannelForm + EditChannelForm
      AddChannelForm.tsx — Add channel with URL, date range, auto-approve, min duration
      Library.tsx        — Downloaded/errored videos list
```

## Key concepts

- **Video lifecycle**: `pending` → `approved` → `downloading` → `done` (or `rejected`/`error`)
- **Channels** have `auto_approve` (skip the queue) and `min_duration` (shorts threshold)
- **Shorts**: Videos shorter than a channel's `min_duration` download into `MEDIA_DIR/Shorts/ChannelName/` with NFO collection "Shorts - ChannelName". Full-length videos go to `MEDIA_DIR/ChannelName/`.
- **NFO files**: Plex-compatible XML sidecar files placed next to each video. They set the `<set>` (collection) tag so Plex groups videos by channel. The backfill function on startup creates NFOs for any videos missing them, and detects Shorts by checking if the file path contains `/Shorts/`.
- **Single videos**: Added via the Queue UI (or `POST /api/videos`), have `channel_id: null`, no duration filter applied.

## Tech stack

- **Backend**: Node.js, Express, TypeScript (ESM), better-sqlite3, node-cron
- **Frontend**: React 18, Vite, inline styles (no CSS framework)
- **External tools**: yt-dlp (requires Deno runtime for YouTube), ffmpeg
- **Database**: SQLite at `/Volumes/TildaTube/tildatube.db` (override with `DB_DIR` env)
- **Media**: `/Volumes/TildaTube/media` (override with `MEDIA_DIR` env)

## Development commands

```bash
npm install              # Install all deps (including devDependencies)
npm run build            # tsc && vite build → outputs to dist/
npm run dev              # Run with tsx (hot reload, no build needed)
npm start                # Run from dist/ (production)

# Local dev without yt-dlp:
DB_DIR=./data DRY_RUN=true npx tsx src/server.ts
```

`DRY_RUN=true` skips all yt-dlp calls — channel resolution returns placeholders, downloads are simulated. Use this for UI/API development.

## Database schema

Two tables: `channels` and `videos`. Migrations run on startup in `db.ts` — new columns are added via `ALTER TABLE` with checks (`PRAGMA table_info`) so they're safe to re-run. When adding a new column, add it to both the `CREATE TABLE` statement and the migration block below it.

## Important patterns

- The `dist/` folder is committed to the repo so the Mac Mini doesn't need a build step on `git pull`.
- yt-dlp calls use `execFile` with `childEnv` from `env.ts` to ensure Homebrew binaries are on PATH.
- The downloader checks duration with a separate `yt-dlp --print duration` call before downloading, so it can route to the correct folder (regular vs Shorts).
- The UI has no router — just a `view` state toggling between Queue/Channels/Library tabs.
- All styling is inline React `CSSProperties`. No CSS files or Tailwind.
