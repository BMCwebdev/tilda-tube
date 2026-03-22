import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { getDb } from './db.js';
import { router } from './api.js';
import { pollChannels } from './poller.js';
import { startDownloader } from './downloader.js';

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

// Start RSS poller (every 15 minutes)
cron.schedule('*/15 * * * *', () => {
  console.log(`[Cron] Running poll at ${new Date().toISOString()}`);
  pollChannels().catch((err) => console.error('[Cron] Poll error:', err));
});

// Run initial poll on startup
console.log('[Server] Running initial poll...');
pollChannels().catch((err) => console.error('[Server] Initial poll error:', err));

// Start downloader watcher
startDownloader();

console.log('[Server] TildaTube is running');
