import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type PathStageWithVideos,
  type PathVideoRecord,
} from './path-research-schema';
import { flattenPathVideos } from './path-edits';
import { getOwnedPath, type PathRecord } from './paths';
import {
  buildFollowUpEvidence,
  FOLLOWUP_REFLECTION_MAX_LENGTH,
  loadOwnedStageFollowUps,
  mapPersistFollowUpRpcPayload,
  resolveFollowUpContent,
  selectCurrentFollowUps,
  type FollowUpLlm,
  type StageFollowUpPublic,
} from './path-followup';
import {
  ensureStageQuizCards,
  selectActiveDueQuizCards,
  toQuizCardQuestionPublic,
  type QuizCardQuestionPublic,
  type QuizCardRecord,
} from './path-quiz';

export const PATH_REFLECTION_MAX_LENGTH = FOLLOWUP_REFLECTION_MAX_LENGTH;
export const FOLLOWUP_PROVIDER_TIMEOUT_MS = 12_000;

const uuidSchema = z.string().uuid('Invalid ID format');

export const markPracticedSchema = z.object({
  action: z.literal('mark_practiced'),
  pathVideoId: uuidSchema,
  practiced: z.boolean(),
});

export const completeStageSchema = z.object({
  action: z.literal('complete_stage'),
  stageId: uuidSchema,
  reflection: z
    .string()
    .trim()
    .max(
      PATH_REFLECTION_MAX_LENGTH,
      `Reflection must be at most ${PATH_REFLECTION_MAX_LENGTH} characters`
    )
    .optional()
    .nullable(),
});

export const pathProgressActionSchema = z.discriminatedUnion('action', [
  markPracticedSchema,
  completeStageSchema,
]);

export type PathProgressAction = z.infer<typeof pathProgressActionSchema>;

export type PathVideoProgressRecord = {
  id: string;
  owner: string;
  path_video_id: string;
  practiced: boolean;
  practiced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PathStageProgressRecord = {
  id: string;
  owner: string;
  path_stage_id: string;
  completed_at: string;
  reflection: string | null;
  completion_version: number;
  created_at: string;
  updated_at: string;
};

export type PathProgressSummary = {
  practicedVideoIds: string[];
  completedStageIds: string[];
  continueTarget: {
    pathVideoId: string;
    youtubeVideoId: string;
    stageId: string;
  } | null;
  practicedCount: number;
  totalVideos: number;
  followUps: StageFollowUpPublic[];
  dueReviews: QuizCardQuestionPublic[];
  activeEditVersion: number | null;
};

function parseWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Validation failed',
    };
  }
  return { success: true, data: result.data };
}

export function parsePathProgressBody(body: unknown) {
  return parseWithSchema(pathProgressActionSchema, body);
}

/**
 * Continue starts at the first unpracticed item in saved path order.
 * Unavailable videos remain in the sequence; practiced flags are explicit only.
 */
export function resolveContinueTarget(
  stages: PathStageWithVideos[],
  practicedVideoIds: ReadonlySet<string>
): {
  pathVideoId: string;
  youtubeVideoId: string;
  stageId: string;
} | null {
  const flat = flattenPathVideos(stages);
  if (flat.length === 0) {
    return null;
  }

  const firstUnpracticed = flat.find(
    (item) => !practicedVideoIds.has(item.pathVideoId)
  );
  const target = firstUnpracticed || flat[0];
  return {
    pathVideoId: target.pathVideoId,
    youtubeVideoId: target.youtubeVideoId,
    stageId: target.stageId,
  };
}

export function buildProgressSummary(
  stages: PathStageWithVideos[],
  videoProgress: PathVideoProgressRecord[],
  stageProgress: PathStageProgressRecord[],
  followUps: StageFollowUpPublic[] = [],
  activeEditVersion: number | null = null,
  dueReviews: QuizCardQuestionPublic[] = []
): PathProgressSummary {
  const practicedVideoIds = videoProgress
    .filter((row) => row.practiced)
    .map((row) => row.path_video_id);
  const practicedSet = new Set(practicedVideoIds);
  const flat = flattenPathVideos(stages);

  return {
    practicedVideoIds,
    completedStageIds: stageProgress.map((row) => row.path_stage_id),
    continueTarget: resolveContinueTarget(stages, practicedSet),
    practicedCount: flat.filter((item) => practicedSet.has(item.pathVideoId))
      .length,
    totalVideos: flat.length,
    followUps,
    dueReviews,
    activeEditVersion,
  };
}

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export type PathProgressMutationResult =
  | {
      ok: true;
      summary: PathProgressSummary;
      followUp?: StageFollowUpPublic | null;
      followUpCreated?: boolean;
    }
  | { ok: false; status: 400 | 404 | 500; error: string };

