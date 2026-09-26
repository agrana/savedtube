import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { flattenPathVideos, findVideoInRevision } from './path-edits';
import { loadOwnedPathDetail } from './path-research-service';
import { loadOwnedPathProgress } from './path-progress';
import type { PathWatchContext } from './path-links';

export type { PathWatchContext } from './path-links';

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

/**
 * Validate ownership + active-revision membership for watch navigation.
 * Returns 404 for foreign pathVideoId or youtube mismatch (no existence leak across owners).
 */
export async function loadOwnedPathWatchContext(
  db: DbClient,
  ownerId: string,
  pathId: string,
  pathVideoId: string,
  routeVideoId: string
): Promise<
  | { ok: true; context: PathWatchContext }
  | { ok: false; status: 404 | 500; error: string }
> {
  const detail = await loadOwnedPathDetail(db, ownerId, pathId);
  if (!detail.ok) {
    return detail;
  }

  const membership = findVideoInRevision(detail.stages, pathVideoId);
  if (!membership) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const video = membership.stage.videos[membership.videoIndex];
  if (video.youtube_video_id !== routeVideoId) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const progress = await loadOwnedPathProgress(db, ownerId, pathId);
  if (!progress.ok) {
    return progress;
  }

  const flat = flattenPathVideos(detail.stages);
  const index = flat.findIndex((item) => item.pathVideoId === pathVideoId);
  if (index < 0) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const practiced = progress.summary.practicedVideoIds.includes(pathVideoId);
  const previousItem = index > 0 ? flat[index - 1] : null;
  const nextItem = index < flat.length - 1 ? flat[index + 1] : null;

  return {
    ok: true,
    context: {
      pathId,
      pathTitle: detail.path.title,
      pathVideoId,
      youtubeVideoId: video.youtube_video_id,
      title: video.title,
      channelTitle: video.channel_title,
      stageId: membership.stage.id,
      stageTitle: membership.stage.title,
      practiced,
      position: index,
      total: flat.length,
      previous: previousItem
        ? {
            pathVideoId: previousItem.pathVideoId,
            youtubeVideoId: previousItem.youtubeVideoId,
          }
        : null,
      next: nextItem
        ? {
            pathVideoId: nextItem.pathVideoId,
            youtubeVideoId: nextItem.youtubeVideoId,
          }
        : null,
      returnHref: `/paths/${pathId}`,
    },
  };
}
