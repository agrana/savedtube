import { z } from 'zod';

export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export const youtubeVideoIdSchema = z
  .string()
  .regex(YOUTUBE_VIDEO_ID_REGEX, 'Invalid YouTube video ID');

export const RESEARCH_IDEMPOTENCY_KEY_MIN = 8;
export const RESEARCH_IDEMPOTENCY_KEY_MAX = 128;

export const researchIdempotencyKeySchema = z
  .string()
  .trim()
  .min(
    RESEARCH_IDEMPOTENCY_KEY_MIN,
    `Idempotency key must be at least ${RESEARCH_IDEMPOTENCY_KEY_MIN} characters`
  )
  .max(
    RESEARCH_IDEMPOTENCY_KEY_MAX,
    `Idempotency key must be at most ${RESEARCH_IDEMPOTENCY_KEY_MAX} characters`
  );

export const researchRequestSchema = z.object({
  idempotencyKey: researchIdempotencyKeySchema,
});

export type ResearchRequestInput = z.infer<typeof researchRequestSchema>;

export const PATH_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
  'interrupted',
] as const;

export type PathJobStatus = (typeof PATH_JOB_STATUSES)[number];

export const PATH_JOB_PHASES = [
  'accepted',
  'planning',
  'searching',
  'selecting',
  'saving',
  'parsing',
  'ranking',
  'done',
] as const;

export type PathJobPhase = (typeof PATH_JOB_PHASES)[number];

export const PATH_JOB_KINDS = ['research', 'interval_suggestions'] as const;

export type PathJobKind = (typeof PATH_JOB_KINDS)[number];

export const ACTIVE_PATH_JOB_STATUSES: ReadonlySet<PathJobStatus> = new Set([
  'queued',
  'running',
]);

/** Structured planning output: stages + one search query each. No video IDs. */
export const researchPlanStageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  learningObjective: z.string().trim().min(1).max(1000),
  reason: z.string().trim().min(1).max(1000),
  searchQuery: z.string().trim().min(1).max(200),
});

export const researchPlanSchema = z.object({
  stages: z.array(researchPlanStageSchema).min(1).max(5),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;
export type ResearchPlanStage = z.infer<typeof researchPlanStageSchema>;

export const researchCandidateSchema = z.object({
  youtubeVideoId: youtubeVideoIdSchema,
  title: z.string().trim().min(1).max(300),
  channelTitle: z.string().trim().min(1).max(200),
  durationSeconds: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().url().nullable().optional(),
  descriptionExcerpt: z.string().max(500).optional(),
});

export type ResearchCandidate = z.infer<typeof researchCandidateSchema>;

/** Selection must reference only verified candidate IDs supplied in the prompt. */
export const researchSelectionStageSchema = z.object({
  stageIndex: z.number().int().min(0).max(4),
  videoIds: z.array(youtubeVideoIdSchema).min(1).max(2),
  reasons: z.array(z.string().trim().min(1).max(1000)).min(1).max(2),
});

export const researchSelectionSchema = z.object({
  stages: z.array(researchSelectionStageSchema).min(1).max(5),
});

export type ResearchSelection = z.infer<typeof researchSelectionSchema>;

export const persistedPathVideoSchema = z.object({
  youtubeVideoId: youtubeVideoIdSchema,
  title: z.string().trim().min(1).max(300),
  channelTitle: z.string().trim().max(200).nullable().optional(),
  selectionReason: z.string().trim().min(1).max(1000),
  source: z.literal('research'),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  verifiedAt: z.string().datetime(),
  metadataSnapshot: z.record(z.unknown()).nullable().optional(),
});

export const persistedPathStageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  learningObjective: z.string().trim().min(1).max(1000),
  reason: z.string().trim().min(1).max(1000),
  videos: z.array(persistedPathVideoSchema).min(1).max(2),
});

export const persistedPathRevisionSchema = z.object({
  stages: z.array(persistedPathStageSchema).min(1).max(5),
});

export type PersistedPathRevision = z.infer<typeof persistedPathRevisionSchema>;

