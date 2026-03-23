import { Router, type Request, type Response } from 'express';
import { execFile } from 'child_process';
import { childEnv, YT_DLP } from './env.js';
import {
  getAllChannels,
  addChannel,
  deleteChannel,
  getPendingVideos,
  getAllVideos,
  getVideoById,
  updateVideoStatus,
  insertVideo,
  getServerStatus,
} from './db.js';
import { downloadAllApproved } from './downloader.js';

export const router = Router();

// --- Channels ---

router.get('/api/channels', (_req: Request, res: Response) => {
  const channels = getAllChannels();
  res.json(channels);
});

router.post('/api/channels', async (req: Request, res: Response) => {
  const { url, fromDate, autoApprove } = req.body;

  if (!url || !fromDate) {
    res.status(400).json({ error: 'url and fromDate are required' });
    return;
  }

  try {
    // Resolve channel ID using yt-dlp
    const channelId = await resolveChannelId(url);
    const channelName = await resolveChannelName(url);

    const channel = addChannel({
      name: channelName,
      channel_id: channelId,
      channel_url: url,
      from_date: fromDate,
      auto_approve: !!autoApprove,
    });

    res.status(201).json(channel);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Channel already exists' });
      return;
    }
    console.error('[API] Error adding channel:', err);
    res.status(500).json({ error: err.message || 'Failed to add channel' });
  }
});

router.delete('/api/channels/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
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

router.get('/api/queue', (_req: Request, res: Response) => {
  const videos = getPendingVideos();
  res.json(videos);
});

router.get('/api/videos', (_req: Request, res: Response) => {
  const videos = getAllVideos();
  res.json(videos);
});

router.post('/api/videos', async (req: Request, res: Response) => {
  const { url } = req.body;
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
    });

    if (!video) {
      res.status(409).json({ error: 'Video already exists' });
      return;
    }

    res.status(201).json(video);
  } catch (err: any) {
    console.error('[API] Error adding video:', err);
    res.status(500).json({ error: err.message || 'Failed to add video' });
  }
});

router.post('/api/videos/:id/approve', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
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
  downloadAllApproved().catch((err) =>
    console.error('[API] Background download error:', err)
  );
});

router.post('/api/videos/:id/reject', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
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

router.get('/api/status', (_req: Request, res: Response) => {
  const status = getServerStatus();
  res.json(status);
});

// --- Helpers ---

function resolveChannelId(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const DRY_RUN = process.env.DRY_RUN === 'true';
    if (DRY_RUN) {
      // In dry-run mode, try to extract channel ID from URL or generate a placeholder
      const match = url.match(/channel\/(UC[\w-]+)/);
      if (match) {
        resolve(match[1]);
        return;
      }
      // Generate a deterministic fake ID from the URL
      resolve('UC_DRYRUN_' + Buffer.from(url).toString('base64').slice(0, 16));
      return;
    }

    execFile(YT_DLP, ['--print', 'channel_id', '--playlist-items', '1', '--no-download', url], {
      timeout: 30_000,
      env: childEnv,
      shell: true,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('[API] yt-dlp channel_id error:', { message: error.message, stderr, code: (error as any).code });
        reject(new Error(`Failed to resolve channel ID: ${stderr || error.message}`));
        return;
      }
      const channelId = stdout.trim();
      if (!channelId) {
        reject(new Error('Could not resolve channel ID'));
        return;
      }
      resolve(channelId);
    });
  });
}

function resolveChannelName(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const DRY_RUN = process.env.DRY_RUN === 'true';
    if (DRY_RUN) {
      // Extract a name from the URL for dry-run mode
      const match = url.match(/@([\w-]+)/) || url.match(/channel\/([\w-]+)/);
      resolve(match ? match[1] : 'Unknown Channel');
      return;
    }

    execFile(YT_DLP, ['--print', 'channel', '--playlist-items', '1', '--no-download', url], {
      timeout: 30_000,
      env: childEnv,
      shell: true,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to resolve channel name: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim() || 'Unknown Channel');
    });
  });
}

function resolveVideoId(url: string): Promise<string> {
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
      timeout: 30_000,
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

function resolveVideoTitle(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const DRY_RUN = process.env.DRY_RUN === 'true';
    if (DRY_RUN) {
      resolve('Dry Run Video');
      return;
    }

    execFile(YT_DLP, ['--print', 'title', '--no-download', url], {
      timeout: 30_000,
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
