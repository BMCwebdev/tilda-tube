# TildaTube

A self-hosted YouTube media server for kids. Parents curate a safe, ad-free library of YouTube content (plus their own video files) that's served to Apple TV via Infuse over SMB — no YouTube UI, no ads, no algorithmic suggestions.

## How it works

1. **Parent adds YouTube channels** (or single videos, or their own files) from a phone
2. **A daily job polls each channel's RSS feed** at 2:00 am for new uploads
3. **New videos land in an approval queue**, or download automatically if the channel is set to auto-download
4. **Approved videos are downloaded** with `yt-dlp` to an external drive
5. **Infuse on the Apple TV browses the drive** over SMB; the child sees only curated folders

---

## Prerequisites

Runs on a **Mac mini (Intel, macOS Catalina)** with an external drive mounted at `/Volumes/TildaTube`.

```bash
brew install node yt-dlp ffmpeg
curl -fsSL https://deno.land/install.sh | sh     # Deno; Homebrew's build needs a newer macOS
ln -sf ~/.deno/bin/deno /usr/local/bin/deno       # so yt-dlp can find it
```

> **Why Deno?** yt-dlp needs a JavaScript runtime to download from YouTube. Without one on the PATH, downloads fail with `HTTP Error 403`.

Verify:

```bash
node --version    # v18+
yt-dlp --version  # keep this current: yt-dlp -U
deno --version    # 2.x
ffmpeg -version
mkdir -p /Volumes/TildaTube/media
```

## File sharing for Infuse

1. System Preferences → Sharing → **File Sharing** on
2. Add `/Volumes/TildaTube/media` as a shared folder; Options… → **Share files and folders using SMB**, tick your account
3. On the Apple TV, install **Infuse** and add `smb://brians-mac-mini.local/media`

Infuse shows each channel as a folder, with short clips under `Shorts/`. Channel folders get a `folder.jpg` thumbnail automatically.

---

## Install TildaTube

```bash
git clone https://github.com/BMCwebdev/tilda-tube.git ~/tilda-tube
cd ~/tilda-tube
npm install --production        # dist/ is pre-built and committed; no build step here
sed "s/USERNAME/$USER/g" com.tildatube.plist > ~/Library/LaunchAgents/com.tildatube.plist
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
launchctl list | grep tildatube   # a PID and status 0 means it's running
```

If `which node` is not `/usr/local/bin/node`, edit that path in the plist before loading it.

The web UI is at **http://brians-mac-mini.local:3001** from any device on your home network.

Keep the mini awake: System Preferences → Energy Saver → sleep **Never**, **Wake for network access**, **Start up automatically after a power failure**.

---

## Daily use

### Channels tab

- **Add channel**: paste any link to the channel, choose how far back to go, whether short clips
  go to the Shorts folder, the quality, and whether new videos download automatically or wait
  for approval. TildaTube then finds every video back to that date (75 per pass) in the background.
- **Videos**: expand a channel to see everything it has, filter by downloaded/waiting/failed, and act on each one.
- **Find videos**: ask YouTube again for videos back to the start date (use after moving the date earlier).
- **Settings**: change the start date, shorts threshold, quality, or auto-download.
- **Remove**: stops following the channel. You are asked whether to delete its files too.

### Queue tab

- Videos from channels set to manual approval wait here with a thumbnail. Approve or reject
  one at a time, or tick several and use the bulk buttons.
- **Add a single video**: paste a video link at the top. Links copied from a browser with
  `&list=` or `&t=` in them are fine. Approve it once it appears.

### Library tab

- **Downloaded / Failed / Rejected / Everything** filters, title search, channel picker.
- **Failed** videos show the reason; **Retry** one or **Retry all**. **Remove** drops one you don't want.
- **Delete file** removes a downloaded video from the drive. It stays listed as "Removed" so it won't be downloaded again; **Download again** brings it back.
- **Import a file**: upload a video from your phone or computer into any folder (or a new one).
  It gets a thumbnail and appears in Infuse like everything else.

### What the child sees

Infuse on the Apple TV: one folder per channel, plus `Shorts/` and any folders you import into. Nothing else.

---

## Updating

```bash
cd ~/tilda-tube && git pull && npm install --production
launchctl unload ~/Library/LaunchAgents/com.tildatube.plist
sed "s/USERNAME/$USER/g" com.tildatube.plist > ~/Library/LaunchAgents/com.tildatube.plist
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
```

---

## Development

On a laptop, with no yt-dlp or ffmpeg needed:

```bash
npm install
DB_DIR=./data MEDIA_DIR=./data/media DRY_RUN=true npm run dev
```

`DRY_RUN=true` skips every yt-dlp/ffmpeg call. Never set it on the mini.

Before committing source changes, run `npm run build`; `dist/` is tracked so the mini doesn't need dev tooling.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `launchctl list` shows `78` and no PID | launchd failed before node started. The plist's log paths must be on the boot disk (`~/Library/Logs/`), not the external drive. |
| Downloads fail with `HTTP Error 403` or "No supported JavaScript runtime" | Deno is not on the PATH yt-dlp sees. `ln -sf ~/.deno/bin/deno /usr/local/bin/deno`. |
| Downloads fail with other YouTube errors | `yt-dlp -U`. YouTube changes often; a yt-dlp older than ~90 days breaks. |
| Video stuck at "Downloading" after a restart | It is reset to Failed on startup; press Retry. |
| "Can't reach the server" in the UI | `launchctl list \| grep tildatube`, then `tail ~/Library/Logs/tildatube.err`. |
| External drive not mounted | The server refuses to start rather than create an empty database on the boot disk. Mount the drive; launchd restarts it. |

Logs: `~/Library/Logs/tildatube.out` and `tildatube.err`.

Test yt-dlp by hand:

```bash
yt-dlp --no-warnings --print title --no-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/status` | Counts, current download, background jobs |
| GET | `/api/channels` | Channels with video/pending/done/error counts |
| POST | `/api/channels` | `{ url, fromDate, autoApprove, minDuration, maxQuality }` |
| PATCH | `/api/channels/:id` | Any of `fromDate, autoApprove, minDuration, maxQuality` |
| GET | `/api/channels/:id/videos` | That channel's videos |
| POST | `/api/channels/:id/backfill` | Find videos back to `fromDate` (background) |
| DELETE | `/api/channels/:id?deleteFiles=true` | Remove channel and its rows; optionally its files |
| GET | `/api/queue` | Pending videos |
| GET | `/api/videos` | All videos |
| POST | `/api/videos` | `{ url, maxQuality }` add a single video (pending) |
| POST | `/api/videos/:id/approve` | pending/rejected → approved |
| POST | `/api/videos/:id/reject` | pending/approved/error → rejected |
| POST | `/api/videos/:id/retry` | error/rejected/deleted → approved |
| POST | `/api/videos/bulk` | `{ ids, action: approve\|reject\|retry\|delete, deleteFiles? }` |
| DELETE | `/api/videos/:id?deleteFile=true` | Mark removed; optionally delete the file |
| GET | `/api/folders` | Library folder names for import |
| POST | `/api/import?folder=&filename=&title=&date=` | Raw file body → imported into the library |

Errors are always JSON: `{ "error": "message" }` with a 4xx/5xx status.

There is no authentication. Keep the UI on your home network.
