import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PathVideoDismissalPublic,
  PathVideoDismissalReason,
} from './path-dismissals';
import { isConflictError } from './paths';

/**
 * Broader-feedback review-candidate pipeline (slice 1).
 * Creates an explicit, inactive review candidate when an active dismissal has
 * broaderFeedback=true. Does not call an LLM, activate rules, or affect path
 * generation / soft-dismiss presentation filters.
 */

export const PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_STATUSES = [
  'pending',
  'assessing',
  'approved',
  'rejected',
  'quarantined',
  'retired',
] as const;

export type PathVideoDismissalReviewCandidateStatus =
  (typeof PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_STATUSES)[number];

/** Deterministic initial evidence for a newly queued broader-feedback report. */
export const PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_SUPPORTING_EVIDENCE = 1;
export const PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_CONTRADICTING_EVIDENCE = 0;

/** Default status for a newly created candidate; inactive for path generation. */
export const PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_STATUS: PathVideoDismissalReviewCandidateStatus =
  'pending';

export type PathVideoDismissalReviewCandidateRecord = {
  id: string;
  dismissal_id: string;
  owner: string;
  path_id: string;
  path_video_id: string;
  youtube_video_id: string;
  reason: PathVideoDismissalReason;
  status: PathVideoDismissalReviewCandidateStatus;
  supporting_evidence_count: number;
  contradicting_evidence_count: number;
  created_at: string;
  updated_at: string;
  assessed_at: string | null;
  reviewer_id: string | null;
  model_id: string | null;
  prompt_version: string | null;
  assessment_notes: string | null;
};

export type PathVideoDismissalReviewCandidatePublic = {
  id: string;
  dismissalId: string;
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  reason: PathVideoDismissalReason;
  status: PathVideoDismissalReviewCandidateStatus;
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  createdAt: string;
  assessedAt: string | null;
};

type DbClient = Pick<SupabaseClient, 'from'>;

/**
 * No candidate status activates global rules or path-generation filters in this
 * slice (including approved). Assessment and rule activation come later.
 */
export function isPathVideoDismissalReviewCandidateActiveForPathGeneration(
  status: PathVideoDismissalReviewCandidateStatus
): boolean {
  void status;
  return false;
}

export function toPathVideoDismissalReviewCandidatePublic(
  row: PathVideoDismissalReviewCandidateRecord
): PathVideoDismissalReviewCandidatePublic {
  return {
    id: row.id,
    dismissalId: row.dismissal_id,
    pathId: row.path_id,
    pathVideoId: row.path_video_id,
    youtubeVideoId: row.youtube_video_id,
    reason: row.reason,
    status: row.status,
    supportingEvidenceCount: row.supporting_evidence_count,
    contradictingEvidenceCount: row.contradicting_evidence_count,
    createdAt: row.created_at,
    assessedAt: row.assessed_at,
  };
}

function buildDeterministicCandidateInsert(args: {
  dismissalId: string;
  owner: string;
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  reason: PathVideoDismissalReason;
}) {
  return {
    dismissal_id: args.dismissalId,
    owner: args.owner,
    path_id: args.pathId,
    path_video_id: args.pathVideoId,
    youtube_video_id: args.youtubeVideoId,
    reason: args.reason,
    status: PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_STATUS,
    supporting_evidence_count:
      PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_SUPPORTING_EVIDENCE,
    contradicting_evidence_count:
      PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_CONTRADICTING_EVIDENCE,
  };
}

async function loadCandidateByDismissalId(
  db: DbClient,
  dismissalId: string
): Promise<
  | { ok: true; candidate: PathVideoDismissalReviewCandidateRecord | null }
  | { ok: false; status: 500; error: string }
> {
  const { data, error } = await db
    .from('path_video_dismissal_review_candidates')
    .select('*')
    .eq('dismissal_id', dismissalId)
    .maybeSingle();

  if (error) {
    console.error('loadCandidateByDismissalId error:', error);
    return { ok: false, status: 500, error: 'Failed to load review candidate' };
  }

  return {
    ok: true,
    candidate: (data as PathVideoDismissalReviewCandidateRecord | null) ?? null,
  };
}

