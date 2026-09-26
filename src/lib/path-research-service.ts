import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isJobPastDeadline,
  parsePersistedPathRevision,
  toPathJobPublicView,
  validateSelectionAgainstCandidates,
  type PathJobPhase,
  type PathJobPublicView,
  type PathJobRecord,
  type PathJobStatus,
  type PathRevisionRecord,
  type PathStageRecord,
  type PathStageWithVideos,
  type PathVideoRecord,
  type PersistedPathRevision,
  type ResearchCandidate,
  type ResearchPlan,
  type ResearchSelection,
} from './path-research-schema';
import type { PathRecord } from './paths';
import { getOwnedPath, resolveOwnedPathAccess } from './paths';

export type ResearchSettings = {
  enabled: boolean;
  maxDurationSeconds: number;
  requestDeadlineMs: number;
  providerTimeoutMs: number;
  youtubeTimeoutMs: number;
  modelProvider: string;
  modelName: string;
  userDailyBudget: number;
  projectDailyBudget: number;
  candidatesPerStage: number;
  maxStages: number;
  maxVideosPerStage: number;
  promptVersion: string;
  schemaVersion: string;
};

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmCallResult<T> =
  | { ok: true; data: T; usage?: LlmUsage; latencyMs: number }
  | { ok: false; code: string; message: string; latencyMs: number };

export type ResearchLlmProvider = {
  provider: string;
  model: string;
  planStages: (input: {
    goal: string;
    background: string | null;
    maxStages: number;
    signal?: AbortSignal;
    timeoutMs: number;
  }) => Promise<LlmCallResult<ResearchPlan>>;
  selectVideos: (input: {
    goal: string;
    background: string | null;
    plan: ResearchPlan;
    candidatesByStage: ReadonlyMap<number, ReadonlyArray<ResearchCandidate>>;
    maxVideosPerStage: number;
    signal?: AbortSignal;
    timeoutMs: number;
  }) => Promise<LlmCallResult<ResearchSelection>>;
};

export type YouTubeClient = {
  searchEmbeddableVideos: (params: {
    accessToken: string;
    query: string;
    maxResults: number;
    timeoutMs: number;
    signal?: AbortSignal;
  }) => Promise<
    | { ok: true; videoIds: string[] }
    | { ok: false; code: string; message: string; status?: number }
  >;
  fetchVideoDetails: (params: {
    accessToken: string;
    videoIds: string[];
    timeoutMs: number;
    signal?: AbortSignal;
  }) => Promise<
    | { ok: true; candidates: ResearchCandidate[] }
    | { ok: false; code: string; message: string; status?: number }
  >;
};

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export type ResearchDeps = {
  db: DbClient;
  youtube: YouTubeClient;
  llm: ResearchLlmProvider;
  now?: () => Date;
  researchConfig: ResearchSettings;
};

export type ResearchRunResult =
  | {
      ok: true;
      status: 200;
      job: PathJobPublicView;
      reused: boolean;
      pathId: string;
      revisionId: string | null;
    }
  | {
      ok: false;
      status: 400 | 401 | 404 | 409 | 429 | 500 | 503;
      error: string;
      code?: string;
      job?: PathJobPublicView;
    };

function researchSettings(deps: ResearchDeps): ResearchSettings {
  return deps.researchConfig;
}

function nowMs(deps: ResearchDeps): number {
  return (deps.now || (() => new Date()))().getTime();
}

function nowIso(deps: ResearchDeps): string {
  return (deps.now || (() => new Date()))().toISOString();
}

function boundedError(code: string, message: string) {
  return { code, message: message.slice(0, 500) };
}

async function updateJob(
  db: DbClient,
  jobId: string,
  patch: Partial<{
    status: PathJobStatus;
    phase: PathJobPhase;
    revision_id: string | null;
    result: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
    usage: Record<string, unknown> | null;
    started_at: string | null;
    finished_at: string | null;
    prompt_version: string | null;
    schema_version: string | null;
    model_provider: string | null;
    model_name: string | null;
  }>
): Promise<PathJobRecord | null> {
  const { data, error } = await db
    .from('path_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('updateJob error:', error);
    return null;
  }
  return data as PathJobRecord | null;
}

