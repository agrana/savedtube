import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensurePathVideoDismissalReviewCandidate } from './path-dismissal-review-candidates';
import { youtubeVideoIdSchema } from './path-research-schema';
import { getOwnedPath, isConflictError, pathIdSchema } from './paths';

/**
 * Soft-dismiss domain contract for authenticated path videos.
 * Persists learner feedback and restores active dismissals without removing
 * path membership or mutating path_videos, path_video_progress,
 * path_stage_progress, video_intervals, or revision edit_version.
 * No LLM or global-rule behavior.
 */

/** Exact UI checkbox label for later surfaces; maps to broader_feedback. */
export const PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL =
  'This could be a problem for other users';

export const PATH_VIDEO_DISMISSAL_REASONS = [
  'too_easy',
  'too_hard',
  'poor_quality',
  'not_relevant',
  'duplicate',
  'outdated',
  'wrong_language',
  'already_known',
  'other',
] as const;

export type PathVideoDismissalReason =
  (typeof PATH_VIDEO_DISMISSAL_REASONS)[number];

export const pathVideoDismissalReasonSchema = z.enum(
  PATH_VIDEO_DISMISSAL_REASONS,
  {
    errorMap: () => ({ message: 'Invalid dismissal reason' }),
  }
);

const uuidSchema = z.string().uuid('Invalid ID format');

/**
 * Validated write payload for a soft-dismiss record.
 * owner is supplied by the authenticated session (requireApiSession).
 * broaderFeedback defaults to false when omitted.
 */
export const pathVideoDismissalWriteSchema = z.object({
  pathId: pathIdSchema,
  pathVideoId: uuidSchema,
  youtubeVideoId: youtubeVideoIdSchema,
  reason: pathVideoDismissalReasonSchema,
  broaderFeedback: z.boolean().optional().default(false),
});

export type PathVideoDismissalWriteInput = z.infer<
  typeof pathVideoDismissalWriteSchema
>;

/**
 * Validated restore payload. owner comes from requireApiSession.
 * Only pathId + pathVideoId are required to clear an active dismissal.
 */
export const pathVideoDismissalRestoreSchema = z.object({
  pathId: pathIdSchema,
  pathVideoId: uuidSchema,
});

export type PathVideoDismissalRestoreInput = z.infer<
  typeof pathVideoDismissalRestoreSchema
>;

/** Row shape matching public.path_video_dismissals. */
export type PathVideoDismissalRecord = {
  id: string;
  owner: string;
  path_id: string;
  path_video_id: string;
  youtube_video_id: string;
  reason: PathVideoDismissalReason;
  broader_feedback: boolean;
  dismissed_at: string;
  undismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Stable public dismissal identity returned by the dismiss mutation. */
export type PathVideoDismissalPublic = {
  id: string;
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  reason: PathVideoDismissalReason;
  broaderFeedback: boolean;
  dismissedAt: string;
};

/** Restored dismissal identity; includes undismissedAt when a row was cleared. */
export type PathVideoDismissalRestoredPublic = PathVideoDismissalPublic & {
  undismissedAt: string;
};

/** Active dismissal with path-video title for the authenticated review surface. */
export type PathVideoDismissalReviewItem = PathVideoDismissalPublic & {
  title: string;
};

/**
 * Idempotent active-dismissal identity: one undismissed row per
 * (owner, path_video_id). Matches the partial unique index
 * path_video_dismissals_one_active_per_owner_video.
 */
export type PathVideoDismissalActiveIdentity = {
  owner: string;
  pathVideoId: string;
};

export function pathVideoDismissalActiveIdentity(
  owner: string,
  pathVideoId: string
): PathVideoDismissalActiveIdentity {
  const trimmedOwner = owner.trim();
  if (!trimmedOwner) {
    throw new Error('owner is required for active dismissal identity');
  }
  if (!uuidSchema.safeParse(pathVideoId).success) {
    throw new Error('pathVideoId must be a UUID for active dismissal identity');
  }
  return { owner: trimmedOwner, pathVideoId };
}

export function isActivePathVideoDismissal(
  row: Pick<PathVideoDismissalRecord, 'undismissed_at'>
): boolean {
  return row.undismissed_at === null;
}

/** Tables this contract must never mutate. */
export const PATH_VIDEO_DISMISSAL_UNTOUCHED_TABLES = [
  'path_video_progress',
  'path_stage_progress',
  'video_intervals',
] as const;

type DbClient = Pick<SupabaseClient, 'from'>;

export function parsePathVideoDismissalBody(
  body: unknown
):
  | { success: true; data: PathVideoDismissalWriteInput }
  | { success: false; error: string } {
  const result = pathVideoDismissalWriteSchema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Validation failed',
    };
  }
  return { success: true, data: result.data };
}

