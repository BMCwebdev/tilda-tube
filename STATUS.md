# TildaTube - Setup Status Report

**Date:** 2026-03-23
**Session:** Initial setup on Mac Mini (Intel)

---

## Completed

- [x] External HDD formatted as **exFAT**, named **TildaTube**, mounted at `/Volumes/TildaTube/`
- [x] Created `/Volumes/TildaTube/media/` and `/Volumes/TildaTube/logs/` directories
- [x] All code references updated from `TubeSafe` → `TildaTube` (db path, media path, plist logs, README)
- [x] Database file renamed from `tubesafe.db` → `tildatube.db`
- [x] `dist/` committed to repo so Mac Mini doesn't need to build (esbuild/Vite 6 incompatible with older macOS)
- [x] `npm install --production` works on Mac Mini (skips vite, esbuild, typescript)
- [x] `com.tildatube.plist` edited with username `brianandalisonmccarthy` and node path `/usr/local/bin/node`
- [x] Server runs successfully via `node ~/tilda-tube/dist/server.js`
- [x] Web UI accessible at `http://localhost:3001` on Mac Mini
- [x] Web UI accessible at `http://192.168.0.76:3001` from iPhone and MacBook
- [x] Prerequisites verified: Node v18.20.5, yt-dlp 2026.03.17, Deno 2.7.7, ffmpeg 8.1
- [x] Fixed shell syntax error in downloader (`downloadVideo` was using `&&` outside shell context)
- [x] YouTube channels added via web UI — RSS polling working for most channels
- [x] Plex Media Server installed on Mac Mini and configured with library pointed at `/Volumes/TildaTube/media`
- [x] Plex app installed on Apple TV

## Issues Encountered

### 1. esbuild/Vite incompatible with Mac Mini's macOS
- **Error:** `dyld: Symbol not found: _SecTrustCopyCertificateChain` — esbuild binary requires macOS 12 (Monterey)+
- **Fix:** Committed `dist/` to the repo and use `npm install --production` on the Mac Mini to skip dev dependencies entirely

### 2. launchd service fails with exit code 78
- **Symptom:** `launchctl list | grep tildatube` shows exit code `78`, no log files created
- **Likely cause:** The logs directory didn't exist when the service first tried to start, and launchd may have cached the failure
- **Status:** UNRESOLVED — server works when run manually, but not via launchd

### 3. Transient 404 on one YouTube channel feed
- **Symptom:** One channel's RSS feed returned HTTP 404 during polling
- **Likely cause:** YouTube intermittent issue — the channel exists and works in browser
- **Status:** Monitoring — will likely resolve on its own on the next poll cycle

### 4. IP address may not be stable
- **Current IP:** `192.168.0.76`
- **Risk:** Router could reassign a different IP after reboot
- **Recommendation:** Set a DHCP reservation in the router for the Mac Mini's MAC address, or use `brians-mac-mini.local` (Bonjour)

---

## Next Iteration

### Fix launchd service (priority)
- Unload/reload the plist now that the logs directory exists
- If exit code 78 persists, check:
  - Does the plist have correct file permissions?
  - Is the working directory path correct?
  - Try adding `/opt/homebrew/bin` or Deno's path to the PATH in the plist (yt-dlp needs Deno at runtime)
- Verify the service survives a reboot

### Firewall check
- Confirm macOS firewall allows incoming connections to `node` on port 3001
- Test `brians-mac-mini.local:3001` from iPhone/MacBook as an alternative to the IP

### Static IP / DNS
- Set DHCP reservation in router for `192.168.0.76`
- Or confirm `brians-mac-mini.local` works reliably across devices

### ~~Install and configure Plex~~ ✓ DONE
- ~~Download Plex Media Server from plex.tv~~
- ~~Create a library pointed at `/Volumes/TildaTube/media`~~
- ~~Install Plex app on Apple TV~~
- Verify channel folders appear correctly in Plex after first downloads

### Energy Saver settings
- Set computer sleep to **Never**
- Enable **Wake for network access**
- Enable **Start up automatically after a power failure**

### Test the full flow end-to-end
- Add a YouTube channel via the web UI
- Verify RSS polling picks up videos
- Approve a video and confirm it downloads to `/Volumes/TildaTube/media/`
- Confirm the video appears in Plex on Apple TV

---

## Plex Performance Issue (2026-03-23)

### Problem
Plex on Apple TV shows "server is not powerful enough to convert the video" warnings. Videos pause/buffer during playback.

### Root Cause
The 2012 Mac Mini (3rd-gen Intel Ivy Bridge) has no hardware transcoding support. When yt-dlp downloads VP9/WebM video (YouTube's default), Apple TV can't play it natively, so Plex tries to transcode on the CPU — and that old CPU can't keep up.

### Solution: Switch from Plex to Infuse
Rather than fix Plex transcoding, we're evaluating **Infuse** (Apple TV App Store) as the playback app:

- **Infuse plays everything natively** on the Apple TV — VP9, H.264, HEVC, MKV. No server-side transcoding needed. The Mac Mini just serves raw files over SMB.
- **Folder-based browsing** — our existing `media/ChannelName/` directory structure shows up as browsable channel folders. This is the UI we actually wanted (pick a channel → see its videos).
- **NFO file support** — Infuse reads Kodi-compatible NFO files, which our `nfo.ts` already generates (currently disabled). Can re-enable for richer metadata.
- **No sideloading** — unlike Kodi, Infuse is in the App Store. No developer account or weekly re-uploads needed.
- **Free tier** is sufficient. Pro is ~$10/year or $95 lifetime.

### What about Plex?
Plex can stay installed for now. If Infuse works well, we can remove `plex.ts` and the `PLEX_TOKEN` dependency to simplify the codebase. No rush to decide.

### What about the H.264 format fix?
The yt-dlp format string could be changed to prefer H.264+AAC (Apple TV native codecs), which would fix Plex transcoding too. This is still a good idea as cheap insurance, but **not urgent** since Infuse plays VP9 fine. Can do later.

### What about re-downloading existing videos?
~35 videos currently downloaded, likely in VP9. **No re-download needed** — Infuse plays them as-is. If we ever switch back to Plex or another player that needs H.264, we can add a re-download feature (reset `done` → `approved` in the DB, downloader picks them up automatically).

### Hardware upgrade?
A Raspberry Pi 5 (~$120-150 total) is faster than the 2012 Mac Mini, but **not needed if we use Infuse**. The Mac Mini only needs to serve files over SMB, which any machine can do. Revisit only if the Mac Mini dies.

---

## Questions To Answer After Infuse Setup

- [ ] Does Infuse's folder browsing give a good enough "channel picker" experience?
- [ ] Do we want to re-enable NFO file generation for richer metadata in Infuse?
- [ ] Does `brians-mac-mini.local` work for SMB from Apple TV (vs hardcoded IP)?
- [ ] Should we remove Plex entirely and simplify the codebase?
- [ ] Is the Shorts subfolder structure (`media/Shorts/ChannelName/`) intuitive in Infuse, or should we flatten it?
- [ ] Do we want the H.264 format preference as insurance for non-Infuse players?
