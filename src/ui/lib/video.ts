import type { Video } from './types';

/**
 * The group a video belongs to in the Library: its channel if it has one,
 * otherwise the folder it lives in on the drive (which is what Infuse shows).
 * Imported files and hand-added videos have no channel row, so the folder is
 * the only thing that ties a set of them together.
 */
export function groupName(video: Video): string {
  if (video.channel_name) return video.channel_name;
  const folder = folderOf(video.file_path);
  if (folder) return folder;
  return video.source === 'local' ? 'Imported files' : 'Single videos';
}

/** Folder name from a library path, e.g. ".../media/Good Witch/x.mkv" -> "Good Witch"; Shorts/<Channel>/ yields the channel. */
export function folderOf(filePath: string | null): string | null {
  if (!filePath) return null;
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2];
  return folder && folder !== 'Shorts' ? folder : null;
}
