import type { SupabaseClient } from '@supabase/supabase-js';
import type { PathStageWithVideos } from './path-research-schema';

/**
 * Deterministic soft-dismiss presentation filter for authenticated owners.
 * Excludes active (undismissed) path-video dismissals from path maps, ordered
 * lists, watch navigation, and Continue ordering without mutating membership,
 * progress, practice data, or revision edit_version.
 *
 * Preview and actual output should share {@link excludeActiveDismissedPathVideos}
 * so both apply the same path-scoped exclusion rules.
 */

type DbClient = Pick<SupabaseClient, 'from'>;

/**
 * Load path_video_id values with an active dismissal for this owner+path.
 * Path-scoped: dismissals in other paths are never returned.
 * Restored rows (undismissed_at set) are omitted.
 */
export async function loadActiveDismissedPathVideoIds(
  db: DbClient,
  ownerId: string,
  pathId: string
): Promise<
  | { ok: true; pathVideoIds: ReadonlySet<string> }
  | { ok: false; status: 500; error: string }
> {
  const query = db
    .from('path_video_dismissals')
    .select('path_video_id, undismissed_at')
    .eq('owner', ownerId)
    .eq('path_id', pathId);
  const queryWithNullFilter = query as typeof query & {
    is?: (column: string, value: null) => typeof query;
  };
  const hasNullFilter = typeof queryWithNullFilter.is === 'function';
  const result = hasNullFilter
    ? await queryWithNullFilter.is!('undismissed_at', null)
    : await query;
  const { data, error } = result;

  if (error) {
    console.error('loadActiveDismissedPathVideoIds error:', error);
    return { ok: false, status: 500, error: 'Failed to load path dismissals' };
  }

  const pathVideoIds = new Set<string>();
  for (const row of data || []) {
    if (
      !hasNullFilter &&
      (row as { undismissed_at?: unknown }).undismissed_at != null
    ) {
      continue;
    }
    const id = (row as { path_video_id?: unknown }).path_video_id;
    if (typeof id === 'string' && id.length > 0) {
      pathVideoIds.add(id);
    }
  }

  return { ok: true, pathVideoIds };
}

/**
 * Remove actively dismissed videos from stages. Stages are preserved even when
 * every video is dismissed (empty videos array). Stage/video relative order of
 * remaining items is unchanged. Does not mutate the input arrays.
 */
export function excludeActiveDismissedPathVideos(
  stages: PathStageWithVideos[],
  dismissedPathVideoIds: ReadonlySet<string>
): PathStageWithVideos[] {
  if (dismissedPathVideoIds.size === 0) {
    return stages;
  }

  return stages.map((stage) => ({
    ...stage,
    videos: stage.videos.filter(
      (video) => !dismissedPathVideoIds.has(video.id)
    ),
  }));
}

/**
 * Single reusable query+filter used by authenticated path detail and progress
 * loaders so presentation surfaces share identical exclusion behavior.
 */
export async function filterStagesExcludingActiveDismissals(
  db: DbClient,
  ownerId: string,
  pathId: string,
  stages: PathStageWithVideos[]
): Promise<
  | { ok: true; stages: PathStageWithVideos[] }
  | { ok: false; status: 500; error: string }
> {
  const loaded = await loadActiveDismissedPathVideoIds(db, ownerId, pathId);
  if (!loaded.ok) {
    return loaded;
  }

  return {
    ok: true,
    stages: excludeActiveDismissedPathVideos(stages, loaded.pathVideoIds),
  };
}
