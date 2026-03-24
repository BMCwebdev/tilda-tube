# Handoff Notes

## What We've Been Building

TildaTube started as a basic RSS poller + downloader and has evolved through several iterations into a fairly complete system. The major arcs of work have been:

1. **Getting yt-dlp to actually run** — Multiple rounds of PATH/env debugging. yt-dlp requires Deno for YouTube extraction, and child processes don't inherit the full shell environment. Solved by hardcoding `/usr/local/bin/yt-dlp` and passing a custom `childEnv` from `env.ts` with Homebrew paths.

2. **Channel management UX** — Added date presets, edit forms, custom date ranges, per-channel duration filters (for routing Shorts), and per-channel/per-video quality settings (480/720/1080).

3. **Shorts handling** — Videos shorter than a channel's `min_duration` go into `MEDIA_DIR/Shorts/ChannelName/` instead of the main channel folder. Infuse shows these as separate browsable folders.

4. **Full backfill on channel add** — RSS only gives ~15 recent videos. When you add a channel, `backfillChannel()` now runs `yt-dlp --flat-playlist` to discover ALL videos back to the channel's `from_date`. This is the "more than 15 videos" change mentioned below.

5. **Plex → Infuse migration** — Originally built with Plex as the playback app. The 2012 Mac Mini couldn't handle Plex transcoding, so we switched to Infuse (Apple TV app) which plays all formats natively over SMB. Plex integration code (`plex.ts`, `nfo.ts`) has been fully removed.

## Last Thing We Did

Removed all Plex integration from the codebase:
- Deleted `src/plex.ts` (API collection tagging) and `src/nfo.ts` (NFO sidecar files)
- Removed Plex imports and calls from `server.ts` and `downloader.ts`
- Removed `getDownloadedVideosWithChannel()` from `db.ts` (was only used by Plex backfill)
- Removed `PLEX_TOKEN` from `com.tildatube.plist`
- Updated README.md, CLAUDE.md, STATUS.md to reflect Infuse over SMB

## What Has NOT Been Deployed Yet

The Mac Mini is running an older build. Everything from **"Add yt-dlp full backfill on channel add"** (`429a824`) onward has NOT been deployed. That includes:

- Full backfill on channel add (the big one — will discover all historical videos for existing channels)
- Per-channel/per-video quality settings
- Plex removal (the Mac Mini still has the old Plex code, but it's harmless — just logs "No PLEX_TOKEN set, skipping")

### To deploy all pending changes on the Mac Mini:

```bash
cd ~/tilda-tube
git pull
npm install --production

# Reload the service
launchctl unload ~/Library/LaunchAgents/com.tildatube.plist
cp com.tildatube.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
```

No `npm run build` needed — `dist/` is committed and up to date.

**Heads up:** On first startup after deploy, the server will run the initial sync, which now includes full backfill for any channels added since the last deploy. This may take a while — check logs at `/Volumes/TildaTube/logs/tildatube.out`.

## Known Gotchas / Context for Next Agent

- **Playback is via Infuse on Apple TV over SMB** — no Plex, no transcoding server. The Mac Mini just serves files via macOS File Sharing.
- **DRY_RUN=true** skips all yt-dlp calls — use it for UI/API dev without downloading anything.
- **The `dist/` folder is committed** — this is intentional so the Mac Mini doesn't need Node dev tooling. Always rebuild before committing if you change source.
- **Database migrations are idempotent** — new columns use `ALTER TABLE` with `PRAGMA table_info` checks, safe to re-run.
- **Single videos** (added via URL in the Queue tab) have `channel_id: null` and skip duration filtering.