export type PathProgressCompleteDeps = {
  llm?: FollowUpLlm | null;
  followUpTimeoutMs?: number;
  signal?: AbortSignal;
};

async function loadRevisionMembership(
  db: DbClient,
  pathId: string,
  ownerId: string
): Promise<
  | {
      ok: true;
      path: PathRecord;
      stages: PathStageWithVideos[];
      videoIds: Set<string>;
      stageIds: Set<string>;
      activeRevisionId: string | null;
      activeEditVersion: number | null;
    }
  | { ok: false; status: 404 | 500; error: string }
> {
  const owned = await getOwnedPath(db, ownerId, pathId);
  if (!owned.ok) {
    return {
      ok: false,
      status: owned.status === 404 ? 404 : 500,
      error: owned.error,
    };
  }

  const activeRevisionId = owned.path.active_revision_id ?? null;
  if (!activeRevisionId) {
    return {
      ok: true,
      path: owned.path,
      stages: [],
      videoIds: new Set(),
      stageIds: new Set(),
      activeRevisionId: null,
      activeEditVersion: null,
    };
  }

  const { data: revisionRow, error: revisionError } = await db
    .from('path_revisions')
    .select('id, edit_version, status')
    .eq('id', activeRevisionId)
    .eq('path_id', pathId)
    .maybeSingle();

  if (revisionError) {
    console.error('loadRevisionMembership revision error:', revisionError);
    return { ok: false, status: 500, error: 'Failed to load path revision' };
  }

  const activeEditVersion =
    revisionRow && typeof revisionRow.edit_version === 'number'
      ? revisionRow.edit_version
      : null;

  const { data: stageRows, error: stagesError } = await db
    .from('path_stages')
    .select('*')
    .eq('revision_id', activeRevisionId)
    .order('position', { ascending: true });

  if (stagesError) {
    console.error('loadRevisionMembership stages error:', stagesError);
    return { ok: false, status: 500, error: 'Failed to load path stages' };
  }

  const stages = (stageRows || []) as PathStageWithVideos[];
  const stageIds = new Set(stages.map((stage) => stage.id));
  const stageIdList = [...stageIds];

  let videos: PathVideoRecord[] = [];
  if (stageIdList.length > 0) {
    const { data: videoRows, error: videosError } = await db
      .from('path_videos')
      .select('*')
      .in('stage_id', stageIdList)
      .order('position', { ascending: true });

    if (videosError) {
      console.error('loadRevisionMembership videos error:', videosError);
      return { ok: false, status: 500, error: 'Failed to load path videos' };
    }
    videos = (videoRows || []) as PathVideoRecord[];
  }

  const videosByStage = new Map<string, PathVideoRecord[]>();
  for (const video of videos) {
    const list = videosByStage.get(video.stage_id) || [];
    list.push(video);
    videosByStage.set(video.stage_id, list);
  }

  const stagesWithVideos: PathStageWithVideos[] = stages.map((stage) => ({
    ...stage,
    videos: videosByStage.get(stage.id) || [],
  }));

  return {
    ok: true,
    path: owned.path,
    stages: stagesWithVideos,
    videoIds: new Set(videos.map((video) => video.id)),
    stageIds,
    activeRevisionId,
    activeEditVersion,
  };
}

export async function loadOwnedPathProgress(
  db: DbClient,
  ownerId: string,
  pathId: string
): Promise<
  | { ok: true; summary: PathProgressSummary; stages: PathStageWithVideos[] }
  | { ok: false; status: 404 | 500; error: string }
