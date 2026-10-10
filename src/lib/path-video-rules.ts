import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DISMISSAL_ASSESSMENT_CLASSIFICATIONS,
  type DismissalAssessmentClassification,
} from './path-dismissal-assessment';
import { youtubeVideoIdSchema } from './path-research-schema';
import { isConflictError } from './paths';

/**
 * Executable global-rule registry (reviewer activation workflow).
 * Closed structured predicates only. Explicitly active rules are applied by the
 * research pipeline; soft-dismiss presentation filters remain untouched.
 * LLM assessment status never activates a rule by itself — only an allowlisted
 * reviewer explicit request does.
 */

export const PATH_VIDEO_RULE_TARGET_TYPES = [
  'video',
  'creator',
  'topic',
  'language',
  'difficulty',
] as const;

export type PathVideoRuleTargetType =
  (typeof PATH_VIDEO_RULE_TARGET_TYPES)[number];

export const PATH_VIDEO_RULE_OPERATORS = ['equals'] as const;
export type PathVideoRuleOperator = (typeof PATH_VIDEO_RULE_OPERATORS)[number];

export const PATH_VIDEO_RULE_ACTIONS = ['exclude'] as const;
export type PathVideoRuleAction = (typeof PATH_VIDEO_RULE_ACTIONS)[number];

export const PATH_VIDEO_RULE_STATUSES = [
  'draft',
  'active',
  'suspended',
  'retired',
] as const;

export type PathVideoRuleStatus = (typeof PATH_VIDEO_RULE_STATUSES)[number];

export const PATH_VIDEO_RULE_STATUS_TRANSITIONS = [
  'active',
  'suspended',
  'retired',
] as const;

export type PathVideoRuleStatusTransition =
  (typeof PATH_VIDEO_RULE_STATUS_TRANSITIONS)[number];

export const PATH_VIDEO_RULE_KEY_MAX_LENGTH = 128;
export const PATH_VIDEO_RULE_VALUE_MAX_LENGTH = 300;
export const PATH_VIDEO_RULE_REASON_MAX_LENGTH = 500;

/** Classifications that block global activation unless narrowed to a draft. */
export const PATH_VIDEO_RULE_RESTRICTED_CANDIDATE_CLASSIFICATIONS = [
  'subjective_preference',
  'suspicious_or_injection',
] as const satisfies readonly DismissalAssessmentClassification[];

export type PathVideoRuleRestrictedClassification =
  (typeof PATH_VIDEO_RULE_RESTRICTED_CANDIDATE_CLASSIFICATIONS)[number];

/** Presentation surfaces that must not apply path_video_rules. */
export const PATH_VIDEO_RULE_UNTOUCHED_GENERATION_SURFACES = [
  'path-dismissal-filter',
] as const;

const uuidSchema = z.string().uuid('Invalid ID format');

const ruleKeySchema = z
  .string()
  .trim()
  .min(1, 'ruleKey is required')
  .max(
    PATH_VIDEO_RULE_KEY_MAX_LENGTH,
    `ruleKey must be at most ${PATH_VIDEO_RULE_KEY_MAX_LENGTH} characters`
  )
  .regex(
    /^[a-z0-9][a-z0-9._:-]{0,127}$/,
    'ruleKey must be lowercase alphanumeric with . _ : -'
  );

const ruleValueSchema = z
  .string()
  .trim()
  .min(1, 'value is required')
  .max(
    PATH_VIDEO_RULE_VALUE_MAX_LENGTH,
    `value must be at most ${PATH_VIDEO_RULE_VALUE_MAX_LENGTH} characters`
  );

const ruleReasonSchema = z
  .string()
  .trim()
  .min(1, 'reason is required')
  .max(
    PATH_VIDEO_RULE_REASON_MAX_LENGTH,
    `reason must be at most ${PATH_VIDEO_RULE_REASON_MAX_LENGTH} characters`
  );

/**
 * Explicit structured rule proposal from an allowlisted reviewer.
 * Free-text predicates / unknown keys are rejected (.strict).
 * activate defaults false; only true triggers activation + activated_by.
 * narrowToNonGlobalDraft is required for subjective/suspicious candidates.
 */