export function parsePathVideoDismissalRestoreBody(
  body: unknown
):
  | { success: true; data: PathVideoDismissalRestoreInput }
  | { success: false; error: string } {
  const result = pathVideoDismissalRestoreSchema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Validation failed',
    };
  }
  return { success: true, data: result.data };
}

export function toPathVideoDismissalPublic(
  row: PathVideoDismissalRecord
): PathVideoDismissalPublic {
  return {
    id: row.id,
    pathId: row.path_id,
    pathVideoId: row.path_video_id,
    youtubeVideoId: row.youtube_video_id,
    reason: row.reason,
    broaderFeedback: row.broader_feedback,
    dismissedAt: row.dismissed_at,
  };
}

export function toPathVideoDismissalRestoredPublic(
  row: PathVideoDismissalRecord
): PathVideoDismissalRestoredPublic | null {
  if (row.undismissed_at == null) {
    return null;
  }
  return {
    ...toPathVideoDismissalPublic(row),
    undismissedAt: row.undismissed_at,
  };
}

async function resolveOwnedPathVideoForDismissal(
  db: DbClient,
  ownerId: string,
  pathId: string,
  pathVideoId: string
): Promise<
  | { ok: true; youtubeVideoId: string }
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

  const { data: videoRow, error: videoError } = await db
    .from('path_videos')
    .select('id, stage_id, youtube_video_id')
    .eq('id', pathVideoId)
    .maybeSingle();

  if (videoError) {
    console.error('resolveOwnedPathVideoForDismissal video error:', videoError);
    return { ok: false, status: 500, error: 'Failed to load path video' };
  }
  if (!videoRow) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const { data: stageRow, error: stageError } = await db
    .from('path_stages')
    .select('id, revision_id')
    .eq('id', videoRow.stage_id)
    .maybeSingle();

  if (stageError) {
    console.error('resolveOwnedPathVideoForDismissal stage error:', stageError);
    return { ok: false, status: 500, error: 'Failed to load path stage' };
  }
  if (!stageRow) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const { data: revisionRow, error: revisionError } = await db
    .from('path_revisions')
    .select('id, path_id')
    .eq('id', stageRow.revision_id)
    .eq('path_id', pathId)
    .maybeSingle();

  if (revisionError) {
    console.error(
      'resolveOwnedPathVideoForDismissal revision error:',
      revisionError
    );
    return { ok: false, status: 500, error: 'Failed to load path revision' };
  }
  if (!revisionRow) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  return {
    ok: true,
    youtubeVideoId: String(videoRow.youtube_video_id),
  };
}

async function loadActivePathVideoDismissal(
  db: DbClient,
  ownerId: string,
  pathVideoId: string
): Promise<
  | { ok: true; dismissal: PathVideoDismissalRecord | null }
  | { ok: false; status: 500; error: string }
