# TildaTube

A self-hosted YouTube media server for kids. Parents curate a safe, ad-free library of YouTube content that's served through Plex on Apple TV — no YouTube UI, no ads, no algorithmic suggestions.

## How It Works

1. **Parent adds YouTube channels** (or individual videos) via a web UI
2. **Daily sync job polls RSS feeds** at 2:00am for new uploads
3. **New videos land in an approval queue** (or auto-download if enabled)
4. **Approved videos are downloaded** via `yt-dlp` to a local drive
5. **Plex serves the library** to Apple TV — child sees only curated content

---

## Prerequisites

This runs on a **Mac Mini (Intel)** with an external drive mounted at `/Volumes/TildaTube`.

### Install dependencies via Homebrew

```bash
brew install node yt-dlp deno ffmpeg
```

> **Why Deno?** As of 2026, `yt-dlp` requires a JavaScript runtime for YouTube downloads. Deno is the recommended runtime. Without it, downloads will fail.

Verify installations:

```bash
node --version    # v20+
yt-dlp --version  # 2024.x+
deno --version    # 2.x+
ffmpeg -version   # 6.x+
```

### Prepare the external drive

Create the required directories:

```bash
mkdir -p /Volumes/TildaTube/media
mkdir -p /Volumes/TildaTube/logs
```

---

## Install Plex Media Server