export const pathVideoRuleProposalSchema = z
  .object({
    sourceCandidateId: uuidSchema,
    ruleKey: ruleKeySchema,
    targetType: z.enum(PATH_VIDEO_RULE_TARGET_TYPES, {
      errorMap: () => ({ message: 'Invalid targetType' }),
    }),
    operator: z.literal('equals'),
    value: ruleValueSchema,
    action: z.literal('exclude'),
    reason: ruleReasonSchema,
    activate: z.boolean().optional().default(false),
    narrowToNonGlobalDraft: z.boolean().optional().default(false),
    reviewDueAt: z
      .string()
      .datetime({ offset: true, message: 'Invalid reviewDueAt' })
      .optional()
      .nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.targetType === 'video') {
      const youtube = youtubeVideoIdSchema.safeParse(data.value);
      if (!youtube.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'value must be a valid YouTube video id for targetType video',
          path: ['value'],
        });
      }
    }
    if (data.activate && data.narrowToNonGlobalDraft) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Cannot activate while narrowToNonGlobalDraft is true; create a draft only',
        path: ['activate'],
      });
    }
  });

export type PathVideoRuleProposalInput = z.infer<
  typeof pathVideoRuleProposalSchema
>;

export const pathVideoRuleStatusUpdateSchema = z
  .object({
    status: z.enum(PATH_VIDEO_RULE_STATUS_TRANSITIONS, {
      errorMap: () => ({ message: 'Invalid status transition' }),
    }),
    reviewDueAt: z
      .string()
      .datetime({ offset: true, message: 'Invalid reviewDueAt' })
      .optional()
      .nullable(),
  })
  .strict();

export type PathVideoRuleStatusUpdateInput = z.infer<
  typeof pathVideoRuleStatusUpdateSchema
>;

/** Row shape matching public.path_video_rules. */
export type PathVideoRuleRecord = {
  id: string;
  source_candidate_id: string;
  rule_key: string;
  target_type: PathVideoRuleTargetType;
  operator: PathVideoRuleOperator;
  value: string;
  action: PathVideoRuleAction;
  reason: string;
  status: PathVideoRuleStatus;
  version: number;
  activated_by: string | null;
  activated_at: string | null;
  review_due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PathVideoRulePublic = {
  id: string;
  sourceCandidateId: string;
  ruleKey: string;
  targetType: PathVideoRuleTargetType;
  operator: PathVideoRuleOperator;
  value: string;
  action: PathVideoRuleAction;
  reason: string;
  status: PathVideoRuleStatus;
  version: number;
  activatedBy: string | null;
  activatedAt: string | null;
  reviewDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbClient = Pick<SupabaseClient, 'from'>;

type ReviewCandidateRow = {
  id: string;
  status: string;
  assessment_notes: string | null;
};

/**
 * Only an explicitly active registry row qualifies for research exclusion.
 * Draft / suspended / retired and LLM assessment status never qualify.
 */
export function isPathVideoRuleActiveForPathGeneration(
  status: PathVideoRuleStatus
): boolean {
  return status === 'active';
}

export function toPathVideoRulePublic(
  row: PathVideoRuleRecord
): PathVideoRulePublic {
  return {
    id: row.id,
    sourceCandidateId: row.source_candidate_id,
    ruleKey: row.rule_key,
    targetType: row.target_type,
    operator: row.operator,
    value: row.value,
    action: row.action,
    reason: row.reason,
    status: row.status,
    version: row.version,
    activatedBy: row.activated_by,
    activatedAt: row.activated_at,
    reviewDueAt: row.review_due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parsePathVideoRuleProposalBody(
  body: unknown
):
  | { success: true; data: PathVideoRuleProposalInput }
  | { success: false; error: string } {
  const result = pathVideoRuleProposalSchema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Validation failed',
    };
  }
  return { success: true, data: result.data };
}

export function parsePathVideoRuleStatusUpdateBody(
  body: unknown
):
  | { success: true; data: PathVideoRuleStatusUpdateInput }
  | { success: false; error: string } {
  const result = pathVideoRuleStatusUpdateSchema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Validation failed',
    };
  }
  return { success: true, data: result.data };
}

/**
 * Extract advisory assessment classification from candidate notes when present.
 * Malformed notes are treated as absent (do not invent restrictions).
 */
export function extractCandidateAssessmentClassification(
  assessmentNotes: string | null | undefined
): DismissalAssessmentClassification | null {
  if (assessmentNotes == null || assessmentNotes.trim().length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(assessmentNotes);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const classification = (parsed as { classification?: unknown })
      .classification;
    if (
      typeof classification === 'string' &&
      (DISMISSAL_ASSESSMENT_CLASSIFICATIONS as readonly string[]).includes(
        classification
      )
    ) {
      return classification as DismissalAssessmentClassification;
    }
    return null;
  } catch {
    return null;
  }
}

export function isRestrictedCandidateClassification(
  classification: DismissalAssessmentClassification | null
): classification is PathVideoRuleRestrictedClassification {
  if (classification == null) {
    return false;
  }
  return (
    PATH_VIDEO_RULE_RESTRICTED_CANDIDATE_CLASSIFICATIONS as readonly string[]
  ).includes(classification);
}

