# Handoff Notes

## What We've Been Building

TildaTube started as a basic RSS poller + downloader and has evolved through several iterations into a fairly complete system. The major arcs of work have been:

1. **Getting yt-dlp to actually run** — Multiple rounds of PATH/env debugging. yt-dlp requires Deno for YouTube extraction, and child processes don't inherit the full shell environment. Solved by hardcoding `/usr/local/bin/yt-dlp` and passing a custom `childEnv` from `env.ts` with Homebrew paths.

2. **Channel management UX** — Added date presets, edit forms, custom date ranges, per-channel duration filters (for routing Shorts), and per-channel/per-video quality settings (480/720/1080).

3. **Shorts handling** — Videos shorter than a channel's `min_duration` go into `MEDIA_DIR/Shorts/ChannelName/` instead of the main channel folder. This lets Plex show them as separate collections.

4. **Full backfill on channel add** — RSS only gives ~15 recent videos. When you add a channel, `backfillChannel()` now runs `yt-dlp --flat-playlist` to discover ALL videos back to the channel's `from_date`. This is the "more than 15 videos" change mentioned below.

5. **Plex integration pivot: NFO → API** — We originally generated NFO sidecar files with `<set>` tags for Plex collections. Discovered that no built-in Plex agent actually reads these tags. Pivoted to direct Plex API calls. The NFO code is commented out (not deleted) in case Plex ships their NFO agent.

## Last Thing We Did

Replaced NFO-based collection tagging with Plex API integration (`src/plex.ts`). This was commit `7784e29`. The new flow:

- After download: trigger partial Plex scan → poll until indexed → tag with collection via API
- On startup: `backfillPlexCollections()` tags any existing videos not yet in a collection
- Requires `PLEX_TOKEN` env var (token: `PV5_sGVq26H77qGRmAso`)
- Gracefully skips if no token is set

## What Has NOT Been Deployed Yet

The Mac Mini is running an older build. Everything from **"Add yt-dlp full backfill on channel add"** (`429a824`) onward has NOT been deployed. That includes:

- Full backfill on channel add (the big one — will discover all historical videos for existing channels)
- Per-channel/per-video quality settings
- README update about Plex library type (Movies, not Home Videos)
- The entire Plex API integration (replacing NFO files)

### To deploy all pending changes on the Mac Mini:

```bash
cd ~/tilda-tube
git pull origin claude/youtube-kids-media-server-ejuuT

# Update the launchd plist with your Plex token
nano ~/Library/LaunchAgents/com.tildatube.plist
# → Replace YOUR_PLEX_TOKEN_HERE with: PV5_sGVq26H77qGRmAso

# Reload the service
launchctl unload ~/Library/LaunchAgents/com.tildatube.plist
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
```

No `npm run build` needed — `dist/` is committed and up to date.

**Heads up:** On first startup after deploy, the server will:
1. Run `backfillPlexCollections()` to tag all existing downloaded videos with Plex collections
2. Run the initial sync, which now includes full backfill for any channels added since the last deploy
3. The backfill + Plex tagging will take a while if there are many videos — check logs at `/Volumes/TildaTube/logs/tildatube.out`

## Known Gotchas / Context for Next Agent

- **Plex library must be type "Movies"** (not "Home Videos") for the API collection tagging to work. The README documents this.
- **DRY_RUN=true** skips all yt-dlp calls — use it for UI/API dev without downloading anything.
- **NFO code lives in `nfo.ts`** — fully functional but commented out everywhere it's called. Don't delete it; Plex may ship NFO agent support.
- **The `dist/` folder is committed** — this is intentional so the Mac Mini doesn't need Node dev tooling. Always rebuild before committing if you change source.
- **Database migrations are idempotent** — new columns use `ALTER TABLE` with `PRAGMA table_info` checks, safe to re-run.
- **Single videos** (added via URL in the Queue tab) have `channel_id: null` and skip duration filtering.