async function getJobById(
  db: DbClient,
  jobId: string
): Promise<PathJobRecord | null> {
  const { data, error } = await db
    .from('path_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    console.error('getJobById error:', error);
    return null;
  }
  return data as PathJobRecord | null;
}

export async function getOwnedPathJob(
  db: DbClient,
  ownerId: string,
  pathId: string,
  jobId: string
): Promise<
  | { ok: true; job: PathJobPublicView }
  | { ok: false; status: 404 | 500; error: string }
> {
  const pathResult = await getOwnedPath(db, ownerId, pathId);
  if (!pathResult.ok) {
    return {
      ok: false,
      status: pathResult.status === 404 ? 404 : 500,
      error: pathResult.error,
    };
  }

  const job = await getJobById(db, jobId);
  if (!job || job.path_id !== pathId || job.owner !== ownerId) {
    return { ok: false, status: 404, error: 'Job not found' };
  }

  return { ok: true, job: toPathJobPublicView(job) };
}

async function loadStagesForRevision(
  db: DbClient,
  revisionId: string
): Promise<
  | { ok: true; stages: PathStageWithVideos[] }
  | { ok: false; status: 500; error: string }
> {
  const { data: stageRows, error: stagesError } = await db
    .from('path_stages')
    .select('*')
    .eq('revision_id', revisionId)
    .order('position', { ascending: true });

  if (stagesError) {
    console.error('loadStagesForRevision stages error:', stagesError);
    return { ok: false, status: 500, error: 'Failed to fetch path stages' };
  }

  const typedStages = (stageRows || []) as PathStageRecord[];
  const stageIds = typedStages.map((stage) => stage.id);

  let videosByStage = new Map<string, PathVideoRecord[]>();
  if (stageIds.length > 0) {
    const { data: videoRows, error: videosError } = await db
      .from('path_videos')
      .select('*')
      .in('stage_id', stageIds)
      .order('position', { ascending: true });

    if (videosError) {
      console.error('loadStagesForRevision videos error:', videosError);
      return {
        ok: false,
        status: 500,
        error: 'Failed to fetch path videos',
      };
    }

    videosByStage = new Map();
    for (const video of (videoRows || []) as PathVideoRecord[]) {
      const list = videosByStage.get(video.stage_id) || [];
      list.push(video);
      videosByStage.set(video.stage_id, list);
    }
  }

  return {
    ok: true,
    stages: typedStages.map((stage) => ({
      ...stage,
      videos: videosByStage.get(stage.id) || [],
    })),
  };
}

export async function loadOwnedPathDetail(
  db: DbClient,
  ownerId: string,
  pathId: string
): Promise<
  | {
      ok: true;
      path: PathRecord & { active_revision_id: string | null };
      revision: PathRevisionRecord | null;
      stages: PathStageWithVideos[];
      draftRevision: PathRevisionRecord | null;
      draftStages: PathStageWithVideos[];
      latestJob: PathJobPublicView | null;
    }
  | { ok: false; status: 404 | 500; error: string }