/**
 * Subjective/suspicious candidates may only become an explicit non-global draft.
 * Activation of such candidates is always rejected.
 */
export function evaluateRestrictedCandidateRuleProposal(input: {
  classification: DismissalAssessmentClassification | null;
  activate: boolean;
  narrowToNonGlobalDraft: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (!isRestrictedCandidateClassification(input.classification)) {
    return { ok: true };
  }

  if (input.activate) {
    return {
      ok: false,
      error:
        'Subjective or suspicious candidates cannot activate a global rule; create a narrowed non-global draft instead',
    };
  }

  if (!input.narrowToNonGlobalDraft) {
    return {
      ok: false,
      error:
        'Subjective or suspicious candidates require narrowToNonGlobalDraft for a non-global draft',
    };
  }

  return { ok: true };
}

async function loadReviewCandidate(
  db: DbClient,
  candidateId: string
): Promise<
  | { ok: true; candidate: ReviewCandidateRow }
  | { ok: false; status: 404 | 500; error: string }
> {
  const { data, error } = await db
    .from('path_video_dismissal_review_candidates')
    .select('id, status, assessment_notes')
    .eq('id', candidateId)
    .maybeSingle();

  if (error) {
    console.error('loadReviewCandidate for rule error:', error);
    return { ok: false, status: 500, error: 'Failed to load review candidate' };
  }

  if (!data) {
    return { ok: false, status: 404, error: 'Review candidate not found' };
  }

  return { ok: true, candidate: data as ReviewCandidateRow };
}

async function nextRuleVersion(
  db: DbClient,
  ruleKey: string
): Promise<
  { ok: true; version: number } | { ok: false; status: 500; error: string }
> {
  const { data, error } = await db
    .from('path_video_rules')
    .select('version')
    .eq('rule_key', ruleKey)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('nextRuleVersion error:', error);
    return { ok: false, status: 500, error: 'Failed to resolve rule version' };
  }

  const current = (data as { version?: number } | null)?.version;
  if (typeof current === 'number' && Number.isFinite(current) && current >= 1) {
    return { ok: true, version: Math.floor(current) + 1 };
  }
  return { ok: true, version: 1 };
}

async function loadRuleById(
  db: DbClient,
  ruleId: string
): Promise<
  | { ok: true; rule: PathVideoRuleRecord }
  | { ok: false; status: 404 | 500; error: string }
> {
  const { data, error } = await db
    .from('path_video_rules')
    .select('*')
    .eq('id', ruleId)
    .maybeSingle();

  if (error) {
    console.error('loadRuleById error:', error);
    return { ok: false, status: 500, error: 'Failed to load path video rule' };
  }

  if (!data) {
    return { ok: false, status: 404, error: 'Path video rule not found' };
  }

  return { ok: true, rule: data as PathVideoRuleRecord };
}

export type ProposePathVideoRuleResult =
  | {
      ok: true;
      created: true;
      rule: PathVideoRulePublic;
      activeForPathGeneration: boolean;
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

/**
 * Create a draft (default) or activate a rule when the reviewer explicitly
 * requests activation. Never derives activation from LLM assessment status.
 */
export async function proposePathVideoRule(
  db: DbClient,
  reviewerId: string,
  proposal: PathVideoRuleProposalInput,
  options?: { now?: Date }
): Promise<ProposePathVideoRuleResult> {
  const trimmedReviewer = reviewerId.trim();
  if (!trimmedReviewer) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to create path video rule',
    };
  }

  const candidateResult = await loadReviewCandidate(
    db,
    proposal.sourceCandidateId
  );
  if (!candidateResult.ok) {
    return candidateResult;
  }

  const classification = extractCandidateAssessmentClassification(
    candidateResult.candidate.assessment_notes
  );
  const restricted = evaluateRestrictedCandidateRuleProposal({
    classification,
    activate: proposal.activate,
    narrowToNonGlobalDraft: proposal.narrowToNonGlobalDraft,
  });
  if (!restricted.ok) {
    return { ok: false, status: 400, error: restricted.error };
  }

  const versionResult = await nextRuleVersion(db, proposal.ruleKey);
  if (!versionResult.ok) {
    return versionResult;
  }

  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();
  const activating = proposal.activate === true;

  const insertPayload = {
    source_candidate_id: proposal.sourceCandidateId,
    rule_key: proposal.ruleKey,
    target_type: proposal.targetType,
    operator: proposal.operator,
    value: proposal.value,
    action: proposal.action,
    reason: proposal.reason,
    status: activating ? ('active' as const) : ('draft' as const),
    version: versionResult.version,
    activated_by: activating ? trimmedReviewer : null,
    activated_at: activating ? nowIso : null,
    review_due_at: proposal.reviewDueAt ?? null,
  };

  const { data: inserted, error: insertError } = await db
    .from('path_video_rules')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    if (isConflictError(insertError)) {
      return {
        ok: false,
        status: 409,
        error: 'Active rule key conflict or version conflict',
      };
    }
    console.error('proposePathVideoRule insert error:', insertError);
    return {
      ok: false,
      status: 500,
      error: 'Failed to create path video rule',
    };
  }

  if (!inserted) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to create path video rule',
    };
  }

  // Candidate assessment status is intentionally left untouched.
  void candidateResult.candidate.status;

  const rule = toPathVideoRulePublic(inserted as PathVideoRuleRecord);
  return {
    ok: true,
    created: true,
    rule,
    activeForPathGeneration: isPathVideoRuleActiveForPathGeneration(
      rule.status
    ),
  };
}