export type PathJobRecord = {
  id: string;
  owner: string;
  path_id: string;
  revision_id: string | null;
  kind: PathJobKind;
  idempotency_key: string;
  status: PathJobStatus;
  phase: PathJobPhase;
  attempt: number;
  deadline_at: string;
  input_snapshot: Record<string, unknown>;
  prompt_version: string | null;
  schema_version: string | null;
  model_provider: string | null;
  model_name: string | null;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PathRevisionRecord = {
  id: string;
  path_id: string;
  revision_number: number;
  status: 'draft' | 'active' | 'archived';
  edit_version: number;
  input_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PathStageRecord = {
  id: string;
  revision_id: string;
  position: number;
  title: string;
  learning_objective: string;
  reason: string;
  created_at: string;
  updated_at: string;
};

export type PathVideoRecord = {
  id: string;
  stage_id: string;
  position: number;
  youtube_video_id: string;
  title: string;
  channel_title: string | null;
  selection_reason: string;
  source: 'research' | 'manual';
  duration_seconds: number | null;
  thumbnail_url: string | null;
  verified_at: string;
  metadata_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PathStageWithVideos = PathStageRecord & {
  videos: PathVideoRecord[];
};

export type PathDetailPayload = {
  path: {
    id: string;
    owner: string;
    goal: string;
    background: string | null;
    title: string;
    active_revision_id: string | null;
    created_at: string;
    updated_at: string;
  };
  revision: PathRevisionRecord | null;
  stages: PathStageWithVideos[];
  draftRevision: PathRevisionRecord | null;
  draftStages: PathStageWithVideos[];
  latestJob: PathJobPublicView | null;
};

/** Safe job fields for clients — no prompt internals or secrets. */
export type PathJobPublicView = {
  id: string;
  pathId: string;
  kind: PathJobKind;
  status: PathJobStatus;
  phase: PathJobPhase;
  attempt: number;
  deadlineAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  resultSummary: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export function parseResearchRequestBody(body: unknown) {
  return parseWithSchema(researchRequestSchema, body);
}

export function parseResearchPlan(data: unknown) {
  return parseWithSchema(researchPlanSchema, data);
}

export function parseResearchSelection(data: unknown) {
  return parseWithSchema(researchSelectionSchema, data);
}

export function parsePersistedPathRevision(data: unknown) {
  return parseWithSchema(persistedPathRevisionSchema, data);
}

/**
 * Every selected video ID must appear in the verified candidate pool for that stage.
 * Rejects invented IDs and duplicate picks within a stage.
 */
export function validateSelectionAgainstCandidates(
  selection: ResearchSelection,
  candidatesByStage: ReadonlyMap<number, ReadonlyArray<ResearchCandidate>>,
  maxStages: number,
  maxVideosPerStage: number
): { ok: true } | { ok: false; error: string } {
  if (selection.stages.length > maxStages) {
    return { ok: false, error: `At most ${maxStages} stages allowed` };
  }

  const seenIndexes = new Set<number>();
  for (const stage of selection.stages) {
    if (seenIndexes.has(stage.stageIndex)) {
      return { ok: false, error: 'Duplicate stageIndex in selection' };
    }
    seenIndexes.add(stage.stageIndex);

    if (stage.videoIds.length !== stage.reasons.length) {
      return {
        ok: false,
        error: 'Each selected video requires a matching reason',
      };
    }
    if (stage.videoIds.length > maxVideosPerStage) {
      return {
        ok: false,
        error: `At most ${maxVideosPerStage} videos per stage`,
      };
    }

    const pool = candidatesByStage.get(stage.stageIndex);
    if (!pool || pool.length === 0) {
      return {
        ok: false,
        error: `No verified candidates for stage ${stage.stageIndex}`,
      };
    }

    const poolIds = new Set(pool.map((candidate) => candidate.youtubeVideoId));
    const picked = new Set<string>();
    for (const videoId of stage.videoIds) {
      if (!poolIds.has(videoId)) {
        return {
          ok: false,
          error: `Selected video ${videoId} is not in the verified candidate pool`,
        };
      }
      if (picked.has(videoId)) {
        return {
          ok: false,
          error: `Duplicate video ${videoId} in stage ${stage.stageIndex}`,
        };
      }
      picked.add(videoId);
    }
  }

  return { ok: true };
}

export function toPathJobPublicView(job: PathJobRecord): PathJobPublicView {
  const errorCode = typeof job.error?.code === 'string' ? job.error.code : null;
  const errorMessage =
    typeof job.error?.message === 'string' ? job.error.message : null;
  const resultSummary =
    typeof job.result?.summary === 'string' ? job.result.summary : null;

  return {
    id: job.id,
    pathId: job.path_id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    attempt: job.attempt,
    deadlineAt: job.deadline_at,
    errorCode,
    errorMessage,
    resultSummary,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export function isActiveJobStatus(status: PathJobStatus): boolean {
  return ACTIVE_PATH_JOB_STATUSES.has(status);
}

export function isJobPastDeadline(
  job: Pick<PathJobRecord, 'deadline_at'>,
  now: Date = new Date()
): boolean {
  return new Date(job.deadline_at).getTime() <= now.getTime();
}