> {
  const { data, error } = await db
    .from('path_video_dismissals')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_video_id', pathVideoId)
    .is('undismissed_at', null)
    .maybeSingle();

  if (error) {
    console.error('loadActivePathVideoDismissal error:', error);
    return { ok: false, status: 500, error: 'Failed to load dismissal' };
  }

  return {
    ok: true,
    dismissal: (data as PathVideoDismissalRecord | null) ?? null,
  };
}

export type ApplyOwnedPathVideoDismissalResult =
  | {
      ok: true;
      created: boolean;
      dismissal: PathVideoDismissalPublic;
    }
  | { ok: false; status: 404 | 409 | 500; error: string };

/**
 * Soft-dismiss an owned path video. Idempotent on active (owner, path_video_id).
 * Does not mutate path membership, progress, intervals, or edit_version.
 */
export async function applyOwnedPathVideoDismissal(
  db: DbClient,
  ownerId: string,
  input: PathVideoDismissalWriteInput
): Promise<ApplyOwnedPathVideoDismissalResult> {
  const membership = await resolveOwnedPathVideoForDismissal(
    db,
    ownerId,
    input.pathId,
    input.pathVideoId
  );
  if (!membership.ok) {
    return membership;
  }

  // Hide existence across owners and treat snapshot mismatch as not found.
  if (membership.youtubeVideoId !== input.youtubeVideoId) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const existing = await loadActivePathVideoDismissal(
    db,
    ownerId,
    input.pathVideoId
  );
  if (!existing.ok) {
    return existing;
  }
  if (existing.dismissal) {
    const reused = toPathVideoDismissalPublic(existing.dismissal);
    const candidate = await ensurePathVideoDismissalReviewCandidate(
      db,
      ownerId,
      reused
    );
    if (!candidate.ok) {
      return candidate;
    }
    return {
      ok: true,
      created: false,
      dismissal: reused,
    };
  }

  const { data: inserted, error: insertError } = await db
    .from('path_video_dismissals')
    .insert({
      owner: ownerId,
      path_id: input.pathId,
      path_video_id: input.pathVideoId,
      youtube_video_id: input.youtubeVideoId,
      reason: input.reason,
      broader_feedback: input.broaderFeedback,
    })
    .select('*')
    .single();

  if (insertError) {
    if (isConflictError(insertError)) {
      const raced = await loadActivePathVideoDismissal(
        db,
        ownerId,
        input.pathVideoId
      );
      if (!raced.ok) {
        return raced;
      }
      if (raced.dismissal) {
        const reused = toPathVideoDismissalPublic(raced.dismissal);
        const candidate = await ensurePathVideoDismissalReviewCandidate(
          db,
          ownerId,
          reused
        );
        if (!candidate.ok) {
          return candidate;
        }
        return {
          ok: true,
          created: false,
          dismissal: reused,
        };
      }
      return { ok: false, status: 409, error: 'Dismissal conflict' };
    }
    console.error('applyOwnedPathVideoDismissal insert error:', insertError);
    return { ok: false, status: 500, error: 'Failed to create dismissal' };
  }

  if (!inserted) {
    return { ok: false, status: 500, error: 'Failed to create dismissal' };
  }

  const created = toPathVideoDismissalPublic(
    inserted as PathVideoDismissalRecord
  );
  const candidate = await ensurePathVideoDismissalReviewCandidate(
    db,
    ownerId,
    created
  );
  if (!candidate.ok) {
    return candidate;
  }

  return {
    ok: true,
    created: true,
    dismissal: created,
  };
}

export type ListOwnedActivePathVideoDismissalsResult =
  | { ok: true; dismissals: PathVideoDismissalReviewItem[] }
  | { ok: false; status: 404 | 500; error: string };

/**
 * List active dismissals for an owned path, with path-video titles for review UI.
 * Does not mutate membership, progress, intervals, or edit_version.
 */
