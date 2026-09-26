import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findVideoInRevision } from './path-edits';
import { getOwnedPath } from './paths';
import { loadOwnedPathDetail } from './path-research-service';
import type {
  PathJobPhase,
  PathJobRecord,
  PathJobStatus,
  PathVideoRecord,
} from './path-research-schema';
import {
  extractChaptersFromDescription,
  findKnownChapterSpan,
  type ParsedChapter,
} from './youtube-chapters';

export const INTERVAL_SUGGESTIONS_PROMPT_VERSION =
  'interval-suggestions-rank-v1';
export const INTERVAL_SUGGESTIONS_SCHEMA_VERSION = 'interval-suggestions-v1';
export const INTERVAL_SUGGESTIONS_MAX_SELECTED = 5;

const uuidSchema = z.string().uuid();

export const generateIntervalSuggestionsBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const acceptIntervalSuggestionsBodySchema = z.object({
  suggestionIds: z.array(uuidSchema).min(1).max(20),
});

export type IntervalSuggestionRecord = {
  id: string;
  owner: string;
  path_video_id: string;
  path_job_id: string;
  label: string;
  start_time: number;
  end_time: number;
  rationale: string;
  accepted_interval_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IntervalSuggestionPublic = {
  id: string;
  pathVideoId: string;
  pathJobId: string;
  label: string;
  startTime: number;
  endTime: number;
  rationale: string;
  acceptedIntervalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RankedChapterSelection = {
  chapterIndexes: number[];
  rationales: string[];
};

export type IntervalSuggestionLlm = {
  provider: string;
  model: string;
  rankChapters: (input: {
    goal: string;
    background: string | null;
    videoTitle: string;
    stageTitle: string;
    learningObjective: string;
    chapters: ReadonlyArray<ParsedChapter>;
    maxSelected: number;
    signal?: AbortSignal;
    timeoutMs: number;
  }) => Promise<
    | {
        ok: true;
        data: RankedChapterSelection;
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
        latencyMs: number;
      }
    | {
        ok: false;
        code: string;
        message: string;
        latencyMs: number;
      }
  >;
};

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export type IntervalSuggestionSettings = {
  enabled: boolean;
  requestDeadlineMs: number;
  providerTimeoutMs: number;
  youtubeTimeoutMs: number;
  modelProvider: string;
  modelName: string;
  userDailyBudget: number;
  projectDailyBudget: number;
  promptVersion: string;
  schemaVersion: string;
};

export type IntervalSuggestionDeps = {
  db: DbClient;
  llm: IntervalSuggestionLlm;
  fetchDescription: (args: {
    accessToken: string;
    youtubeVideoId: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }) => Promise<
    | {
        ok: true;
        description: string;
        durationSeconds: number | null;
      }
    | { ok: false; code: string; message: string; status?: number }
  >;
  researchConfig: IntervalSuggestionSettings;
  now?: () => Date;
};

function nowIso(deps: IntervalSuggestionDeps): string {
  return (deps.now || (() => new Date()))().toISOString();
}

function nowMs(deps: IntervalSuggestionDeps): number {
  return (deps.now || (() => new Date()))().getTime();
}

export function toIntervalSuggestionPublic(
  row: IntervalSuggestionRecord
): IntervalSuggestionPublic {
  return {
    id: row.id,
    pathVideoId: row.path_video_id,
    pathJobId: row.path_job_id,
    label: row.label,
    startTime: row.start_time,
    endTime: row.end_time,
    rationale: row.rationale,
    acceptedIntervalId: row.accepted_interval_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseGenerateIntervalSuggestionsBody(body: unknown) {
  const result = generateIntervalSuggestionsBodySchema.safeParse(body);
  if (!result.success) {
    return {
      success: false as const,
      error: result.error.errors[0]?.message || 'Invalid input',
    };
  }
  return { success: true as const, data: result.data };
}

export function parseAcceptIntervalSuggestionsBody(body: unknown) {
  const result = acceptIntervalSuggestionsBodySchema.safeParse(body);
  if (!result.success) {
    return {
      success: false as const,
      error: result.error.errors[0]?.message || 'Invalid input',
    };
  }
  return { success: true as const, data: result.data };
}

/**
 * Keep only known chapter spans. Invented finer timestamps are dropped.
 */
export function selectKnownChapterSpans(
  chapters: ReadonlyArray<ParsedChapter>,
  selection: RankedChapterSelection
): Array<ParsedChapter & { rationale: string }> {
  const selected: Array<ParsedChapter & { rationale: string }> = [];
  const seen = new Set<number>();

  for (let i = 0; i < selection.chapterIndexes.length; i += 1) {
    const index = selection.chapterIndexes[i];
    if (!Number.isInteger(index) || index < 0 || index >= chapters.length) {
      continue;
    }
    if (seen.has(index)) {
      continue;
    }
    seen.add(index);
    const chapter = chapters[index];
    const rationale =
      selection.rationales[i]?.trim() ||
      `Practice the “${chapter.label}” section for this stage.`;
    selected.push({
      ...chapter,
      rationale: rationale.slice(0, 1000),
    });
  }

  return selected;
}

/**
 * Reject model payloads that invent start/end times instead of indexes.
 */
export function rejectInventedTimestamps(
  chapters: ReadonlyArray<ParsedChapter>,
  payload: unknown
):
  | { ok: true; selection: RankedChapterSelection }
  | {
      ok: false;
      code: 'invented_timestamps' | 'invalid_selection';
      message: string;
    } {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      code: 'invalid_selection',
      message: 'Selection payload must be an object',
    };
  }

  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.spans)) {
    for (const span of record.spans) {
      if (!span || typeof span !== 'object') {
        continue;
      }
      const startTime = (span as { startTime?: unknown }).startTime;
      const endTime = (span as { endTime?: unknown }).endTime;
      if (
        typeof startTime === 'number' &&
        typeof endTime === 'number' &&
        !findKnownChapterSpan(chapters, startTime, endTime)
      ) {
        return {
          ok: false,
          code: 'invented_timestamps',
          message: 'Model invented timestamps outside known chapter spans',
        };
      }
    }
  }

  const indexesRaw = record.chapterIndexes;
  if (!Array.isArray(indexesRaw)) {
    return {
      ok: false,
      code: 'invalid_selection',
      message: 'chapterIndexes must be an array',
    };
  }

  const chapterIndexes = indexesRaw.filter((value): value is number =>
    Number.isInteger(value)
  );
  const rationales = Array.isArray(record.rationales)
    ? record.rationales.map((value) => (typeof value === 'string' ? value : ''))
    : [];

  return {
    ok: true,
    selection: { chapterIndexes, rationales },
  };
}

