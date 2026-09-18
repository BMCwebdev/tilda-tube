export type VideoStatus = 'pending' | 'approved' | 'downloading' | 'done' | 'rejected' | 'error' | 'deleted';

export interface Video {
  id: number;
  channel_id: number | null;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string;
  status: VideoStatus;
  max_quality: number | null;
  file_path: string | null;
  error_message: string | null;
  source: 'youtube' | 'local';
  duration: number | null;
  created_at: string;
  updated_at: string;
  channel_name: string | null;
}

export interface Channel {
  id: number;
  name: string;
  channel_id: string;
  channel_url: string;
  from_date: string;
  auto_approve: number;
  min_duration: number;
  max_quality: number;
  video_count: number;
  pending_count: number;
  done_count: number;
  error_count: number;
}

export interface ServerStatus {
  channelCount: number;
  pendingCount: number;
  approvedCount: number;
  downloadingCount: number;
  doneCount: number;
  errorCount: number;
  currentDownload: { id: number; title: string; startedAt: string } | null;
  jobs: { label: string; startedAt: string }[];
  dryRun: boolean;
}