export async function listOwnedActivePathVideoDismissals(
  db: DbClient,
  ownerId: string,
  pathId: string
): Promise<ListOwnedActivePathVideoDismissalsResult> {
  const owned = await getOwnedPath(db, ownerId, pathId);
  if (!owned.ok) {
    return {
      ok: false,
      status: owned.status === 404 ? 404 : 500,
      error: owned.error,
    };
  }

  const { data, error } = await db
    .from('path_video_dismissals')
    .select('*')
    .eq('owner', ownerId)
    .eq('path_id', pathId)
    .is('undismissed_at', null)
    .order('dismissed_at', { ascending: false });

  if (error) {
    console.error('listOwnedActivePathVideoDismissals error:', error);
    return { ok: false, status: 500, error: 'Failed to load dismissals' };
  }

  const rows = (data as PathVideoDismissalRecord[] | null) || [];
  if (rows.length === 0) {
    return { ok: true, dismissals: [] };
  }

  const pathVideoIds = [...new Set(rows.map((row) => row.path_video_id))];
  const { data: videoRows, error: videoError } = await db
    .from('path_videos')
    .select('id, title')
    .in('id', pathVideoIds);

  if (videoError) {
    console.error(
      'listOwnedActivePathVideoDismissals video titles error:',
      videoError
    );
    return { ok: false, status: 500, error: 'Failed to load dismissal titles' };
  }

  const titleById = new Map<string, string>();
  for (const video of videoRows || []) {
    const id = (video as { id?: unknown }).id;
    const title = (video as { title?: unknown }).title;
    if (typeof id === 'string' && typeof title === 'string') {
      titleById.set(id, title);
    }
  }

  return {
    ok: true,
    dismissals: rows.map((row) => ({
      ...toPathVideoDismissalPublic(row),
      title: titleById.get(row.path_video_id) || row.youtube_video_id,
    })),
  };
}

export type RestoreOwnedPathVideoDismissalResult =
  | {
      ok: true;
      restored: boolean;
      dismissal: PathVideoDismissalRestoredPublic | null;
    }
  | { ok: false; status: 404 | 500; error: string };

/**
 * Restore (undo) an active soft-dismiss for an owned path video.
 * Sets undismissed_at on the active row only. Idempotent when already restored.
 * Does not mutate path membership, progress, intervals, or edit_version.
 */
export async function restoreOwnedPathVideoDismissal(
  db: DbClient,
  ownerId: string,
  input: PathVideoDismissalRestoreInput
): Promise<RestoreOwnedPathVideoDismissalResult> {
  const membership = await resolveOwnedPathVideoForDismissal(
    db,
    ownerId,
    input.pathId,
    input.pathVideoId
  );
  if (!membership.ok) {
    return membership;
  }

  const existing = await loadActivePathVideoDismissal(
    db,
    ownerId,
    input.pathVideoId
  );
  if (!existing.ok) {
    return existing;
  }

  if (!existing.dismissal) {
    return { ok: true, restored: false, dismissal: null };
  }

  if (existing.dismissal.path_id !== input.pathId) {
    return { ok: false, status: 404, error: 'Path video not found' };
  }

  const undismissedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from('path_video_dismissals')
    .update({ undismissed_at: undismissedAt })
    .eq('id', existing.dismissal.id)
    .eq('owner', ownerId)
    .eq('path_id', input.pathId)
    .is('undismissed_at', null)
    .select('*')
    .maybeSingle();

  if (updateError) {
    console.error('restoreOwnedPathVideoDismissal update error:', updateError);
    return { ok: false, status: 500, error: 'Failed to restore dismissal' };
  }

  if (!updated) {
    // Race: another request restored first — treat as already restored.
    return { ok: true, restored: false, dismissal: null };
  }

  const restored = toPathVideoDismissalRestoredPublic(
    updated as PathVideoDismissalRecord
  );
  if (!restored) {
    return { ok: false, status: 500, error: 'Failed to restore dismissal' };
  }

  return {
    ok: true,
    restored: true,
    dismissal: restored,
  };
}