async function updateSuggestionJob(
  db: DbClient,
  jobId: string,
  patch: Partial<{
    status: PathJobStatus;
    phase: PathJobPhase;
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
) {
  const { error } = await db
    .from('path_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) {
    console.error('updateSuggestionJob error:', error);
  }
}

export type GenerateIntervalSuggestionsResult =
  | {
      ok: true;
      status: 200;
      state: 'suggestions' | 'no_chapters';
      jobId: string;
      reused: boolean;
      suggestions: IntervalSuggestionPublic[];
      message?: string;
    }
  | {
      ok: false;
      status: 400 | 401 | 404 | 409 | 429 | 500 | 503;
      error: string;
      code?: string;
    };

export async function generateOwnedIntervalSuggestions(
  deps: IntervalSuggestionDeps,
  ownerId: string,
  pathId: string,
  pathVideoId: string,
  accessToken: string,
  idempotencyKey: string
): Promise<GenerateIntervalSuggestionsResult> {
  const settings = deps.researchConfig;
  if (!settings.enabled) {
    return {
      ok: false,
      status: 503,
      error: 'Interval suggestions are temporarily disabled',
      code: 'suggestions_disabled',
    };
  }

  const owned = await getOwnedPath(deps.db, ownerId, pathId);
  if (!owned.ok) {
    return { ok: false, status: owned.status, error: owned.error };
  }

  const detail = await loadOwnedPathDetail(deps.db, ownerId, pathId);
  if (!detail.ok) {
    return { ok: false, status: detail.status, error: detail.error };
  }

  const membership = findVideoInRevision(detail.stages, pathVideoId);
  if (!membership) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const video: PathVideoRecord = membership.stage.videos[membership.videoIndex];
  const stage = membership.stage;

  const { data: existingJob, error: existingJobError } = await deps.db
    .from('path_jobs')
    .select('*')
    .eq('owner', ownerId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingJobError) {
    console.error(
      'interval suggestions idempotency lookup error:',
      existingJobError
    );
    return { ok: false, status: 500, error: 'Failed to start suggestion job' };
  }

  if (existingJob) {
    const job = existingJob as PathJobRecord;
    if (
      job.kind !== 'interval_suggestions' ||
      job.path_id !== pathId ||
      (job.input_snapshot as { pathVideoId?: string })?.pathVideoId !==
        pathVideoId
    ) {
      return {
        ok: false,
        status: 409,
        error: 'Idempotency key already used for a different job',
        code: 'idempotency_conflict',
      };
    }

    if (job.status === 'failed' || job.status === 'interrupted') {
      const errorPayload = job.error as {
        message?: string;
        code?: string;
      } | null;
      return {
        ok: false,
        status: 500,
        error: errorPayload?.message || 'Previous suggestion job failed',
        code: errorPayload?.code || 'job_failed',
      };
    }

    const { data: existingSuggestions, error: suggestionsError } = await deps.db
      .from('interval_suggestions')
      .select('*')
      .eq('owner', ownerId)
      .eq('path_job_id', job.id)
      .order('start_time', { ascending: true });

    if (suggestionsError) {
      console.error('reuse suggestions load error:', suggestionsError);
      return { ok: false, status: 500, error: 'Failed to load suggestions' };
    }

    const rows = (existingSuggestions || []) as IntervalSuggestionRecord[];
    const resultState = (job.result as { state?: string } | null)?.state;
    const noChapters =
      (job.status === 'succeeded' || job.status === 'partial') &&
      resultState === 'no_chapters';

    return {
      ok: true,
      status: 200,
      state: noChapters ? 'no_chapters' : 'suggestions',
      jobId: job.id,
      reused: true,
      suggestions: rows.map(toIntervalSuggestionPublic),
      message: noChapters
        ? 'No usable chapters found. Mark practice intervals manually.'
        : undefined,
    };
  }

  const deadlineAt = new Date(
    nowMs(deps) + settings.requestDeadlineMs
  ).toISOString();

  const { data: createdJob, error: createJobError } = await deps.db
    .from('path_jobs')
    .insert({
      owner: ownerId,
      path_id: pathId,
      revision_id: detail.revision?.id ?? null,
      kind: 'interval_suggestions',
      idempotency_key: idempotencyKey,
      status: 'running',
      phase: 'parsing',
      attempt: 1,
      deadline_at: deadlineAt,
      input_snapshot: {
        pathVideoId,
        youtubeVideoId: video.youtube_video_id,
        goal: detail.path.goal,
        background: detail.path.background,
      },
      prompt_version: settings.promptVersion,
      schema_version: settings.schemaVersion,
      model_provider: settings.modelProvider,
      model_name: settings.modelName,
      started_at: nowIso(deps),
    })
    .select('*')
    .single();

  if (createJobError || !createdJob) {
    console.error('create interval suggestion job error:', createJobError);
    return { ok: false, status: 500, error: 'Failed to start suggestion job' };
  }

  const job = createdJob as PathJobRecord;

  const descriptionResult = await deps.fetchDescription({
    accessToken,
    youtubeVideoId: video.youtube_video_id,
    timeoutMs: settings.youtubeTimeoutMs,
  });

  if (!descriptionResult.ok) {
    await updateSuggestionJob(deps.db, job.id, {
      status: 'failed',
      phase: 'done',
      error: {
        code: descriptionResult.code,
        message: descriptionResult.message,
      },
      finished_at: nowIso(deps),
    });
    return {
      ok: false,
      status: descriptionResult.status === 401 ? 401 : 500,
      error: descriptionResult.message,
      code: descriptionResult.code,
    };
  }

  const durationSeconds =
    descriptionResult.durationSeconds ?? video.duration_seconds;
  const parsed = extractChaptersFromDescription(
    descriptionResult.description,
    durationSeconds
  );

  if (!parsed.ok) {
    await updateSuggestionJob(deps.db, job.id, {
      status: 'succeeded',
      phase: 'done',
      result: {
        summary: parsed.message,
        state: 'no_chapters',
        code: parsed.code,
      },
      finished_at: nowIso(deps),
    });
    return {
      ok: true,
      status: 200,
      state: 'no_chapters',
      jobId: job.id,
      reused: false,
      suggestions: [],
      message:
        'No usable chapters found for suggestions. You can mark practice intervals manually.',
    };
  }

  await updateSuggestionJob(deps.db, job.id, { phase: 'ranking' });

  const ranked = await deps.llm.rankChapters({
    goal: detail.path.goal,
    background: detail.path.background,
    videoTitle: video.title,
    stageTitle: stage.title,
    learningObjective: stage.learning_objective,
    chapters: parsed.chapters,
    maxSelected: INTERVAL_SUGGESTIONS_MAX_SELECTED,
    timeoutMs: settings.providerTimeoutMs,
  });

  if (!ranked.ok) {
    // Fall back to all known chapters with template rationales — still no invented times.
    const fallback = selectKnownChapterSpans(parsed.chapters, {
      chapterIndexes: parsed.chapters
        .map((_, index) => index)
        .slice(0, INTERVAL_SUGGESTIONS_MAX_SELECTED),
      rationales: [],
    });

    const inserted = await persistSuggestions(
      deps.db,
      ownerId,
      pathVideoId,
      job.id,
      fallback
    );
    if (!inserted.ok) {
      await updateSuggestionJob(deps.db, job.id, {
        status: 'failed',
        phase: 'done',
        error: { code: 'persist_failed', message: inserted.error },
        finished_at: nowIso(deps),
      });
      return { ok: false, status: 500, error: inserted.error };
    }

    await updateSuggestionJob(deps.db, job.id, {
      status: 'partial',
      phase: 'done',
      result: {
        summary:
          'Used chapter spans with template rationales after model failure',
        state: 'suggestions',
        modelError: ranked.code,
      },
      usage: null,
      finished_at: nowIso(deps),
    });

    return {
      ok: true,
      status: 200,
      state: 'suggestions',
      jobId: job.id,
      reused: false,
      suggestions: inserted.suggestions,
    };
  }

  const grounded = selectKnownChapterSpans(parsed.chapters, ranked.data);
  if (grounded.length === 0) {
    await updateSuggestionJob(deps.db, job.id, {
      status: 'succeeded',
      phase: 'done',
      result: {
        summary: 'Model selected no valid chapter spans',
        state: 'no_chapters',
      },
      usage: ranked.usage || null,
      finished_at: nowIso(deps),
    });
    return {
      ok: true,
      status: 200,
      state: 'no_chapters',
      jobId: job.id,
      reused: false,
      suggestions: [],
      message:
        'No usable chapter suggestions. You can mark practice intervals manually.',
    };
  }

  const inserted = await persistSuggestions(
    deps.db,
    ownerId,
    pathVideoId,
    job.id,
    grounded
  );
  if (!inserted.ok) {
    await updateSuggestionJob(deps.db, job.id, {
      status: 'failed',
      phase: 'done',
      error: { code: 'persist_failed', message: inserted.error },
      finished_at: nowIso(deps),
    });
    return { ok: false, status: 500, error: inserted.error };
  }

  await updateSuggestionJob(deps.db, job.id, {
    status: 'succeeded',
    phase: 'done',
    result: {
      summary: `Suggested ${inserted.suggestions.length} practice intervals`,
      state: 'suggestions',
    },
    usage: ranked.usage || null,
    finished_at: nowIso(deps),
  });

  return {
    ok: true,
    status: 200,
    state: 'suggestions',
    jobId: job.id,
    reused: false,
    suggestions: inserted.suggestions,
  };
}

async function persistSuggestions(
  db: DbClient,
  ownerId: string,
  pathVideoId: string,
  jobId: string,
  spans: Array<ParsedChapter & { rationale: string }>
): Promise<
  | { ok: true; suggestions: IntervalSuggestionPublic[] }
  | { ok: false; error: string }
> {
  const rows = spans.map((span) => ({
    owner: ownerId,
    path_video_id: pathVideoId,
    path_job_id: jobId,
    label: span.label.slice(0, 100),
    start_time: span.startTime,
    end_time: span.endTime,
    rationale: span.rationale.slice(0, 1000),
  }));

  const { data, error } = await db
    .from('interval_suggestions')
    .insert(rows)
    .select('*');

  if (error) {
    console.error('persistSuggestions error:', error);
    return { ok: false, error: 'Failed to store suggestions' };
  }

  return {
    ok: true,
    suggestions: ((data || []) as IntervalSuggestionRecord[]).map(
      toIntervalSuggestionPublic
    ),
  };
}

export async function listOwnedIntervalSuggestions(
  db: DbClient,
  ownerId: string,
  pathId: string,
  pathVideoId: string
): Promise<
  | { ok: true; suggestions: IntervalSuggestionPublic[] }
  | { ok: false; status: 404 | 409 | 500; error: string }
> {
  const owned = await getOwnedPath(db, ownerId, pathId);
  if (!owned.ok) {
    return { ok: false, status: owned.status, error: owned.error };
  }

  const detail = await loadOwnedPathDetail(db, ownerId, pathId);
  if (!detail.ok) {
    return { ok: false, status: detail.status, error: detail.error };
  }

  if (!findVideoInRevision(detail.stages, pathVideoId)) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const { data, error } = await db
    .from('interval_suggestions')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_video_id', pathVideoId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listOwnedIntervalSuggestions error:', error);
    return { ok: false, status: 500, error: 'Failed to load suggestions' };
  }

  // Latest job's suggestions first — group by newest job id.
  const rows = (data || []) as IntervalSuggestionRecord[];
  if (rows.length === 0) {
    return { ok: true, suggestions: [] };
  }
  const latestJobId = rows[0].path_job_id;
  const latest = rows
    .filter((row) => row.path_job_id === latestJobId)
    .sort((a, b) => a.start_time - b.start_time);

  return { ok: true, suggestions: latest.map(toIntervalSuggestionPublic) };
}