> {
  const membership = await loadRevisionMembership(db, pathId, ownerId);
  if (!membership.ok) {
    return membership;
  }

  const videoIdList = [...membership.videoIds];
  const stageIdList = [...membership.stageIds];

  let videoProgress: PathVideoProgressRecord[] = [];
  let stageProgress: PathStageProgressRecord[] = [];

  if (videoIdList.length > 0) {
    const { data, error } = await db
      .from('path_video_progress')
      .select('*')
      .eq('owner', ownerId)
      .in('path_video_id', videoIdList);
    if (error) {
      console.error('loadOwnedPathProgress video progress error:', error);
      return { ok: false, status: 500, error: 'Failed to load progress' };
    }
    videoProgress = (data || []) as PathVideoProgressRecord[];
  }

  if (stageIdList.length > 0) {
    const { data, error } = await db
      .from('path_stage_progress')
      .select('*')
      .eq('owner', ownerId)
      .in('path_stage_id', stageIdList);
    if (error) {
      console.error('loadOwnedPathProgress stage progress error:', error);
      return { ok: false, status: 500, error: 'Failed to load progress' };
    }
    stageProgress = (data || []).map((row) => {
      const record = row as PathStageProgressRecord;
      return {
        ...record,
        completion_version:
          typeof record.completion_version === 'number'
            ? record.completion_version
            : 1,
      };
    });
  }

  const followUpLoad = await loadOwnedStageFollowUps(
    db,
    ownerId,
    pathId,
    stageIdList
  );
  if (!followUpLoad.ok) {
    return followUpLoad;
  }

  const followUps = selectCurrentFollowUps({
    followUps: followUpLoad.followUps,
    stageProgress,
    activeStageIds: membership.stageIds,
    activeRevisionId: membership.activeRevisionId,
    activeEditVersion: membership.activeEditVersion,
  });

  const { data: quizRows, error: quizError } = await db
    .from('quiz_cards')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_id', pathId);

  if (quizError) {
    console.error('loadOwnedPathProgress quiz cards error:', quizError);
    return { ok: false, status: 500, error: 'Failed to load progress' };
  }

  const dueReviews = selectActiveDueQuizCards({
    cards: (quizRows || []) as QuizCardRecord[],
    activeRevisionId: membership.activeRevisionId,
    now: new Date(),
  }).map(toQuizCardQuestionPublic);

  return {
    ok: true,
    stages: membership.stages,
    summary: buildProgressSummary(
      membership.stages,
      videoProgress,
      stageProgress,
      followUps,
      membership.activeEditVersion,
      dueReviews
    ),
  };
}

