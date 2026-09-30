# TildaTube - Status

## 2026-09-29 — Folders group like channels; add a video to a channel

- [x] Library groups videos with no channel row by their folder on the drive (Good Witch,
      Star Trek TNG, and a hand-added PHianonize video now each show as one group).
- [x] "Add a single video" can file the video under an existing channel (settings and
      auto-approve apply); rejected with a clear message if the video is from another channel.
- [x] New import folders get a `folder.jpg` from the first video's thumbnail.
- [x] Built, DRY_RUN smoke-tested, run against a production DB dump, screenshots checked.
- [ ] Deploy (with the 2026-09-18 follow-up, still pending).
- [ ] On the mini: `folder.jpg` for the two existing import folders; remove the duplicate
      Good Witch S02 E02 (uploaded 2026-09-18 and again 2026-09-21, identical size).

## 2026-09-18 — Deployed the repair; small follow-up built

- [x] `f5f28c1` deployed by Brian; `launchctl list` shows a PID and exit 0; first retried
      video downloaded end to end in 40 s and was filed under Shorts correctly.
- [x] Observed: YouTube RSS feeds 404 for 10 of 12 channels from two networks; one bare 403
      that succeeded on retry. Built: RSS → yt-dlp fallback in the poll; weekly `yt-dlp -U`.
- [x] Researched remote access: Tailscale does not support Catalina (last build 1.70). Plan is
      the Apple TV as a Tailscale subnet router; see the private ops runbook.
- [ ] Deploy the follow-up (pending commit).
- [ ] Login PIN, then Tailscale via Apple TV, then the visual video picker.

## 2026-09-17 — Audit and repair (laptop-side; deploy pending)

**Found (on the mini):**
- Service running only because it was started by hand in a terminal; the launchd job had
  exited 78 every 10 s for 95 days without ever writing a log.
- All full-length downloads since August failing with `HTTP Error 403` because yt-dlp could
  not find Deno (`~/.deno/bin` was not on any PATH the app used). 61 errors, 2 rows stuck at
  "downloading" since June, 5 `.part` files, 44 `.nfo` leftovers from Plex.
- 771 of 1149 rows had `published_at = "NA"` (old backfill parser).
- Remove channel never worked (foreign key), single-video add mangled URLs containing `&`,
  and the API ran user URLs through a shell.

**Done (code, built, smoke-tested against a copy of the production DB):**
- [x] Deno on the child-process PATH and in the plist
- [x] plist logs moved to `~/Library/Logs/` (likely exit-78 fix)
- [x] `shell: true` removed; URL + input validation; JSON errors everywhere
- [x] Channel removal works, with optional file deletion
- [x] Retry / Remove / Delete file / Download again per video; bulk actions; "Retry all"
- [x] "Find videos" (backfill) button in the UI
- [x] Import your own video files (streamed upload, ffmpeg thumbnail)
- [x] Downloads staged in `.incoming/` and moved when complete; one yt-dlp call per video instead of two
- [x] Stuck downloads reset on startup; 10-minute download sweep
- [x] "NA" dates repaired from file names on first start
- [x] UI: shared components, per-channel video lists, search/filters, status bar with current download

**Not done / next:**
- [x] Deployed 2026-09-18; exit 78 gone with the log-path change
- [ ] Remote viewing via Tailscale; a login PIN for the web UI before that
- [ ] Visual video picker with thumbnails + date range
- [ ] Design pass
- [ ] Turn off SMB guest access

---

## 2026-03-23 — Initial setup on Mac Mini (Intel)

- [x] External HDD formatted as exFAT, named TildaTube, mounted at `/Volumes/TildaTube/`
- [x] `/Volumes/TildaTube/media/` and `/Volumes/TildaTube/logs/` created
- [x] Renamed TubeSafe → TildaTube throughout
- [x] `dist/` committed so the mini needs no build (esbuild/Vite need macOS 12+)
- [x] `npm install --production` works on the mini
- [x] Server runs manually; web UI reachable from iPhone and MacBook on the LAN
- [x] Prerequisites: Node v18.20.5, yt-dlp, Deno 2.7.7 (via installer, in `~/.deno/bin`), ffmpeg
- [x] SMB file sharing on; Infuse on the Apple TV browsing `media/`
- [x] Plex removed in favour of Infuse (the 2012 mini cannot transcode)

Issues from that session and their outcome:
1. esbuild incompatible with the mini's macOS → solved by committing `dist/`.
2. launchd exit 78 → diagnosed 2026-09-17 (log path on the external drive); fix in this change set.
3. Transient 404 on one RSS feed → resolved itself.
4. IP not stable → use `brians-mac-mini.local`; a DHCP reservation is still a good idea.

Energy Saver on the mini is correct: sleep never, wake for network, restart after power failure.
