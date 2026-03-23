import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { getDb, getDownloadedVideosWithChannel } from './db.js';
import { router } from './api.js';
import { pollChannels } from './poller.js';
import { downloadAllApproved } from './downloader.js';
import { backfillNfoFiles } from './nfo.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);
// Initialize database
getDb();
console.log('[Server] Database initialized');
const app = express();
app.use(express.json());
// API routes
app.use(router);
// Serve React UI
const uiPath = path.join(__dirname, 'ui');
app.use(express.static(uiPath));
app.get('*', (_req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
});
// Start Express
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
});
// Daily sync job at 2:00am: poll RSS feeds then download all approved videos
async function dailySyncJob() {
    console.log(`[Cron] Starting daily sync at ${new Date().toISOString()}`);
    await pollChannels();
    console.log('[Cron] Polling complete, starting downloads...');
    await downloadAllApproved();
    console.log(`[Cron] Daily sync complete at ${new Date().toISOString()}`);
}
cron.schedule('0 2 * * *', () => {
    dailySyncJob().catch((err) => console.error('[Cron] Daily sync error:', err));
});
// Backfill NFO files for any previously downloaded videos
console.log('[Server] Checking for missing NFO files...');
backfillNfoFiles(getDownloadedVideosWithChannel());
// Run initial sync on startup
console.log('[Server] Running initial sync...');
dailySyncJob().catch((err) => console.error('[Server] Initial sync error:', err));
console.log('[Server] TildaTube is running (daily sync at 2:00am)');
//# sourceMappingURL=server.js.map