export type EnsurePathVideoDismissalReviewCandidateResult =
  | {
      ok: true;
      created: boolean;
      candidate: PathVideoDismissalReviewCandidatePublic | null;
    }
  | { ok: false; status: 500; error: string };

/**
 * Idempotent ensure: after an active dismissal exists, create a review candidate
 * only when broaderFeedback is true. Reuses the unique dismissal_id candidate.
 * Never activates rules or mutates path generation state.
 */
export async function ensurePathVideoDismissalReviewCandidate(
  db: DbClient,
  ownerId: string,
  dismissal: PathVideoDismissalPublic
): Promise<EnsurePathVideoDismissalReviewCandidateResult> {
  if (!dismissal.broaderFeedback) {
    return { ok: true, created: false, candidate: null };
  }

  const existing = await loadCandidateByDismissalId(db, dismissal.id);
  if (!existing.ok) {
    return existing;
  }
  if (existing.candidate) {
    if (existing.candidate.owner !== ownerId) {
      return {
        ok: false,
        status: 500,
        error: 'Failed to load review candidate',
      };
    }
    return {
      ok: true,
      created: false,
      candidate: toPathVideoDismissalReviewCandidatePublic(existing.candidate),
    };
  }

  const trimmedOwner = ownerId.trim();
  if (!trimmedOwner) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to create review candidate',
    };
  }

  const insertPayload = buildDeterministicCandidateInsert({
    dismissalId: dismissal.id,
    owner: trimmedOwner,
    pathId: dismissal.pathId,
    pathVideoId: dismissal.pathVideoId,
    youtubeVideoId: dismissal.youtubeVideoId,
    reason: dismissal.reason,
  });

  const { data: inserted, error: insertError } = await db
    .from('path_video_dismissal_review_candidates')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    if (isConflictError(insertError)) {
      const raced = await loadCandidateByDismissalId(db, dismissal.id);
      if (!raced.ok) {
        return raced;
      }
      if (raced.candidate && raced.candidate.owner === ownerId) {
        return {
          ok: true,
          created: false,
          candidate: toPathVideoDismissalReviewCandidatePublic(raced.candidate),
        };
      }
      return { ok: false, status: 500, error: 'Review candidate conflict' };
    }
    console.error(
      'ensurePathVideoDismissalReviewCandidate insert error:',
      insertError
    );
    return {
      ok: false,
      status: 500,
      error: 'Failed to create review candidate',
    };
  }

  if (!inserted) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to create review candidate',
    };
  }

  return {
    ok: true,
    created: true,
    candidate: toPathVideoDismissalReviewCandidatePublic(
      inserted as PathVideoDismissalReviewCandidateRecord
    ),
  };
}

export type ListOwnedPathVideoDismissalReviewCandidatesResult =
  | { ok: true; candidates: PathVideoDismissalReviewCandidatePublic[] }
  | { ok: false; status: 500; error: string };

/**
 * List review candidates submitted by the authenticated owner only.
 * Does not expose other users' feedback and does not activate rules.
 */
export async function listOwnedPathVideoDismissalReviewCandidates(
  db: DbClient,
  ownerId: string
): Promise<ListOwnedPathVideoDismissalReviewCandidatesResult> {
  const trimmedOwner = ownerId.trim();
  if (!trimmedOwner) {
    return {
      ok: false,
      status: 500,
      error: 'Failed to load review candidates',
    };
  }

  const { data, error } = await db
    .from('path_video_dismissal_review_candidates')
    .select('*')
    .eq('owner', trimmedOwner)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listOwnedPathVideoDismissalReviewCandidates error:', error);
    return {
      ok: false,
      status: 500,
      error: 'Failed to load review candidates',
    };
  }

  const rows = (data as PathVideoDismissalReviewCandidateRecord[] | null) || [];
  return {
    ok: true,
    candidates: rows.map(toPathVideoDismissalReviewCandidatePublic),
  };
}
