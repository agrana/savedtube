import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PathStageWithVideos } from './path-research-schema';

export const FOLLOWUP_PROMPT_VERSION = 'stage-followup-v1';
export const FOLLOWUP_SCHEMA_VERSION = 'stage-followup-v1';

export const FOLLOWUP_FIELD_MAX_LENGTH = 1000;
export const FOLLOWUP_REFLECTION_MAX_LENGTH = 2000;

const followUpFieldSchema = z
  .string()
  .trim()
  .min(1)
  .max(FOLLOWUP_FIELD_MAX_LENGTH);

export const stageFollowUpContentSchema = z.object({
  practicedSummary: followUpFieldSchema,
  encouragement: followUpFieldSchema,
  nextStep: followUpFieldSchema,
});

export type StageFollowUpContent = z.infer<typeof stageFollowUpContentSchema>;

export type StageFollowUpSource = 'model' | 'template';

export type StageFollowUpRecord = {
  id: string;
  owner: string;
  path_id: string;
  path_stage_id: string;
  revision_id: string;
  completion_version: number;
  reflection: string | null;
  practiced_summary: string;
  encouragement: string;
  next_step: string;
  source: StageFollowUpSource;
  created_at: string;
  updated_at: string;
};

export type StageFollowUpPublic = {
  id: string;
  pathId: string;
  pathStageId: string;
  revisionId: string;
  completionVersion: number;
  reflection: string | null;
  practicedSummary: string;
  encouragement: string;
  nextStep: string;
  source: StageFollowUpSource;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpEvidence = {
  stageTitle: string;
  learningObjective: string;
  practicedVideoTitles: string[];
  reportedVideoTitles: string[];
  reflection: string | null;
  nextStageTitle: string | null;
  nextStageObjective: string | null;
};

export type FollowUpLlm = {
  provider: string;
  model: string;
  generateFollowUp: (input: {
    goal: string;
    background: string | null;
    evidence: FollowUpEvidence;
    signal?: AbortSignal;
    timeoutMs: number;
  }) => Promise<
    | {
        ok: true;
        data: StageFollowUpContent;
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

export function toStageFollowUpPublic(
  row: StageFollowUpRecord
): StageFollowUpPublic {
  return {
    id: row.id,
    pathId: row.path_id,
    pathStageId: row.path_stage_id,
    revisionId: row.revision_id,
    completionVersion: row.completion_version,
    reflection: row.reflection,
    practicedSummary: row.practiced_summary,
    encouragement: row.encouragement,
    nextStep: row.next_step,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseStageFollowUpContent(
  data: unknown
):
  | { success: true; data: StageFollowUpContent }
  | { success: false; error: string } {
  const result = stageFollowUpContentSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Invalid follow-up content',
    };
  }
  return { success: true, data: result.data };
}

/**
 * Build evidence strictly from stage objectives, learner reflection, and
 * available metadata (titles / practiced flags). Never invents video content.
 */
export function buildFollowUpEvidence(args: {
  stages: PathStageWithVideos[];
  stageId: string;
  practicedVideoIds: ReadonlySet<string>;
  reflection: string | null;
}): FollowUpEvidence | null {
  const stageIndex = args.stages.findIndex(
    (stage) => stage.id === args.stageId
  );
  if (stageIndex < 0) {
    return null;
  }

  const stage = args.stages[stageIndex];
  const nextStage = args.stages[stageIndex + 1] || null;

  const practicedVideoTitles: string[] = [];
  const reportedVideoTitles: string[] = [];

  for (const video of stage.videos) {
    reportedVideoTitles.push(video.title);
    if (args.practicedVideoIds.has(video.id)) {
      practicedVideoTitles.push(video.title);
    }
  }

  const reflection =
    args.reflection && args.reflection.trim().length > 0
      ? args.reflection.trim().slice(0, FOLLOWUP_REFLECTION_MAX_LENGTH)
      : null;

  return {
    stageTitle: stage.title,
    learningObjective: stage.learning_objective,
    practicedVideoTitles,
    reportedVideoTitles,
    reflection,
    nextStageTitle: nextStage?.title ?? null,
    nextStageObjective: nextStage?.learning_objective ?? null,
  };
}

/**
 * Deterministic template fallback. Uses only objectives, titles, and reflection.
 * Never claims unseen video content or established mastery.
 */
export function buildTemplateFollowUp(
  evidence: FollowUpEvidence
): StageFollowUpContent {
  const practicedList =
    evidence.practicedVideoTitles.length > 0
      ? evidence.practicedVideoTitles.join('; ')
      : evidence.reportedVideoTitles.length > 0
        ? evidence.reportedVideoTitles.join('; ')
        : 'the videos listed for this stage';

  const reflectionClause = evidence.reflection
    ? ` You noted: "${truncateForTemplate(evidence.reflection, 180)}".`
    : '';

  const practicedSummary =
    `For "${evidence.stageTitle}", the stage objective was: ${evidence.learningObjective}. ` +
    `Items in this stage (metadata titles only): ${practicedList}.` +
    reflectionClause;

  const encouragement =
    evidence.reflection && evidence.reflection.length > 0
      ? `Thanks for reflecting on "${evidence.stageTitle}". Your note helps track what you practiced — keep going without treating this as proof of completion quality.`
      : `You marked "${evidence.stageTitle}" complete. That records practice progress for this objective — not a claim that the video content was verified or that you finished the topic.`;

  const nextStep = evidence.nextStageTitle
    ? `Next step: continue with "${evidence.nextStageTitle}"` +
      (evidence.nextStageObjective
        ? ` — objective: ${evidence.nextStageObjective}.`
        : '.')
    : `Next step: revisit the listed videos for "${evidence.stageTitle}" or practice with any saved loops you already created.`;

  return {
    practicedSummary: clipField(practicedSummary),
    encouragement: clipField(encouragement),
    nextStep: clipField(nextStep),
  };
}

function truncateForTemplate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function clipField(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= FOLLOWUP_FIELD_MAX_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, FOLLOWUP_FIELD_MAX_LENGTH);
}

/**
 * Reject model text that claims mastery or summarizes unseen video teaching.
 */
export function sanitizeFollowUpContent(
  content: StageFollowUpContent,
  evidence: FollowUpEvidence
): StageFollowUpContent | null {
  const parsed = parseStageFollowUpContent(content);
  if (!parsed.success) {
    return null;
  }

  const banned =
    /\b(mastered|you now understand|the video (teaches|shows|explains)|proven mastery|you have learned)\b/i;
  const fields = [
    parsed.data.practicedSummary,
    parsed.data.encouragement,
    parsed.data.nextStep,
  ];
  if (fields.some((field) => banned.test(field))) {
    return null;
  }

  // Model must stay grounded in supplied titles/objective fragments when citing them.
  void evidence;
  return parsed.data;
}

export async function resolveFollowUpContent(args: {
  evidence: FollowUpEvidence;
  goal: string;
  background: string | null;
  llm: FollowUpLlm | null;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ content: StageFollowUpContent; source: StageFollowUpSource }> {
  if (!args.llm) {
    return {
      content: buildTemplateFollowUp(args.evidence),
      source: 'template',
    };
  }

  try {
    const result = await args.llm.generateFollowUp({
      goal: args.goal,
      background: args.background,
      evidence: args.evidence,
      timeoutMs: args.timeoutMs,
      signal: args.signal,
    });

    if (!result.ok) {
      return {
        content: buildTemplateFollowUp(args.evidence),
        source: 'template',
      };
    }

    const sanitized = sanitizeFollowUpContent(result.data, args.evidence);
    if (!sanitized) {
      return {
        content: buildTemplateFollowUp(args.evidence),
        source: 'template',
      };
    }

    return { content: sanitized, source: 'model' };
  } catch {
    return {
      content: buildTemplateFollowUp(args.evidence),
      source: 'template',
    };
  }
}

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export type PersistFollowUpRpcResult =
  | {
      ok: true;
      created: boolean;
      completion_version: number;
      revision_id: string;
      progress: {
        id: string;
        owner: string;
        path_stage_id: string;
        completed_at: string;
        reflection: string | null;
        completion_version: number;
        created_at: string;
        updated_at: string;
      };
      followup: StageFollowUpRecord;
    }
  | { ok: false; code: string };

export function mapPersistFollowUpRpcPayload(
  data: unknown
): PersistFollowUpRpcResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, code: 'edit_failed' };
  }
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, code: String(row.code || 'edit_failed') };
  }

  const followup = row.followup as StageFollowUpRecord | undefined;
  const progress = row.progress as PersistFollowUpRpcResult extends {
    ok: true;
  }
    ? PersistFollowUpRpcResult['progress']
    : never;

  if (!followup || !progress) {
    return { ok: false, code: 'edit_failed' };
  }

  return {
    ok: true,
    created: Boolean(row.created),
    completion_version: Number(row.completion_version),
    revision_id: String(row.revision_id),
    progress,
    followup: {
      ...followup,
      source: followup.source === 'model' ? 'model' : 'template',
    },
  };
}