export type AcceptIntervalSuggestionsResult =
  | {
      ok: true;
      status: 200;
      accepted: Array<{
        suggestionId: string;
        created: boolean;
        interval: {
          id: string;
          userId: string;
          videoId: string;
          name: string | null;
          startTime: number;
          endTime: number;
          orderIndex: number;
          createdAt: string;
          updatedAt: string;
        };
      }>;
      preservedManualCount: number;
    }
  | {
      ok: false;
      status: 400 | 404 | 409 | 500;
      error: string;
      code?: string;
    };

export async function acceptOwnedIntervalSuggestions(
  db: DbClient,
  ownerId: string,
  pathId: string,
  pathVideoId: string,
  suggestionIds: string[]
): Promise<AcceptIntervalSuggestionsResult> {
  const owned = await getOwnedPath(db, ownerId, pathId);
  if (!owned.ok) {
    return { ok: false, status: owned.status, error: owned.error };
  }

  const detail = await loadOwnedPathDetail(db, ownerId, pathId);
  if (!detail.ok) {
    return { ok: false, status: detail.status, error: detail.error };
  }

  const membership = findVideoInRevision(detail.stages, pathVideoId);
  if (!membership) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const youtubeVideoId =
    membership.stage.videos[membership.videoIndex].youtube_video_id;

  const uniqueIds = [...new Set(suggestionIds)];

  const { data: beforeIntervals, error: beforeError } = await db
    .from('video_intervals')
    .select('id')
    .eq('user_id', ownerId)
    .eq('video_id', youtubeVideoId);

  if (beforeError) {
    console.error('accept suggestions load intervals error:', beforeError);
    return {
      ok: false,
      status: 500,
      error: 'Failed to load existing intervals',
    };
  }

  const beforeIds = new Set(
    (beforeIntervals || []).map((row: { id: string }) => row.id)
  );

  const acceptedList: Extract<
    AcceptIntervalSuggestionsResult,
    { ok: true }
  >['accepted'] = [];

  for (const suggestionId of uniqueIds) {
    const { data: suggestionRow, error: suggestionError } = await db
      .from('interval_suggestions')
      .select('id, path_video_id, path_job_id, start_time, end_time, label')
      .eq('id', suggestionId)
      .eq('owner', ownerId)
      .maybeSingle();

    if (suggestionError || !suggestionRow) {
      return { ok: false, status: 404, error: 'Suggestion not found' };
    }
    if (suggestionRow.path_video_id !== pathVideoId) {
      return {
        ok: false,
        status: 404,
        error: 'Suggestion not found for this path video',
        code: 'foreign_id',
      };
    }

    const { data: jobRow, error: jobError } = await db
      .from('path_jobs')
      .select('id, path_id, kind, owner')
      .eq('id', suggestionRow.path_job_id)
      .eq('owner', ownerId)
      .maybeSingle();

    if (jobError || !jobRow) {
      return {
        ok: false,
        status: 404,
        error: 'Suggestion job not found',
        code: 'job_not_found',
      };
    }
    if (jobRow.path_id !== pathId || jobRow.kind !== 'interval_suggestions') {
      return {
        ok: false,
        status: 404,
        error: 'Suggestion not linked to this path',
        code: 'job_path_mismatch',
      };
    }

    const { data, error } = await db.rpc('accept_interval_suggestion', {
      p_owner: ownerId,
      p_suggestion_id: suggestionId,
      p_youtube_video_id: youtubeVideoId,
    });

    if (error) {
      console.error('accept_interval_suggestion rpc error:', error);
      return { ok: false, status: 500, error: 'Failed to accept suggestion' };
    }

    const payload = data as {
      ok?: boolean;
      code?: string;
      created?: boolean;
      suggestion_id?: string;
      interval?: {
        id: string;
        user_id: string;
        video_id: string;
        name: string | null;
        start_time: number;
        end_time: number;
        order_index: number;
        created_at: string;
        updated_at: string;
      };
    };

    if (!payload?.ok || !payload.interval) {
      return {
        ok: false,
        status: 404,
        error: 'Suggestion not found',
        code: payload?.code || 'not_found',
      };
    }

    // Accepted spans must match the stored suggestion (known chapter bounds).
    if (
      payload.interval.start_time !== suggestionRow.start_time ||
      payload.interval.end_time !== suggestionRow.end_time
    ) {
      return {
        ok: false,
        status: 500,
        error: 'Accepted interval bounds do not match suggestion',
        code: 'bounds_mismatch',
      };
    }

    acceptedList.push({
      suggestionId: payload.suggestion_id || suggestionId,
      created: Boolean(payload.created),
      interval: {
        id: payload.interval.id,
        userId: payload.interval.user_id,
        videoId: payload.interval.video_id,
        name: payload.interval.name,
        startTime: payload.interval.start_time,
        endTime: payload.interval.end_time,
        orderIndex: payload.interval.order_index,
        createdAt: payload.interval.created_at,
        updatedAt: payload.interval.updated_at,
      },
    });
  }

  const { data: afterIntervals, error: afterError } = await db
    .from('video_intervals')
    .select('id')
    .eq('user_id', ownerId)
    .eq('video_id', youtubeVideoId);

  if (afterError) {
    console.error('accept suggestions after-load error:', afterError);
    return { ok: false, status: 500, error: 'Failed to verify intervals' };
  }

  const afterIds = new Set(
    (afterIntervals || []).map((row: { id: string }) => row.id)
  );
  let preservedManualCount = 0;
  for (const id of beforeIds) {
    if (afterIds.has(id)) {
      preservedManualCount += 1;
    }
  }

  return {
    ok: true,
    status: 200,
    accepted: acceptedList,
    preservedManualCount,
  };
}
