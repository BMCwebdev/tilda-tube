# CLAUDE.md

## What is this project?

TildaTube is a self-hosted YouTube media server for kids. Parents curate channels and approve videos via a web UI, videos are downloaded via yt-dlp, and served to Apple TV via Infuse (over SMB) — no YouTube UI, no ads, no algorithm. Parents can also import their own video files.

Runs on a 2012 Intel Mac mini (macOS Catalina, Node 18) with an external exFAT drive at `/Volumes/TildaTube`. The mini cannot build the project (Vite/esbuild need a newer macOS), so `dist/` is committed and the mini only ever runs `git pull`.

## Architecture

```
src/
  server.ts        — Express app, JSON 404 + error middleware, cron (daily 2am sync, 10-min download sweep), startup tasks
  api.ts           — REST routes, input validation, yt-dlp lookups (never shell: true), background job registry
  db.ts            — SQLite via better-sqlite3, idempotent migrations, all queries
  poller.ts        — Daily RSS poll + yt-dlp --flat-playlist backfill (JSON per line)
  downloader.ts    — Serial download loop: yt-dlp into MEDIA_DIR/.incoming, then move into the library (Shorts routing by duration)
  localimport.ts   — Streams an uploaded file into the library, makes a thumbnail with ffmpeg, inserts a source='local' row
  env.ts           — Single source of config: MEDIA_DIR, INCOMING_DIR, DRY_RUN, YT_DLP, FFMPEG, childEnv (PATH incl. ~/.deno/bin)
  ui/              — React 18 + Vite SPA, inline styles, no router
    App.tsx                     — Tabs (Queue / Channels / Library), status bar with current download + background jobs
    lib/api.ts                  — fetch wrapper that throws ApiError with the server's message; XHR upload with progress
    lib/styles.ts               — colour tokens, btn()/card/input styles, status labels, formatters
    lib/types.ts                — Video / Channel / ServerStatus types shared by components
    components/VideoRow.tsx     — One video with thumbnail, meta, and the right actions for its status
    components/DatePresetPicker.tsx — Date presets, quality select, shorts-threshold select (shared by add + edit)
    components/ApprovalQueue.tsx — Pending videos with multi-select + bulk approve/reject; "add single video" form
    components/ChannelList.tsx  — Channel cards: settings, Find videos (backfill), Remove (optionally delete files), expandable video list
    components/AddChannelForm.tsx
    components/Library.tsx      — All videos with filters/search/channel picker, Retry all, Import a file panel
```

## Key concepts

- **Video lifecycle**: `pending` → `approved` → `downloading` → `done`, or `rejected` / `error`. `deleted` marks a YouTube video whose file was removed on purpose; keeping the row stops the next poll from re-downloading it. Retry: `error|rejected|deleted` → `approved`.
- **Sources**: `source = 'youtube'` (default) or `'local'` (imported file; `youtube_id` is `local:<uuid>`; never re-downloaded).
- **Channels** have `auto_approve` (skip the queue), `min_duration` (shorts threshold, seconds) and `max_quality` (480/720/1080).
- **Shorts**: videos with duration ≤ `min_duration` are filed under `MEDIA_DIR/Shorts/<Channel>/`; others under `MEDIA_DIR/<Channel>/`. The duration comes from the same yt-dlp run that downloads the file (no extra metadata call).
- **Incoming folder**: yt-dlp writes to `MEDIA_DIR/.incoming/<Channel>/`; the file and its `.jpg` are moved into place only when complete, so Infuse never sees partial files.
- **Polling vs backfill**: daily RSS catches ~15 recent uploads per channel. `backfillChannel()` (on add, and via "Find videos") lists everything back to `from_date`, capped at 75 per pass. Dedupe is the `youtube_id` UNIQUE constraint.
- **Single videos** have `channel_id = null`; quality is per-video; no Shorts routing.

## Tech stack

- Backend: Node 18+ (mini) / 22 (laptop), Express 4, TypeScript ESM, better-sqlite3, node-cron, fast-xml-parser
- Frontend: React 18, Vite 6, inline styles only
- External: yt-dlp (needs Deno on PATH for YouTube), ffmpeg (import thumbnails + yt-dlp merging)
- Database: `/Volumes/TildaTube/tildatube.db` (`DB_DIR`); media: `/Volumes/TildaTube/media` (`MEDIA_DIR`)

## Development commands

```bash
npm install
npm run build            # tsc && vite build → dist/ (REQUIRED before committing; dist/ is tracked)
npm run dev              # tsx src/server.ts
DB_DIR=./data MEDIA_DIR=./data/media DRY_RUN=true npm run dev   # no yt-dlp/ffmpeg needed
```

`DRY_RUN=true` skips every yt-dlp/ffmpeg call: channel lookups return placeholders, downloads are simulated after 1.5 s, imports skip the thumbnail.

### Smoke test (no test suite exists)

Start a DRY_RUN server on a scratch `DB_DIR`/`MEDIA_DIR` and hit the API with curl: add channel → patch → add video with `&list=` in the URL → approve → delete file → re-add → bulk approve → import a file → delete channel. Every path should answer JSON, never HTML, and never 500 for bad input. Also run it once against a `.dump` of the production DB to check migrations.

## Database schema

Two tables, `channels` and `videos`. Migrations in `getDb()` add columns with `PRAGMA table_info` guards and are safe to re-run. `repairPublishedDates()` fixes rows whose `published_at` is not a date (an old parser stored "NA"). When adding a column: add it to `CREATE TABLE` and to the migration block. Foreign keys are on; `deleteChannel()` removes video rows explicitly inside a transaction because the production table predates `ON DELETE CASCADE`.

## Important patterns

- **Never pass `shell: true` to `execFile`.** URLs are user input. Every yt-dlp lookup goes through `ytdlpJson()` in `api.ts`, which uses `--print '%(.{field,...})j'` to get one JSON line, and every URL is checked with `isYouTubeUrl()` first.
- All handlers are wrapped with `wrap()` so thrown `HttpError`s become `{ error }` JSON with the right status; anything else is a 500 with the message. Unknown `/api/*` routes return JSON 404.
- The downloader is a single serial loop guarded by `isDownloading`; calling `downloadAllApproved()` from anywhere is safe and cheap. A 10-minute cron sweep is the safety net.
- Anything still `downloading` at startup is flipped to `error` with a "restart" message so the parent can retry it.
- `childEnv.PATH` includes `~/.deno/bin`; the launchd plist does too. Without Deno on PATH, YouTube downloads fail with HTTP 403.
- The UI reads `error` from every non-2xx response and shows it inline; do not swallow failures with a bare `fetch().then(refetch)`.
- Styling: inline `CSSProperties` via `lib/styles.ts` helpers. No CSS files or Tailwind.