export type ListPathVideoRulesResult =
  | { ok: true; rules: PathVideoRulePublic[] }
  | { ok: false; status: 500; error: string };

export async function listPathVideoRules(
  db: DbClient,
  options?: { status?: PathVideoRuleStatus }
): Promise<ListPathVideoRulesResult> {
  let query = db
    .from('path_video_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('listPathVideoRules error:', error);
    return { ok: false, status: 500, error: 'Failed to list path video rules' };
  }

  const rows = (data as PathVideoRuleRecord[] | null) || [];
  return { ok: true, rules: rows.map(toPathVideoRulePublic) };
}

export type TransitionPathVideoRuleStatusResult =
  | {
      ok: true;
      rule: PathVideoRulePublic;
      activeForPathGeneration: boolean;
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

/**
 * Approve (activate), suspend, or retire via status/version — never deletion.
 * Activation always records activated_by from the allowlisted reviewer session.
 */
export async function transitionPathVideoRuleStatus(
  db: DbClient,
  reviewerId: string,
  ruleId: string,
  update: PathVideoRuleStatusUpdateInput,
  options?: { now?: Date }
): Promise<TransitionPathVideoRuleStatusResult> {
  const trimmedReviewer = reviewerId.trim();
  if (!trimmedReviewer) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to update path video rule',
    };
  }

  const existing = await loadRuleById(db, ruleId);
  if (!existing.ok) {
    return existing;
  }

  const rule = existing.rule;
  const nextStatus = update.status;

  if (rule.status === nextStatus) {
    const publicRule = toPathVideoRulePublic(rule);
    return {
      ok: true,
      rule: publicRule,
      activeForPathGeneration: isPathVideoRuleActiveForPathGeneration(
        publicRule.status
      ),
    };
  }

  if (rule.status === 'retired' && nextStatus !== 'retired') {
    return {
      ok: false,
      status: 400,
      error:
        'Retired rules cannot be reactivated; create a new version instead',
    };
  }

  if (nextStatus === 'active') {
    const candidateResult = await loadReviewCandidate(
      db,
      rule.source_candidate_id
    );
    if (!candidateResult.ok) {
      return candidateResult;
    }
    const classification = extractCandidateAssessmentClassification(
      candidateResult.candidate.assessment_notes
    );
    if (isRestrictedCandidateClassification(classification)) {
      return {
        ok: false,
        status: 400,
        error:
          'Subjective or suspicious candidates cannot activate a global rule',
      };
    }
  }

  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();

  const patch: Record<string, unknown> = {
    status: nextStatus,
  };

  if (update.reviewDueAt !== undefined) {
    patch.review_due_at = update.reviewDueAt;
  }

  if (nextStatus === 'active') {
    patch.activated_by = trimmedReviewer;
    patch.activated_at = nowIso;
  }

  const { data: updated, error: updateError } = await db
    .from('path_video_rules')
    .update(patch)
    .eq('id', ruleId)
    .select('*')
    .single();

  if (updateError) {
    if (isConflictError(updateError)) {
      return {
        ok: false,
        status: 409,
        error: 'Active rule key conflict',
      };
    }
    console.error('transitionPathVideoRuleStatus error:', updateError);
    return {
      ok: false,
      status: 500,
      error: 'Failed to update path video rule',
    };
  }

  if (!updated) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to update path video rule',
    };
  }

  const publicRule = toPathVideoRulePublic(updated as PathVideoRuleRecord);
  return {
    ok: true,
    rule: publicRule,
    activeForPathGeneration: isPathVideoRuleActiveForPathGeneration(
      publicRule.status
    ),
  };
}