> {
  const { data: pathRow, error: pathError } = await db
    .from('paths')
    .select('*')
    .eq('id', pathId)
    .maybeSingle();

  if (pathError) {
    console.error('loadOwnedPathDetail path error:', pathError);
    return { ok: false, status: 500, error: 'Failed to fetch path' };
  }

  const access = resolveOwnedPathAccess(pathRow as PathRecord | null, ownerId);
  if (access.status === 'not_found') {
    return { ok: false, status: 404, error: 'Path not found' };
  }

  const path = access.path as PathRecord & {
    active_revision_id: string | null;
  };

  let revision: PathRevisionRecord | null = null;
  let stages: PathStageWithVideos[] = [];
  let draftRevision: PathRevisionRecord | null = null;
  let draftStages: PathStageWithVideos[] = [];

  if (path.active_revision_id) {
    const { data: revisionRow, error: revisionError } = await db
      .from('path_revisions')
      .select('*')
      .eq('id', path.active_revision_id)
      .eq('path_id', pathId)
      .maybeSingle();

    if (revisionError) {
      console.error('loadOwnedPathDetail revision error:', revisionError);
      return { ok: false, status: 500, error: 'Failed to fetch path revision' };
    }

    revision = (revisionRow as PathRevisionRecord | null) || null;

    if (revision) {
      const loaded = await loadStagesForRevision(db, revision.id);
      if (!loaded.ok) {
        return loaded;
      }
      stages = loaded.stages;
    }
  }

  const { data: draftRows, error: draftError } = await db
    .from('path_revisions')
    .select('*')
    .eq('path_id', pathId)
    .eq('status', 'draft')
    .order('revision_number', { ascending: false })
    .limit(1);

  if (draftError) {
    console.error('loadOwnedPathDetail draft error:', draftError);
    return { ok: false, status: 500, error: 'Failed to fetch draft revision' };
  }

  draftRevision =
    ((draftRows || [])[0] as PathRevisionRecord | undefined) || null;
  if (draftRevision) {
    const loadedDraft = await loadStagesForRevision(db, draftRevision.id);
    if (!loadedDraft.ok) {
      return loadedDraft;
    }
    draftStages = loadedDraft.stages;
  }

  const { data: jobRows, error: jobError } = await db
    .from('path_jobs')
    .select('*')
    .eq('path_id', pathId)
    .eq('owner', ownerId)
    .eq('kind', 'research')
    .order('created_at', { ascending: false })
    .limit(1);

  if (jobError) {
    console.error('loadOwnedPathDetail job error:', jobError);
    return { ok: false, status: 500, error: 'Failed to fetch path jobs' };
  }

  const latestJobRow =
    ((jobRows || [])[0] as PathJobRecord | undefined) || null;

  return {
    ok: true,
    path,
    revision,
    stages,
    draftRevision,
    draftStages,
    latestJob: latestJobRow ? toPathJobPublicView(latestJobRow) : null,
  };
}

async function reserveBudget(
  db: DbClient,
  ownerId: string,
  settings: ResearchSettings
): Promise<
  | { ok: true; periodStart: string }
  | { ok: false; code: string; message: string }
> {
  const { data, error } = await db.rpc('reserve_generation_budget', {
    p_owner: ownerId,
    p_user_limit: settings.userDailyBudget,
    p_project_limit: settings.projectDailyBudget,
    p_units: 1,
    p_project_key: 'project',
  });

  if (error) {
    console.error('reserve_generation_budget error:', error);
    return {
      ok: false,
      code: 'budget_reserve_failed',
      message: 'Failed to reserve generation budget',
    };
  }

  const payload = data as {
    ok?: boolean;
    code?: string;
    period_start?: string;
  } | null;

  if (!payload?.ok) {
    const code = payload?.code || 'budget_exhausted';
    return {
      ok: false,
      code,
      message:
        code === 'user_budget_exhausted'
          ? 'Daily research budget reached. Try again tomorrow.'
          : code === 'project_budget_exhausted'
            ? 'Project research budget reached. Try again later.'
            : 'Generation budget unavailable',
    };
  }

  return {
    ok: true,
    periodStart: String(payload.period_start),
  };
}

async function consumeBudget(
  db: DbClient,
  ownerId: string,
  periodStart: string | null
): Promise<void> {
  const { error } = await db.rpc('consume_generation_budget', {
    p_owner: ownerId,
    p_units: 1,
    p_project_key: 'project',
    p_period_start: periodStart,
  });
  if (error) {
    console.error('consume_generation_budget error:', error);
  }
}

async function releaseBudget(
  db: DbClient,
  ownerId: string,
  periodStart: string | null
): Promise<void> {
  const { error } = await db.rpc('release_generation_budget', {
    p_owner: ownerId,
    p_units: 1,
    p_project_key: 'project',
    p_period_start: periodStart,
  });
  if (error) {
    console.error('release_generation_budget error:', error);
  }
}

/**
 * Create or reuse one research job for a path.
 * Duplicate active attempts with a different key are rejected without a second reservation.
 * Same idempotency key returns the existing job (no double billing).
 */