export async function applyOwnedPathProgress(
  db: DbClient,
  ownerId: string,
  pathId: string,
  action: PathProgressAction,
  now: Date = new Date(),
  deps: PathProgressCompleteDeps = {}
): Promise<PathProgressMutationResult> {
  const membership = await loadRevisionMembership(db, pathId, ownerId);
  if (!membership.ok) {
    return membership;
  }

  if (action.action === 'mark_practiced') {
    if (!membership.videoIds.has(action.pathVideoId)) {
      return {
        ok: false,
        status: 404,
        error: 'Path video not found in active revision',
      };
    }

    if (action.practiced) {
      const { error } = await db.from('path_video_progress').upsert(
        {
          owner: ownerId,
          path_video_id: action.pathVideoId,
          practiced: true,
          practiced_at: now.toISOString(),
        },
        { onConflict: 'owner,path_video_id' }
      );
      if (error) {
        console.error('mark practiced upsert error:', error);
        return { ok: false, status: 500, error: 'Failed to update progress' };
      }
    } else {
      const { error } = await db
        .from('path_video_progress')
        .delete()
        .eq('owner', ownerId)
        .eq('path_video_id', action.pathVideoId);
      if (error) {
        console.error('unmark practiced delete error:', error);
        return { ok: false, status: 500, error: 'Failed to update progress' };
      }
    }

    const refreshed = await loadOwnedPathProgress(db, ownerId, pathId);
    if (!refreshed.ok) {
      return refreshed;
    }
    return { ok: true, summary: refreshed.summary };
  }

  if (!membership.stageIds.has(action.stageId)) {
    return {
      ok: false,
      status: 404,
      error: 'Path stage not found in active revision',
    };
  }

  if (
    membership.activeRevisionId === null ||
    membership.activeEditVersion === null
  ) {
    return {
      ok: false,
      status: 404,
      error: 'Path stage not found in active revision',
    };
  }

  const reflection =
    action.reflection && action.reflection.length > 0
      ? action.reflection
      : null;

  // Idempotent short-circuit: existing follow-up for this completion version.
  const existingFollowUps = await loadOwnedStageFollowUps(db, ownerId, pathId, [
    action.stageId,
  ]);
  if (!existingFollowUps.ok) {
    return existingFollowUps;
  }

  const existingForVersion = existingFollowUps.followUps.find(
    (row) =>
      row.path_stage_id === action.stageId &&
      row.completion_version === membership.activeEditVersion &&
      row.revision_id === membership.activeRevisionId
  );

  if (existingForVersion) {
    const refreshed = await loadOwnedPathProgress(db, ownerId, pathId);
    if (!refreshed.ok) {
      return refreshed;
    }
    return {
      ok: true,
      summary: refreshed.summary,
      followUp:
        selectCurrentFollowUps({
          followUps: [existingForVersion],
          stageProgress: [
            {
              path_stage_id: action.stageId,
              completion_version: membership.activeEditVersion,
            },
          ],
          activeStageIds: membership.stageIds,
          activeRevisionId: membership.activeRevisionId,
          activeEditVersion: membership.activeEditVersion,
        })[0] || null,
      followUpCreated: false,
    };
  }

  const practicedVideoIds = new Set<string>();
  if (membership.videoIds.size > 0) {
    const { data: practicedRows, error: practicedError } = await db
      .from('path_video_progress')
      .select('path_video_id, practiced')
      .eq('owner', ownerId)
      .in('path_video_id', [...membership.videoIds]);
    if (practicedError) {
      console.error('complete stage practiced load error:', practicedError);
      return { ok: false, status: 500, error: 'Failed to complete stage' };
    }
    for (const row of practicedRows || []) {
      if (row.practiced) {
        practicedVideoIds.add(row.path_video_id as string);
      }
    }
  }

  const evidence = buildFollowUpEvidence({
    stages: membership.stages,
    stageId: action.stageId,
    practicedVideoIds,
    reflection,
  });

  if (!evidence) {
    return {
      ok: false,
      status: 404,
      error: 'Path stage not found in active revision',
    };
  }

  const resolved = await resolveFollowUpContent({
    evidence,
    goal: membership.path.goal,
    background: membership.path.background,
    llm: deps.llm ?? null,
    timeoutMs: deps.followUpTimeoutMs ?? FOLLOWUP_PROVIDER_TIMEOUT_MS,
    signal: deps.signal,
  });

  const { data: rpcData, error: rpcError } = await db.rpc(
    'persist_stage_completion_followup',
    {
      p_path_id: pathId,
      p_owner: ownerId,
      p_stage_id: action.stageId,
      p_reflection: reflection,
      p_practiced_summary: resolved.content.practicedSummary,
      p_encouragement: resolved.content.encouragement,
      p_next_step: resolved.content.nextStep,
      p_source: resolved.source,
    }
  );

  if (rpcError) {
    console.error('persist_stage_completion_followup error:', rpcError);
    return { ok: false, status: 500, error: 'Failed to complete stage' };
  }

  const mapped = mapPersistFollowUpRpcPayload(rpcData);
  if (!mapped.ok) {
    if (mapped.code === 'not_found' || mapped.code === 'foreign_id') {
      return {
        ok: false,
        status: 404,
        error: 'Path stage not found in active revision',
      };
    }
    if (mapped.code === 'no_active_revision') {
      return {
        ok: false,
        status: 404,
        error: 'Path stage not found in active revision',
      };
    }
    return { ok: false, status: 500, error: 'Failed to complete stage' };
  }

  // One-time quiz generation for this completion version (idempotent).
  const quizEnsure = await ensureStageQuizCards({
    db,
    ownerId,
    pathId,
    stageId: action.stageId,
    completionVersion: mapped.completion_version,
    stages: membership.stages,
    goal: membership.path.goal,
    reflection,
    now,
  });
  if (!quizEnsure.ok) {
    console.error('ensureStageQuizCards after completion failed:', quizEnsure);
    // Completion + follow-up already persisted; surface as soft failure on quiz only.
  }

  const refreshed = await loadOwnedPathProgress(db, ownerId, pathId);
  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    summary: refreshed.summary,
    followUp:
      selectCurrentFollowUps({
        followUps: [mapped.followup],
        stageProgress: [
          {
            path_stage_id: mapped.progress.path_stage_id,
            completion_version: mapped.progress.completion_version,
          },
        ],
        activeStageIds: membership.stageIds,
        activeRevisionId: membership.activeRevisionId,
        activeEditVersion: membership.activeEditVersion,
      })[0] || null,
    followUpCreated: mapped.created,
  };
}
