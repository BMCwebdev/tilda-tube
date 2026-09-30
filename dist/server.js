import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { getDb, getAllChannels, resetStuckDownloads } from './db.js';
import { router, HttpError } from './api.js';
import { pollChannels } from './poller.js';
import { downloadAllApproved, fetchChannelAvatar, updateYtDlp, logYtDlpVersion } from './downloader.js';
import { MEDIA_DIR } from './env.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);
// --- Database ---
getDb();
const stuck = resetStuckDownloads();
if (stuck > 0)
    console.log(`[Server] ${stuck} interrupted download(s) marked as errors; retry them from the Library tab`);
console.log('[Server] Database ready');
if (!fs.existsSync(MEDIA_DIR)) {
    console.error(`[Server] WARNING: media folder ${MEDIA_DIR} does not exist. Downloads will pause until the drive is mounted.`);
}
// --- HTTP ---
const app = express();
app.use(express.json());
app.use(router);
// Unknown API routes get JSON, not the SPA shell
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
const uiPath = path.join(__dirname, 'ui');
app.use(express.static(uiPath));
app.get('*', (_req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
});
app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({ error: message || 'Internal error' });
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
});
// --- Scheduled work ---
async function dailySyncJob() {
    console.log(`[Cron] Daily sync starting ${new Date().toISOString()}`);
    await pollChannels();
    await downloadAllApproved();
    console.log(`[Cron] Daily sync complete ${new Date().toISOString()}`);
}
cron.schedule('0 2 * * *', () => {
    dailySyncJob().catch((err) => console.error('[Cron] Daily sync error:', err));
});
// Safety net: anything approved that a UI action failed to kick off gets picked up within 10 minutes.
cron.schedule('*/10 * * * *', () => {
    downloadAllApproved().catch((err) => console.error('[Cron] Sweep error:', err));
});
// Keep yt-dlp current: weekly, Monday 01:30, an hour before the daily sync.
cron.schedule('30 1 * * 1', () => {
    updateYtDlp().catch((err) => console.error('[Cron] yt-dlp update error:', err));
});
logYtDlpVersion();
// Backfill folder.jpg avatars for channels that don't have one yet
for (const ch of getAllChannels()) {
    if (!fs.existsSync(path.join(MEDIA_DIR, ch.name, 'folder.jpg'))) {
        fetchChannelAvatar(ch.channel_id, ch.name).catch((err) => console.error(`[Server] Avatar backfill for ${ch.name}:`, err));
    }
}
console.log('[Server] Running initial sync...');
dailySyncJob().catch((err) => console.error('[Server] Initial sync error:', err));
console.log('[Server] TildaTube is running (daily sync 2:00am, download sweep every 10 min, yt-dlp update Mondays 1:30am)');
//# sourceMappingURL=server.js.map