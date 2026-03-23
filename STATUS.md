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

## Issues Encountered

### 1. esbuild/Vite incompatible with Mac Mini's macOS
- **Error:** `dyld: Symbol not found: _SecTrustCopyCertificateChain` — esbuild binary requires macOS 12 (Monterey)+
- **Fix:** Committed `dist/` to the repo and use `npm install --production` on the Mac Mini to skip dev dependencies entirely

### 2. launchd service fails with exit code 78
- **Symptom:** `launchctl list | grep tildatube` shows exit code `78`, no log files created
- **Likely cause:** The logs directory didn't exist when the service first tried to start, and launchd may have cached the failure
- **Status:** UNRESOLVED — server works when run manually, but not via launchd

### 3. IP address may not be stable
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

### Install and configure Plex
- Download Plex Media Server from plex.tv
- Create a **Home Videos** library pointed at `/Volumes/TildaTube/media`
- Install Plex app on Apple TV
- Verify channel folders appear correctly

### Energy Saver settings
- Set computer sleep to **Never**
- Enable **Wake for network access**
- Enable **Start up automatically after a power failure**

### Test the full flow end-to-end
- Add a YouTube channel via the web UI
- Verify RSS polling picks up videos
- Approve a video and confirm it downloads to `/Volumes/TildaTube/media/`
- Confirm the video appears in Plex on Apple TV