export async function claimResearchJob(args: {
  db: DbClient;
  ownerId: string;
  path: PathRecord;
  idempotencyKey: string;
  deadlineAt: string;
  settings: ResearchSettings;
  llm: ResearchLlmProvider;
}): Promise<
  | {
      ok: true;
      job: PathJobRecord;
      reused: boolean;
      budgetPeriodStart: string | null;
    }
  | {
      ok: false;
      status: 409 | 429 | 500;
      error: string;
      code?: string;
      job?: PathJobRecord;
    }
> {
  const { db, ownerId, path, idempotencyKey, deadlineAt, settings, llm } = args;

  const { data: existingByKey, error: existingError } = await db
    .from('path_jobs')
    .select('*')
    .eq('owner', ownerId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingError) {
    console.error('claimResearchJob existing lookup error:', existingError);
    return { ok: false, status: 500, error: 'Failed to start research' };
  }

  if (existingByKey) {
    return {
      ok: true,
      job: existingByKey as PathJobRecord,
      reused: true,
      budgetPeriodStart: null,
    };
  }

  const { data: activeJobs, error: activeError } = await db
    .from('path_jobs')
    .select('*')
    .eq('path_id', path.id)
    .eq('kind', 'research')
    .in('status', ['queued', 'running'])
    .limit(1);

  if (activeError) {
    console.error('claimResearchJob active lookup error:', activeError);
    return { ok: false, status: 500, error: 'Failed to start research' };
  }

  const activeJob =
    ((activeJobs || [])[0] as PathJobRecord | undefined) || null;
  if (activeJob) {
    if (isJobPastDeadline(activeJob)) {
      await updateJob(db, activeJob.id, {
        status: 'interrupted',
        phase: 'done',
        finished_at: new Date().toISOString(),
        error: boundedError(
          'deadline_exceeded',
          'Previous research attempt timed out'
        ),
      });
    } else {
      return {
        ok: false,
        status: 409,
        code: 'research_in_progress',
        error: 'Research is already in progress for this path',
        job: activeJob,
      };
    }
  }

  const budget = await reserveBudget(db, ownerId, settings);
  if (!budget.ok) {
    return {
      ok: false,
      status: 429,
      code: budget.code,
      error: budget.message,
    };
  }

  const inputSnapshot = {
    goal: path.goal,
    background: path.background,
    title: path.title,
    pathId: path.id,
  };

  const { data: inserted, error: insertError } = await db
    .from('path_jobs')
    .insert({
      owner: ownerId,
      path_id: path.id,
      kind: 'research',
      idempotency_key: idempotencyKey,
      status: 'queued',
      phase: 'accepted',
      attempt: 1,
      deadline_at: deadlineAt,
      input_snapshot: inputSnapshot,
      prompt_version: settings.promptVersion,
      schema_version: settings.schemaVersion,
      model_provider: llm.provider,
      model_name: llm.model,
    })
    .select('*')
    .single();

  if (insertError) {
    await releaseBudget(db, ownerId, budget.periodStart);

    if (insertError.code === '23505') {
      const { data: raced } = await db
        .from('path_jobs')
        .select('*')
        .eq('owner', ownerId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (raced) {
        return {
          ok: true,
          job: raced as PathJobRecord,
          reused: true,
          budgetPeriodStart: null,
        };
      }

      const { data: racedActive } = await db
        .from('path_jobs')
        .select('*')
        .eq('path_id', path.id)
        .eq('kind', 'research')
        .in('status', ['queued', 'running'])
        .limit(1);
      const racedActiveJob =
        ((racedActive || [])[0] as PathJobRecord | undefined) || null;
      if (racedActiveJob) {
        return {
          ok: false,
          status: 409,
          code: 'research_in_progress',
          error: 'Research is already in progress for this path',
          job: racedActiveJob,
        };
      }
    }
    console.error('claimResearchJob insert error:', insertError);
    return { ok: false, status: 500, error: 'Failed to start research' };
  }

  return {
    ok: true,
    job: inserted as PathJobRecord,
    reused: false,
    budgetPeriodStart: budget.periodStart,
  };
}

function mergeUsage(
  existing: Record<string, unknown> | null | undefined,
  phase: string,
  usage: LlmUsage | undefined,
  latencyMs: number,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  const base = { ...(existing || {}) };
  const phases = {
    ...((base.phases as Record<string, unknown>) || {}),
    [phase]: {
      latencyMs,
      ...(usage || {}),
      ...(extras || {}),
    },
  };
  return { ...base, phases };
}

async function searchCandidatesForPlan(args: {
  youtube: YouTubeClient;
  accessToken: string;
  plan: ResearchPlan;
  candidatesPerStage: number;
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<
  | {
      ok: true;
      candidatesByStage: Map<number, ResearchCandidate[]>;
      emptyStages: number[];
    }
  | { ok: false; code: string; message: string }
> {
  const candidatesByStage = new Map<number, ResearchCandidate[]>();
  const emptyStages: number[] = [];

  for (let stageIndex = 0; stageIndex < args.plan.stages.length; stageIndex++) {
    if (args.signal.aborted) {
      return {
        ok: false,
        code: 'deadline_exceeded',
        message: 'Research timed out',
      };
    }

    const stage = args.plan.stages[stageIndex];
    const search = await args.youtube.searchEmbeddableVideos({
      accessToken: args.accessToken,
      query: stage.searchQuery,
      maxResults: args.candidatesPerStage,
      timeoutMs: args.timeoutMs,
      signal: args.signal,
    });

    if (!search.ok) {
      return { ok: false, code: search.code, message: search.message };
    }

    const details = await args.youtube.fetchVideoDetails({
      accessToken: args.accessToken,
      videoIds: search.videoIds,
      timeoutMs: args.timeoutMs,
      signal: args.signal,
    });

    if (!details.ok) {
      return { ok: false, code: details.code, message: details.message };
    }

    const byId = new Map(
      details.candidates.map((candidate) => [
        candidate.youtubeVideoId,
        candidate,
      ])
    );
    const ordered = search.videoIds
      .map((id) => byId.get(id))
      .filter((c): c is ResearchCandidate => Boolean(c))
      .slice(0, args.candidatesPerStage);

    candidatesByStage.set(stageIndex, ordered);
    if (ordered.length === 0) {
      emptyStages.push(stageIndex);
    }
  }

  return { ok: true, candidatesByStage, emptyStages };
}

export function buildPersistedRevision(args: {
  plan: ResearchPlan;
  selectionStages: Array<{
    stageIndex: number;
    videoIds: string[];
    reasons: string[];
  }>;
  candidatesByStage: Map<number, ResearchCandidate[]>;
  verifiedAt: string;
}): PersistedPathRevision | null {
  const stages = [];

  for (let stageIndex = 0; stageIndex < args.plan.stages.length; stageIndex++) {
    const planStage = args.plan.stages[stageIndex];
    const selection = args.selectionStages.find(
      (item) => item.stageIndex === stageIndex
    );
    if (!selection || selection.videoIds.length === 0) {
      continue;
    }

    const pool = args.candidatesByStage.get(stageIndex) || [];
    const byId = new Map(pool.map((c) => [c.youtubeVideoId, c]));
    const videos = [];

    for (let i = 0; i < selection.videoIds.length; i++) {
      const videoId = selection.videoIds[i];
      const candidate = byId.get(videoId);
      if (!candidate) {
        return null;
      }
      videos.push({
        youtubeVideoId: candidate.youtubeVideoId,
        title: candidate.title,
        channelTitle: candidate.channelTitle,
        selectionReason: selection.reasons[i] || 'Selected for this stage',
        source: 'research' as const,
        durationSeconds: candidate.durationSeconds,
        thumbnailUrl: candidate.thumbnailUrl ?? null,
        verifiedAt: args.verifiedAt,
        metadataSnapshot: {
          channelTitle: candidate.channelTitle,
          durationSeconds: candidate.durationSeconds,
        },
      });
    }

    stages.push({
      title: planStage.title,
      learningObjective: planStage.learningObjective,
      reason: planStage.reason,
      videos,
    });
  }

  if (stages.length === 0) {
    return null;
  }

  const parsed = parsePersistedPathRevision({ stages });
  return parsed.success ? parsed.data : null;
}

async function saveRevisionTransactional(args: {
  db: DbClient;
  pathId: string;
  ownerId: string;
  inputSnapshot: Record<string, unknown>;
  revision: PersistedPathRevision;
  /** When true (or when an active revision already exists), persist as draft. */
  asDraft: boolean;
}): Promise<
  | {
      ok: true;
      revisionId: string;
      revisionNumber: number;
      status: 'draft' | 'active';
    }
  | { ok: false; code: string; message: string }
> {
  const { data, error } = await args.db.rpc('save_complete_path_revision', {
    p_path_id: args.pathId,
    p_owner: args.ownerId,
    p_input_snapshot: args.inputSnapshot,
    p_stages: args.revision.stages,
    p_as_draft: args.asDraft,
  });

  if (error) {
    console.error('save_complete_path_revision error:', error);
    return {
      ok: false,
      code: 'persist_failed',
      message: 'Failed to save researched path',
    };
  }

  const payload = data as {
    ok?: boolean;
    code?: string;
    revision_id?: string;
    revision_number?: number;
    status?: 'draft' | 'active';
  } | null;

  if (!payload?.ok || !payload.revision_id) {
    return {
      ok: false,
      code: payload?.code || 'persist_failed',
      message: 'Failed to save researched path',
    };
  }

  return {
    ok: true,
    revisionId: payload.revision_id,
    revisionNumber: payload.revision_number || 1,
    status: payload.status === 'draft' ? 'draft' : 'active',
  };
}

/**
 * Late-result protection: refuse to persist if the job deadline passed
 * or the attempt is no longer active.
 */
export function assertJobMayPersist(
  job: PathJobRecord,
  now: Date = new Date()
): { ok: true } | { ok: false; code: string; message: string } {
  if (isJobPastDeadline(job, now)) {
    return {
      ok: false,
      code: 'deadline_exceeded',
      message: 'Research deadline exceeded before save',
    };
  }
  if (job.status !== 'running' && job.status !== 'queued') {
    return {
      ok: false,
      code: 'stale_attempt',
      message: 'Research attempt is no longer active',
    };
  }
  return { ok: true };
}

export async function executeResearchPipeline(args: {
  deps: ResearchDeps;
  job: PathJobRecord;
  accessToken: string;
  budgetPeriodStart: string | null;
  billUsage: boolean;
}): Promise<{ job: PathJobRecord }> {
  const { deps, accessToken, budgetPeriodStart, billUsage } = args;
  const settings = researchSettings(deps);
  const deadlineMs = new Date(args.job.deadline_at).getTime();
  const controller = new AbortController();
  const tick = () => {
    if (nowMs(deps) >= deadlineMs) {
      controller.abort();
    }
  };

  let job = args.job;
  let usageAcc: Record<string, unknown> | null = job.usage;

  const fail = async (
    code: string,
    message: string,
    status: PathJobStatus = 'failed'
  ) => {
    const finished = await updateJob(deps.db, job.id, {
      status,
      phase: 'done',
      finished_at: nowIso(deps),
      error: boundedError(code, message),
      usage: usageAcc,
    });
    if (billUsage) {
      await consumeBudget(deps.db, job.owner, budgetPeriodStart);
    }
    return { job: finished || job };
  };

  tick();
  if (controller.signal.aborted) {
    return fail(
      'deadline_exceeded',
      'Research timed out before starting',
      'interrupted'
    );
  }

  const started = await updateJob(deps.db, job.id, {
    status: 'running',
    phase: 'planning',
    started_at: job.started_at || nowIso(deps),
  });
  job = started || job;

  const goal = String(job.input_snapshot.goal || '');
  const background =
    typeof job.input_snapshot.background === 'string'
      ? job.input_snapshot.background
      : null;

  const planResult = await deps.llm.planStages({
    goal,
    background,
    maxStages: settings.maxStages,
    timeoutMs: settings.providerTimeoutMs,
    signal: controller.signal,
  });
  usageAcc = mergeUsage(
    usageAcc,
    'planning',
    planResult.ok ? planResult.usage : undefined,
    planResult.latencyMs
  );
  tick();

  if (!planResult.ok) {
    const status =
      planResult.code === 'model_timeout' ? 'interrupted' : 'failed';
    return fail(planResult.code, planResult.message, status);
  }

  const plan = planResult.data;
  await updateJob(deps.db, job.id, {
    phase: 'searching',
    usage: usageAcc,
  });

  const searchResult = await searchCandidatesForPlan({
    youtube: deps.youtube,
    accessToken,
    plan,
    candidatesPerStage: settings.candidatesPerStage,
    timeoutMs: settings.youtubeTimeoutMs,
    signal: controller.signal,
  });
  tick();

  if (!searchResult.ok) {
    const status =
      searchResult.code === 'deadline_exceeded' ||
      searchResult.code === 'youtube_timeout'
        ? 'interrupted'
        : 'failed';
    return fail(searchResult.code, searchResult.message, status);
  }

  if (searchResult.emptyStages.length === plan.stages.length) {
    return fail(
      'no_candidates',
      'No playable YouTube videos matched this path. Try refining the goal or background.',
      'failed'
    );
  }

  const candidatesByStage = searchResult.candidatesByStage;

  await updateJob(deps.db, job.id, {
    phase: 'selecting',
    usage: usageAcc,
  });

  const selectionResult = await deps.llm.selectVideos({
    goal,
    background,
    plan,
    candidatesByStage,
    maxVideosPerStage: settings.maxVideosPerStage,
    timeoutMs: settings.providerTimeoutMs,
    signal: controller.signal,
  });
  usageAcc = mergeUsage(
    usageAcc,
    'selecting',
    selectionResult.ok ? selectionResult.usage : undefined,
    selectionResult.latencyMs,
    { emptyStages: searchResult.emptyStages }
  );
  tick();

  if (!selectionResult.ok) {
    const status =
      selectionResult.code === 'model_timeout' ? 'interrupted' : 'failed';
    return fail(selectionResult.code, selectionResult.message, status);
  }

  const candidateCheck = validateSelectionAgainstCandidates(
    selectionResult.data,
    candidatesByStage,
    settings.maxStages,
    settings.maxVideosPerStage
  );
  if (!candidateCheck.ok) {
    return fail('invalid_selection', candidateCheck.error);
  }

  const refreshed = await getJobById(deps.db, job.id);
  if (!refreshed) {
    return fail('stale_attempt', 'Research job disappeared before save');
  }
  job = refreshed;

  const mayPersist = assertJobMayPersist(job, new Date(nowMs(deps)));
  if (!mayPersist.ok) {
    return fail(mayPersist.code, mayPersist.message, 'interrupted');
  }

  const persisted = buildPersistedRevision({
    plan,
    selectionStages: selectionResult.data.stages,
    candidatesByStage,
    verifiedAt: nowIso(deps),
  });

  if (!persisted) {
    return fail(
      'incomplete_selection',
      'Could not build a complete path from verified candidates'
    );
  }

  await updateJob(deps.db, job.id, {
    phase: 'saving',
    usage: usageAcc,
  });

  const { data: pathRow } = await deps.db
    .from('paths')
    .select('active_revision_id')
    .eq('id', job.path_id)
    .maybeSingle();
  const hasActiveRevision = Boolean(
    (pathRow as { active_revision_id?: string | null } | null)
      ?.active_revision_id
  );
  const asDraft = hasActiveRevision;

  let activeEditVersion: number | null = null;
  if (asDraft && pathRow) {
    const activeId = (pathRow as { active_revision_id: string | null })
      .active_revision_id;
    if (activeId) {
      const { data: activeRevision } = await deps.db
        .from('path_revisions')
        .select('edit_version')
        .eq('id', activeId)
        .maybeSingle();
      activeEditVersion =
        (activeRevision as { edit_version?: number } | null)?.edit_version ??
        null;
    }
  }

  const inputSnapshot: Record<string, unknown> = {
    ...job.input_snapshot,
    ...(asDraft
      ? {
          regeneration: true,
          baseEditVersion: activeEditVersion,
        }
      : {}),
  };

  const saveStarted = Date.now();
  const saved = await saveRevisionTransactional({
    db: deps.db,
    pathId: job.path_id,
    ownerId: job.owner,
    inputSnapshot,
    revision: persisted,
    asDraft,
  });
  usageAcc = mergeUsage(
    usageAcc,
    'saving',
    undefined,
    Date.now() - saveStarted
  );

  if (!saved.ok) {
    return fail(saved.code, saved.message);
  }

  const partial =
    searchResult.emptyStages.length > 0 ||
    persisted.stages.length < plan.stages.length;

  const finished = await updateJob(deps.db, job.id, {
    status: partial ? 'partial' : 'succeeded',
    phase: 'done',
    revision_id: saved.revisionId,
    finished_at: nowIso(deps),
    error: partial
      ? boundedError(
          'partial_coverage',
          'Some stages had no playable matches and were omitted'
        )
      : null,
    result: {
      summary: asDraft
        ? partial
          ? `Draft saved with ${persisted.stages.length} of ${plan.stages.length} stages — activate to replace the live path`
          : `Draft saved with ${persisted.stages.length} stages — activate to replace the live path`
        : partial
          ? `Saved ${persisted.stages.length} of ${plan.stages.length} stages`
          : `Saved ${persisted.stages.length} stages`,
      revisionId: saved.revisionId,
      revisionNumber: saved.revisionNumber,
      revisionStatus: saved.status,
      stageCount: persisted.stages.length,
      emptyStages: searchResult.emptyStages,
      baseEditVersion: activeEditVersion,
    },
    usage: usageAcc,
  });

  if (billUsage) {
    await consumeBudget(deps.db, job.owner, budgetPeriodStart);
  }

  return { job: finished || job };
}

export async function runPathResearch(args: {
  deps: ResearchDeps;
  ownerId: string;
  pathId: string;
  idempotencyKey: string;
  accessToken: string;
}): Promise<ResearchRunResult> {
  const settings = researchSettings(args.deps);

  if (!settings.enabled) {
    return {
      ok: false,
      status: 503,
      code: 'research_disabled',
      error: 'Path research is temporarily disabled',
    };
  }

  const pathResult = await getOwnedPath(
    args.deps.db,
    args.ownerId,
    args.pathId
  );
  if (!pathResult.ok) {
    return {
      ok: false,
      status: pathResult.status === 404 ? 404 : 500,
      error: pathResult.error,
    };
  }

  const deadlineAt = new Date(
    nowMs(args.deps) + settings.requestDeadlineMs
  ).toISOString();

  const claimed = await claimResearchJob({
    db: args.deps.db,
    ownerId: args.ownerId,
    path: pathResult.path,
    idempotencyKey: args.idempotencyKey,
    deadlineAt,
    settings,
    llm: args.deps.llm,
  });

  if (!claimed.ok) {
    return {
      ok: false,
      status: claimed.status,
      error: claimed.error,
      code: claimed.code,
      job: claimed.job ? toPathJobPublicView(claimed.job) : undefined,
    };
  }

  if (claimed.reused) {
    const existing = claimed.job;
    return {
      ok: true,
      status: 200,
      job: toPathJobPublicView(existing),
      reused: true,
      pathId: existing.path_id,
      revisionId: existing.revision_id,
    };
  }

  const { job } = await executeResearchPipeline({
    deps: args.deps,
    job: claimed.job,
    accessToken: args.accessToken,
    budgetPeriodStart: claimed.budgetPeriodStart,
    billUsage: true,
  });

  if (job.status === 'failed' || job.status === 'interrupted') {
    return {
      ok: false,
      status: job.error?.code === 'user_budget_exhausted' ? 429 : 500,
      error:
        typeof job.error?.message === 'string'
          ? job.error.message
          : 'Research failed',
      code:
        typeof job.error?.code === 'string'
          ? job.error.code
          : 'research_failed',
      job: toPathJobPublicView(job),
    };
  }

  if (job.status === 'succeeded' || job.status === 'partial') {
    return {
      ok: true,
      status: 200,
      job: toPathJobPublicView(job),
      reused: false,
      pathId: job.path_id,
      revisionId: job.revision_id,
    };
  }

  return {
    ok: false,
    status: 500,
    error: 'Research ended in an unexpected state',
    code: 'research_failed',
    job: toPathJobPublicView(job),
  };
}
