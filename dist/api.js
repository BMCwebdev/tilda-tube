import { Router } from 'express';
import { execFile } from 'child_process';
import { childEnv, YT_DLP } from './env.js';
import { getAllChannels, addChannel, deleteChannel, updateChannel, getChannelById, getPendingVideos, getAllVideos, getVideoById, updateVideoStatus, insertVideo, getServerStatus, } from './db.js';
import { downloadAllApproved, fetchChannelAvatar } from './downloader.js';
import { backfillChannel } from './poller.js';
export const router = Router();
// --- Channels ---
router.get('/api/channels', (_req, res) => {
    const channels = getAllChannels();
    res.json(channels);
});
router.post('/api/channels', async (req, res) => {
    const { url, fromDate, autoApprove, minDuration, maxQuality } = req.body;
    if (!url || !fromDate) {
        res.status(400).json({ error: 'url and fromDate are required' });
        return;
    }
    try {
        // Resolve channel ID and name in a single yt-dlp call
        const { channelId, channelName } = await resolveChannel(url);
        const channel = addChannel({
            name: channelName,
            channel_id: channelId,
            channel_url: url,
            from_date: fromDate,
            auto_approve: !!autoApprove,
            min_duration: minDuration !== undefined ? Number(minDuration) : undefined,
            max_quality: maxQuality !== undefined ? Number(maxQuality) : undefined,
        });
        res.status(201).json(channel);
        // Fetch channel avatar for Infuse folder thumbnail
        fetchChannelAvatar(channelId, channelName).catch((err) => console.error(`[API] Avatar fetch error for ${channelName}:`, err));
        // Run full backfill in the background (gets ALL videos, not just RSS ~15)
        backfillChannel(channel)
            .then(() => downloadAllApproved())
            .catch((err) => console.error(`[API] Backfill error for ${channel.name}:`, err));
    }
    catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(409).json({ error: 'Channel already exists' });
            return;
        }
        console.error('[API] Error adding channel:', err);
        res.status(500).json({ error: err.message || 'Failed to add channel' });
    }
});
router.patch('/api/channels/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid channel ID' });
        return;
    }
    const { fromDate, autoApprove, minDuration, maxQuality } = req.body;
    const updates = {};
    if (fromDate !== undefined)
        updates.from_date = fromDate;
    if (autoApprove !== undefined)
        updates.auto_approve = autoApprove;
    if (minDuration !== undefined)
        updates.min_duration = Number(minDuration);
    if (maxQuality !== undefined)
        updates.max_quality = Number(maxQuality);
    const updated = updateChannel(id, updates);
    if (!updated) {
        res.status(404).json({ error: 'Channel not found' });
        return;
    }
    const channel = getChannelById(id);
    res.json(channel);
});
router.delete('/api/channels/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid channel ID' });
        return;
    }
    const deleted = deleteChannel(id);
    if (!deleted) {
        res.status(404).json({ error: 'Channel not found' });
        return;
    }
    res.json({ success: true });
});
// --- Videos ---
router.get('/api/queue', (_req, res) => {
    const videos = getPendingVideos();
    res.json(videos);
});
router.get('/api/videos', (_req, res) => {
    const videos = getAllVideos();
    res.json(videos);
});
router.post('/api/videos', async (req, res) => {
    const { url, maxQuality } = req.body;
    if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
    }
    try {
        const videoId = await resolveVideoId(url);
        const title = await resolveVideoTitle(url);
        const video = insertVideo({
            channel_id: null,
            youtube_id: videoId,
            title,
            thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            published_at: new Date().toISOString(),
            status: 'pending',
            max_quality: maxQuality !== undefined ? Number(maxQuality) : null,
        });
        if (!video) {
            res.status(409).json({ error: 'Video already exists' });
            return;
        }
        res.status(201).json(video);
    }
    catch (err) {
        console.error('[API] Error adding video:', err);
        res.status(500).json({ error: err.message || 'Failed to add video' });
    }
});
router.post('/api/videos/:id/approve', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid video ID' });
        return;
    }
    const video = getVideoById(id);
    if (!video) {
        res.status(404).json({ error: 'Video not found' });
        return;
    }
    if (video.status !== 'pending') {
        res.status(400).json({ error: `Cannot approve video with status "${video.status}"` });
        return;
    }
    updateVideoStatus(id, 'approved');
    res.json({ success: true, status: 'approved' });
    // Trigger immediate download in the background
    downloadAllApproved().catch((err) => console.error('[API] Background download error:', err));
});
router.post('/api/videos/:id/reject', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid video ID' });
        return;
    }
    const video = getVideoById(id);
    if (!video) {
        res.status(404).json({ error: 'Video not found' });
        return;
    }
    if (video.status !== 'pending') {
        res.status(400).json({ error: `Cannot reject video with status "${video.status}"` });
        return;
    }
    updateVideoStatus(id, 'rejected');
    res.json({ success: true, status: 'rejected' });
});
router.get('/api/status', (_req, res) => {
    const status = getServerStatus();
    res.json(status);
});
// --- Helpers ---
function resolveChannel(url) {
    return new Promise((resolve, reject) => {
        const DRY_RUN = process.env.DRY_RUN === 'true';
        if (DRY_RUN) {
            const idMatch = url.match(/channel\/(UC[\w-]+)/);
            const nameMatch = url.match(/@([\w-]+)/) || url.match(/channel\/([\w-]+)/);
            resolve({
                channelId: idMatch ? idMatch[1] : 'UC_DRYRUN_' + Buffer.from(url).toString('base64').slice(0, 16),
                channelName: nameMatch ? nameMatch[1] : 'Unknown Channel',
            });
            return;
        }
        // Single yt-dlp call: prints channel_id on line 1, channel name on line 2
        console.log(`[API] Resolving channel: ${url}`);
        execFile(YT_DLP, ['--print', 'channel_id', '--print', 'channel', '--playlist-items', '1', '--no-download', url], {
            timeout: 60_000,
            env: childEnv,
            shell: true,
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('[API] yt-dlp channel error:', { message: error.message, stderr, code: error.code, signal: error.signal, killed: error.killed });
                reject(new Error(`Failed to resolve channel: ${stderr || error.message}`));
                return;
            }
            const lines = stdout.trim().split('\n');
            const channelId = lines[0]?.trim();
            const channelName = lines[1]?.trim() || 'Unknown Channel';
            if (!channelId) {
                reject(new Error('Could not resolve channel ID'));
                return;
            }
            console.log(`[API] Resolved: ${channelName} (${channelId})`);
            resolve({ channelId, channelName });
        });
    });
}
function resolveVideoId(url) {
    return new Promise((resolve, reject) => {
        const DRY_RUN = process.env.DRY_RUN === 'true';
        if (DRY_RUN) {
            const match = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/);
            if (match) {
                resolve(match[1]);
                return;
            }
            resolve('DRY' + Math.random().toString(36).slice(2, 10));
            return;
        }
        execFile(YT_DLP, ['--print', 'id', '--no-download', url], {
            timeout: 60_000,
            env: childEnv,
            shell: true,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Failed to resolve video ID: ${stderr || error.message}`));
                return;
            }
            resolve(stdout.trim());
        });
    });
}
function resolveVideoTitle(url) {
    return new Promise((resolve, reject) => {
        const DRY_RUN = process.env.DRY_RUN === 'true';
        if (DRY_RUN) {
            resolve('Dry Run Video');
            return;
        }
        execFile(YT_DLP, ['--print', 'title', '--no-download', url], {
            timeout: 60_000,
            env: childEnv,
            shell: true,
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Failed to resolve video title: ${stderr || error.message}`));
                return;
            }
            resolve(stdout.trim() || 'Untitled');
        });
    });
}
//# sourceMappingURL=api.js.map