1. Download from [plex.tv/media-server-downloads](https://www.plex.tv/media-server-downloads/)
2. Install the macOS `.dmg` and sign in (free account is fine)
3. Open Plex Web UI at `http://localhost:32400/web`

### Configure a Movies library

> **Important:** The library type must be **Movies**, not "Home Videos" or "Other Videos". Only the Movies type reads NFO sidecar files, which is how TildaTube groups videos into channel collections.

1. In Plex, click **+** next to "Libraries" in the sidebar
2. Choose **Movies** as the library type
3. Name it something like "Tilda's Videos"
4. Click **Browse for media folder** and select `/Volumes/TildaTube/media`
5. Click **Advanced** and set these options:
   - **Agent**: Personal Media (not Plex Movie — that would try to match YouTube videos against movie databases)
   - **Enable cinema trailers**: Off (these are real movie trailers, not useful here)
   - **Use original titles**: Off (default)
   - **Prefer artwork based on library language**: On (default)
   - **Use local assets**: On (default — this is what reads our NFO files and embedded thumbnails)
   - **Allow matching to explicit content**: Off (default — keep off for a kids library)
   - **Enable video preview thumbnails**: Off (CPU-intensive hover-to-scrub previews; our actual thumbnail images still show up regardless)
   - **Collections**: Show collections and their items (default — shows both channel groups and individual videos)
6. Click **Add Library**

Each YouTube channel appears as a Plex collection (via the `<set>` tag in NFO files). Short videos get their own "Shorts - ChannelName" collections. On Apple TV, your child opens the Plex app and sees channel collections with downloaded videos inside.

---

## Setup TildaTube

### Clone and install

```bash
# On the Mac Mini
git clone https://github.com/BMCwebdev/tilda-tube.git
cd tilda-tube
npm install --production
```

> The `dist/` folder is pre-built and committed to the repo, so no build step is needed on the Mac Mini.

### Configure the launchd service

Edit `com.tildatube.plist` — you need to change **three things**:

1. Replace `/Users/USERNAME/` with your actual macOS username (appears 2 times)
2. Verify the node path — run `which node` and update if different from `/usr/local/bin/node`
3. Set `PLEX_TOKEN` to your Plex authentication token (see below)

#### Finding your Plex token

1. Open Plex Web UI (`http://localhost:32400/web`)
2. Navigate to any media item and click **Get Info**
3. Click **View XML** (the `</>` icon)
4. In the URL bar, find the `X-Plex-Token=XXXXX` parameter — that's your token

Replace `YOUR_PLEX_TOKEN_HERE` in the plist with this value. The token is used to tag videos with channel-name collections via the Plex API after download.

If running manually instead of via launchd, set the env var:

```bash
PLEX_TOKEN=your_token_here node dist/server.js
```

Then install the service:

```bash
cp com.tildatube.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
```

Verify it's running:

```bash
launchctl list | grep tildatube
```

The web UI is now available at **http://brians-mac-mini.local:3001** from any device on your home network.

### Energy Saver settings

To keep the Mac Mini running 24/7:

1. Open **System Preferences → Energy Saver** (or Battery → Power Adapter on newer macOS)
2. Set **Computer sleep** to **Never**
3. Check **Wake for network access**
4. Check **Start up automatically after a power failure**

---

## Daily Use

### Adding a channel

1. Open `http://brians-mac-mini.local:3001` on your iPhone
2. Go to **Channels** → **Add Channel**
3. Paste a YouTube channel URL (e.g., `https://youtube.com/@SesameStreet`)
4. Set the **from date** — only videos published after this date will be considered
   - Default is today (only future uploads)
   - Set an earlier date to backfill existing videos
5. Set **Min length** — videos shorter than this go into a "Shorts" collection instead of the main library (default: 2 minutes, or "No filter" to treat all videos the same)
6. Toggle **Auto-approve** if you trust all content from this channel
7. Click **Add Channel**

### Approving videos

1. Go to the **Queue** tab
2. Each pending video shows a thumbnail, title, channel, and publish date
3. Click **Approve** to download or **Reject** to skip
4. Approved videos begin downloading within 30 seconds

### Adding a single video

On the **Queue** tab, paste a YouTube URL into the input bar at the top and click **Add Video**. The video appears in the queue for approval.

### Shorts collection

When a channel has a minimum length set (default 2 minutes), videos shorter than that threshold are still downloaded — they just go into a separate **Shorts** folder:

```
/Volumes/TildaTube/media/
  Sesame Street/           ← full episodes
  Shorts/
    Sesame Street/         ← clips & shorts
```

In Plex, shorts appear in their own "Shorts - ChannelName" collection, keeping the main library uncluttered while still making short clips available.

### What the child sees

Open the **Plex** app on Apple TV. Videos are organized by channel name in the Home Videos library. Shorts are separated into their own collections. No ads, no suggestions, no YouTube UI.

---

## Updating

When new code is pushed to GitHub:

### If running as a launchd service

```bash
cd ~/tilda-tube
git pull
npm install --production
launchctl unload ~/Library/LaunchAgents/com.tildatube.plist
launchctl load ~/Library/LaunchAgents/com.tildatube.plist
```

### If running manually in a terminal

```bash
cd ~/tilda-tube
git pull
npm install --production
npm run build
node dist/server.js
```

> `npm run build` compiles TypeScript to `dist/`. The `dist/` folder is also committed to the repo, so on the Mac Mini you can skip the build if you haven't made local changes — `git pull` will bring in the pre-built files.

---

## Development

For local development on your laptop (Apple Silicon Mac):

```bash
npm install

# Start with DRY_RUN to skip yt-dlp calls
DB_DIR=./data DRY_RUN=true npx tsx src/server.ts
```

`DRY_RUN=true` skips all yt-dlp invocations — channel resolution returns placeholder IDs and video downloads are simulated. This lets you test the full UI and API flow without yt-dlp, Deno, or ffmpeg installed.

> **Do not set `DRY_RUN=true` on the Mac Mini** — it's for local development only.

---

## Troubleshooting

### Check service status

```bash
launchctl list | grep tildatube
```

### View logs

```bash
tail -f /Volumes/TildaTube/logs/tildatube.out
tail -f /Volumes/TildaTube/logs/tildatube.err
```

### Test yt-dlp manually

```bash
yt-dlp --print title --no-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

If this fails, check that Deno is installed (`deno --version`) and on the PATH.

### Common issues

- **"yt-dlp: error: unable to extract..."** — Deno may not be installed. Run `brew install deno`.
- **Downloads fail silently** — Check `/Volumes/TildaTube/logs/tildatube.err` for yt-dlp stderr output.
- **External drive not mounted** — Ensure `/Volumes/TildaTube` is mounted. The service will fail to start if the DB path is unavailable.
- **Port conflict** — TildaTube runs on port 3001. Plex uses 32400. They should not conflict.

### Path differences (Intel vs Apple Silicon)

| | Mac Mini (Intel) | Laptop (Apple Silicon) |
|---|---|---|
| Homebrew prefix | `/usr/local` | `/opt/homebrew` |
| node, yt-dlp, etc. | `/usr/local/bin/` | `/opt/homebrew/bin/` |

The `com.tildatube.plist` uses `/usr/local/bin` paths because it only runs on the Intel Mac Mini. Do not change these to `/opt/homebrew` paths.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/channels` | List all channels with video counts |
| `POST` | `/api/channels` | Add a channel `{ url, fromDate, autoApprove, minDuration }` |
| `DELETE` | `/api/channels/:id` | Remove a channel |
| `GET` | `/api/queue` | List pending videos |
| `POST` | `/api/videos/:id/approve` | Approve a pending video |
| `POST` | `/api/videos/:id/reject` | Reject a pending video |
| `GET` | `/api/videos` | List all videos |
| `POST` | `/api/videos` | Add a single video `{ url }` |
| `GET` | `/api/status` | Server health and queue depth |
