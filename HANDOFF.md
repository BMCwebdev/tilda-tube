# Handoff Notes

Last updated 2026-09-29.

## What this is

TildaTube: a curated YouTube library for a kid. Parents manage it from a phone at
`http://brians-mac-mini.local:3001`; the kid watches through Infuse on the Apple TV over SMB.
See `README.md` for setup and daily use, `CLAUDE.md` for architecture and patterns.

## State of the deployment

- The Mac mini runs from `~/tilda-tube` (pull-only clone) via the launchd job `com.tildatube`.
- The 2026-09-17 change set (`f5f28c1`) is deployed; launchd owns the service (PID, exit 0).
- The 2026-09-18 follow-up and the 2026-09-29 change set are built and tested on the laptop,
  pending Brian's commit and deploy.

## What changed on 2026-09-29 (folders behave like channels)

Why: Brian imported a season of Good Witch into a new folder and the UI listed the files under
a single "Imported files" bucket instead of as a group, and there was no way to add one older
YouTube video to an existing channel.

- `ui/lib/video.ts`: `groupName()` = channel name, else the folder the file lives in, else
  "Imported files" / "Single videos". `Library.tsx` and `VideoRow.tsx` use it, so imported
  folders (and hand-added videos once downloaded) group the way Infuse shows them.
- `api.ts`: `POST /api/videos` takes an optional `channelId`. The video gets that channel's
  settings, skips the queue when the channel auto-approves, and is re-attached on a re-add.
  `resolveVideo()` now also returns the video's YouTube channel; a mismatch with the picked
  channel is a 400 because yt-dlp would file the download under the other channel's folder.
- `db.ts`: `updateVideoStatus()` accepts `channel_id`.
- `localimport.ts`: `ensureFolderJpg()` copies the first thumbnail to `folder.jpg` when the
  folder has none, so import folders get artwork in Infuse like channel folders do.
- `ApprovalQueue.tsx`: channel picker next to the URL; the quality select hides when a
  channel is picked (the channel's quality applies).
- Tested: DRY_RUN smoke (channel/no channel, auto-approve, bad ids, dup, re-add, import) and
  a run against a dump of the production DB; screenshots of Queue and Library.

## What changed on 2026-09-18 (small follow-up)

- `poller.ts`: when a channel's RSS feed is not 200 (ten of twelve were 404 on 2026-09-17,
  from two networks), the poll falls back to a yt-dlp listing of the 15 most recent uploads.
  RSS and backfill now share one `addDiscovered()` insert path and one `listChannelVideos()`.
- `downloader.ts`: `updateYtDlp()` runs `yt-dlp -U`, never throws, keeps the last result;
  `logYtDlpVersion()` at startup. `server.ts` schedules the update Mondays 01:30.
  `api.ts`: `/api/status` gains `ytDlpUpdate`; `POST /api/system/update-ytdlp` runs it now.

## What changed on 2026-09-17 (one big change set)

Why: downloads had been failing since August with HTTP 403 because yt-dlp could not find Deno
(installed at `~/.deno/bin`, which was on no PATH the app used); "Remove channel" never worked
(foreign-key error hidden by the UI); the API passed user-supplied URLs to a shell; and there
was no way to retry, delete, or import anything.

Backend:
- `env.ts` is now the one config module (`MEDIA_DIR`, `INCOMING_DIR`, `DRY_RUN`, `FFMPEG`, PATH with `~/.deno/bin`).
- `api.ts`: no more `shell: true`; every URL validated; all handlers return JSON errors; new
  routes for channel videos, retry, delete video, bulk actions, folders, import; single-video
  add is one yt-dlp call with `--no-playlist` and records the real upload date.
- `db.ts`: `source` and `duration` columns, indexes, `deleteChannel()` in a transaction,
  `resetStuckDownloads()`, `repairPublishedDates()` (771 rows had "NA" as a date; fixed from file names).
- `downloader.ts`: downloads land in `MEDIA_DIR/.incoming/` and are moved when complete;
  duration comes from the download run (the separate 40-second metadata call per video is gone);
  2-hour timeout; Shorts folders get a `folder.jpg`; `removeVideoFiles()`.
- `poller.ts`: backfill parses one JSON object per line instead of "every 3 lines is a video".
- `localimport.ts` (new): stream an uploaded file into the library with an ffmpeg thumbnail.
- `server.ts`: JSON 404 for `/api/*`, error middleware, 10-minute download sweep, stuck-download reset.
- `com.tildatube.plist`: logs under `~/Library/Logs/` (the external-drive log path is the likely
  cause of exit 78 on Catalina), `~/.deno/bin` on PATH, installed with a `sed` instead of hand edits.

UI:
- Shared `lib/` (api client, styles, types) and `VideoRow` with status-appropriate actions
  (Approve/Reject, Retry, Remove, Delete file, Download again).
- Queue: multi-select with bulk approve/reject, "Approve all".
- Channels: settings, **Find videos** (backfill, previously API-only), Remove with a "delete
  files too?" choice, expandable per-channel video list with filters. Errors are shown, not swallowed.
- Library: auto-refresh, Downloaded/Failed/Rejected/Everything filters, search, channel filter,
  "Retry all", and **Import a file** with upload progress.
- Header shows the current download and background jobs.

## To deploy

Follow the ops runbook (private, outside this repo). In short, on the mini:

```bash
ln -sf ~/.deno/bin/deno /usr/local/bin/deno && yt-dlp -U
cd ~/tilda-tube && git checkout -- com.tildatube.plist && git pull && npm install --production
launchctl unload ~/Library/LaunchAgents/com.tildatube.plist 2>/dev/null
sed "s/USERNAME/$USER/g" com.tildatube.plist > ~/Library/LaunchAgents/com.tildatube.plist
pkill -f "node dist/server.js"
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
launchctl list | grep tildatube      # want a PID and status 0
tail ~/Library/Logs/tildatube.out
```

Then in the UI: Library → Failed → Retry all.

## Known gotchas

- **`dist/` is committed.** Always `npm run build` before committing source changes.
- **The mini can't build.** Vite/esbuild binaries need macOS 12+. `npm install --production` there skips them.
- **Deno is not from Homebrew** on the mini; it lives in `~/.deno/bin`. If YouTube downloads
  fail with 403 and the error mentions "No supported JavaScript runtime", PATH lost it again.
- **yt-dlp goes stale in ~90 days.** The server now runs `yt-dlp -U` weekly; `POST /api/system/update-ytdlp` forces it. Still the first thing to try when downloads break.
- **YouTube is flaky.** A bare `HTTP Error 403` can succeed on the next retry; RSS feeds can 404 for most channels at once. The code tolerates both.
- Every yt-dlp call on the 2012 mini takes ~40 s just to start (Deno solving YouTube's challenge).
- There is no test suite. Use the DRY_RUN smoke test described in `CLAUDE.md`.
- Exit 78 from launchd means launchd itself failed before starting node (bad log path, TCC, etc).
  It never writes a log line, so look at the plist, not the logs.

## Ideas not done yet

- Remote viewing away from home: Tailscale, but **not on the mini** (Tailscale needs macOS 12+;
  1.70 was the last Catalina build). Use the Apple TV as a Tailscale subnet router for
  `192.168.0.0/24`; the mini then needs nothing. Do not port-forward: the app has no
  authentication and the mini's OS is end-of-life.
- Authentication on the web UI (a single shared PIN would do) before any remote access.
- A visual "pick videos" browser with thumbnails and date range over a channel's full listing.
- A proper design pass; the inline-style approach is consistent but plain.
- SMB share currently allows guest read/write; consider requiring the account.