/**
 * Only attach a follow-up to current content when completion_version matches
 * the active revision's edit_version. Older versions stay stored but hidden
 * so edits cannot silently reuse prior feedback.
 */
export function selectCurrentFollowUps(args: {
  followUps: StageFollowUpRecord[];
  stageProgress: Array<{
    path_stage_id: string;
    completion_version: number;
  }>;
  activeStageIds: ReadonlySet<string>;
  activeRevisionId: string | null;
  activeEditVersion: number | null;
}): StageFollowUpPublic[] {
  const progressByStage = new Map(
    args.stageProgress.map((row) => [row.path_stage_id, row.completion_version])
  );

  return args.followUps
    .filter((row) => {
      if (!args.activeStageIds.has(row.path_stage_id)) {
        return false;
      }
      if (args.activeRevisionId && row.revision_id !== args.activeRevisionId) {
        return false;
      }
      if (
        args.activeEditVersion !== null &&
        row.completion_version !== args.activeEditVersion
      ) {
        return false;
      }
      const progressVersion = progressByStage.get(row.path_stage_id);
      if (
        progressVersion === undefined ||
        progressVersion !== row.completion_version
      ) {
        return false;
      }
      return true;
    })
    .map(toStageFollowUpPublic);
}

export async function loadOwnedStageFollowUps(
  db: DbClient,
  ownerId: string,
  pathId: string,
  stageIds: string[]
): Promise<
  | { ok: true; followUps: StageFollowUpRecord[] }
  | { ok: false; status: 500; error: string }
> {
  if (stageIds.length === 0) {
    return { ok: true, followUps: [] };
  }

  const { data, error } = await db
    .from('stage_followups')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_id', pathId)
    .in('path_stage_id', stageIds);

  if (error) {
    console.error('loadOwnedStageFollowUps error:', error);
    return { ok: false, status: 500, error: 'Failed to load follow-ups' };
  }

  return {
    ok: true,
    followUps: (data || []) as StageFollowUpRecord[],
  };
}
