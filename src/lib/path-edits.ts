import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  youtubeVideoIdSchema,
  type PathRevisionRecord,
  type PathStageWithVideos,
} from './path-research-schema';
import { getOwnedPath, pathIdSchema } from './paths';
import { extractYouTubeVideoId } from './validation';

export const PATH_STAGE_TITLE_MAX = 200;
export const PATH_REFLECTION_MAX = 2000;

const uuidSchema = z.string().uuid('Invalid ID format');

const expectedEditVersionSchema = z
  .number()
  .int()
  .positive('expectedEditVersion must be a positive integer');

const renameStageSchema = z.object({
  action: z.literal('rename_stage'),
  stageId: uuidSchema,
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(
      PATH_STAGE_TITLE_MAX,
      `Title must be at most ${PATH_STAGE_TITLE_MAX} characters`
    ),
  expectedEditVersion: expectedEditVersionSchema,
});

const reorderStagesSchema = z.object({
  action: z.literal('reorder_stages'),
  orderedStageIds: z.array(uuidSchema).min(1),
  expectedEditVersion: expectedEditVersionSchema,
});

const reorderItemsSchema = z.object({
  action: z.literal('reorder_items'),
  stageId: uuidSchema,
  orderedPathVideoIds: z.array(uuidSchema).min(1),
  expectedEditVersion: expectedEditVersionSchema,
});

const moveItemSchema = z.object({
  action: z.literal('move_item'),
  pathVideoId: uuidSchema,
  targetStageId: uuidSchema,
  targetPosition: z.number().int().min(0).optional(),
  expectedEditVersion: expectedEditVersionSchema,
});

const removeItemSchema = z.object({
  action: z.literal('remove_item'),
  pathVideoId: uuidSchema,
  expectedEditVersion: expectedEditVersionSchema,
});

const addItemSchema = z.object({
  action: z.literal('add'),
  stageId: uuidSchema,
  url: z.string().trim().min(1, 'URL is required'),
  expectedEditVersion: expectedEditVersionSchema,
});

const replaceItemSchema = z.object({
  action: z.literal('replace'),
  pathVideoId: uuidSchema,
  url: z.string().trim().min(1, 'URL is required'),
  expectedEditVersion: expectedEditVersionSchema,
});

export const pathEditActionSchema = z.discriminatedUnion('action', [
  renameStageSchema,
  reorderStagesSchema,
  reorderItemsSchema,
  moveItemSchema,
  removeItemSchema,
  addItemSchema,
  replaceItemSchema,
]);

export type PathEditAction = z.infer<typeof pathEditActionSchema>;

export const activateRevisionSchema = z.object({
  revisionId: uuidSchema,
  expectedEditVersion: expectedEditVersionSchema,
});

export type ActivateRevisionInput = z.infer<typeof activateRevisionSchema>;

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

export function parsePathEditBody(body: unknown) {
  return parseWithSchema(pathEditActionSchema, body);
}

export function parseActivateRevisionBody(body: unknown) {
  return parseWithSchema(activateRevisionSchema, body);
}

export function parsePathIdParam(pathId: unknown) {
  return parseWithSchema(pathIdSchema, pathId);
}

/**
 * Reject foreign IDs, duplicates, and incomplete permutations.
 * Used by unit tests and as a pre-flight check before RPC.
 */
export function validateIdPermutation(
  expectedIds: readonly string[],
  providedIds: readonly string[]
):
  | { ok: true }
  | { ok: false; code: 'invalid_order' | 'foreign_id'; error: string } {
  if (providedIds.length !== expectedIds.length) {
    return {
      ok: false,
      code: 'invalid_order',
      error: 'Ordered IDs must include every item exactly once',
    };
  }

  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  for (const id of providedIds) {
    if (!expected.has(id)) {
      return {
        ok: false,
        code: 'foreign_id',
        error: 'Unknown or foreign ID in order',
      };
    }
    if (seen.has(id)) {
      return {
        ok: false,
        code: 'invalid_order',
        error: 'Ordered IDs contain duplicates',
      };
    }
    seen.add(id);
  }

  for (const id of expectedIds) {
    if (!seen.has(id)) {
      return {
        ok: false,
        code: 'invalid_order',
        error: 'Ordered IDs must include every item exactly once',
      };
    }
  }

  return { ok: true };
}

export function assertExpectedEditVersion(
  revision: Pick<PathRevisionRecord, 'edit_version'> | null | undefined,
  expectedEditVersion: number
):
  | { ok: true }
  | { ok: false; code: 'stale_edit' | 'no_active_revision'; error: string } {
  if (!revision) {
    return {
      ok: false,
      code: 'no_active_revision',
      error: 'Path has no active revision to edit',
    };
  }
  if (revision.edit_version !== expectedEditVersion) {
    return {
      ok: false,
      code: 'stale_edit',
      error: 'Path was edited in another tab. Reload and try again.',
    };
  }
  return { ok: true };
}

export function findStageInRevision(
  stages: PathStageWithVideos[],
  stageId: string
): PathStageWithVideos | null {
  return stages.find((stage) => stage.id === stageId) || null;
}

export function findVideoInRevision(
  stages: PathStageWithVideos[],
  pathVideoId: string
): { stage: PathStageWithVideos; videoIndex: number } | null {
  for (const stage of stages) {
    const videoIndex = stage.videos.findIndex(
      (video) => video.id === pathVideoId
    );
    if (videoIndex >= 0) {
      return { stage, videoIndex };
    }
  }
  return null;
}

/** Flat path order for watch navigation and Continue. */
export function flattenPathVideos(stages: PathStageWithVideos[]): Array<{
  pathVideoId: string;
  youtubeVideoId: string;
  stageId: string;
  title: string;
  channelTitle: string | null;
  positionInPath: number;
}> {
  const items: Array<{
    pathVideoId: string;
    youtubeVideoId: string;
    stageId: string;
    title: string;
    channelTitle: string | null;
    positionInPath: number;
  }> = [];

  let positionInPath = 0;
  const orderedStages = [...stages].sort((a, b) => a.position - b.position);
  for (const stage of orderedStages) {
    const orderedVideos = [...stage.videos].sort(
      (a, b) => a.position - b.position
    );
    for (const video of orderedVideos) {
      items.push({
        pathVideoId: video.id,
        youtubeVideoId: video.youtube_video_id,
        stageId: stage.id,
        title: video.title,
        channelTitle: video.channel_title,
        positionInPath,
      });
      positionInPath += 1;
    }
  }
  return items;
}

export function resolveYouTubeVideoIdFromUrl(
  url: string
): { ok: true; videoId: string } | { ok: false; error: string } {
  const fromUrl = extractYouTubeVideoId(url);
  if (fromUrl) {
    return { ok: true, videoId: fromUrl };
  }
  const trimmed = url.trim();
  const asId = youtubeVideoIdSchema.safeParse(trimmed);
  if (asId.success) {
    return { ok: true, videoId: asId.data };
  }
  return { ok: false, error: 'Invalid YouTube video URL' };
}

type DbClient = Pick<SupabaseClient, 'from' | 'rpc'>;

export type PathEditResult =
  | {
      ok: true;
      editVersion: number;
      revisionId: string;
      pathVideoId?: string | null;
    }
  | {
      ok: false;
      status: 400 | 404 | 409 | 500;
      error: string;
      code?: string;
    };

function mapEditCode(code: string | undefined): {
  status: 400 | 404 | 409 | 500;
  error: string;
} {
  switch (code) {
    case 'not_found':
      return { status: 404, error: 'Path not found' };
    case 'no_active_revision':
      return { status: 404, error: 'Path has no active revision to edit' };
    case 'stale_edit':
      return {
        status: 409,
        error: 'Path was edited in another tab. Reload and try again.',
      };
    case 'foreign_id':
      return { status: 400, error: 'Unknown or foreign path item ID' };
    case 'invalid_order':
      return {
        status: 400,
        error: 'Ordered IDs must include every item exactly once',
      };
    case 'invalid_payload':
      return { status: 400, error: 'Invalid edit payload' };
    case 'empty_revision':
      return {
        status: 400,
        error: 'A path revision must keep at least one video',
      };
    case 'unknown_action':
      return { status: 400, error: 'Unknown edit action' };
    default:
      return { status: 500, error: 'Failed to apply path edit' };
  }
}

export async function applyOwnedPathEdit(
  db: DbClient,
  ownerId: string,
  pathId: string,
  action: PathEditAction,
  verifiedVideo?: {
    youtubeVideoId: string;
    title: string;
    channelTitle: string | null;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
    verifiedAt: string;
    metadataSnapshot?: Record<string, unknown> | null;
    selectionReason?: string;
  }
): Promise<PathEditResult> {
  const owned = await getOwnedPath(db, ownerId, pathId);
  if (!owned.ok) {
    return {
      ok: false,
      status: owned.status === 404 ? 404 : 500,
      error: owned.error,
    };
  }

  // RPC uses add_item/replace_item; API/body schema keeps add/replace.
  type RpcPathEditAction =
    | Exclude<PathEditAction['action'], 'add' | 'replace'>
    | 'add_item'
    | 'replace_item';
  let rpcAction: RpcPathEditAction;
  let payload: Record<string, unknown>;

  if (action.action === 'add' || action.action === 'replace') {
    if (!verifiedVideo) {
      return {
        ok: false,
        status: 400,
        error: 'Verified YouTube metadata is required',
      };
    }
    rpcAction = action.action === 'add' ? 'add_item' : 'replace_item';
    payload = {
      stageId: action.action === 'add' ? action.stageId : undefined,
      pathVideoId: action.action === 'replace' ? action.pathVideoId : undefined,
      youtubeVideoId: verifiedVideo.youtubeVideoId,
      title: verifiedVideo.title,
      channelTitle: verifiedVideo.channelTitle,
      durationSeconds: verifiedVideo.durationSeconds,
      thumbnailUrl: verifiedVideo.thumbnailUrl,
      verifiedAt: verifiedVideo.verifiedAt,
      metadataSnapshot: verifiedVideo.metadataSnapshot ?? null,
      selectionReason:
        verifiedVideo.selectionReason ||
        (action.action === 'add' ? 'Added manually' : 'Replaced manually'),
    };
  } else if (action.action === 'rename_stage') {
    rpcAction = action.action;
    payload = { stageId: action.stageId, title: action.title };
  } else if (action.action === 'reorder_stages') {
    rpcAction = action.action;
    payload = { orderedStageIds: action.orderedStageIds };
  } else if (action.action === 'reorder_items') {
    rpcAction = action.action;
    payload = {
      stageId: action.stageId,
      orderedPathVideoIds: action.orderedPathVideoIds,
    };
  } else if (action.action === 'move_item') {
    rpcAction = action.action;
    payload = {
      pathVideoId: action.pathVideoId,
      targetStageId: action.targetStageId,
      targetPosition: action.targetPosition,
    };
  } else if (action.action === 'remove_item') {
    rpcAction = action.action;
    payload = { pathVideoId: action.pathVideoId };
  } else {
    return { ok: false, status: 400, error: 'Unknown edit action' };
  }

  const { data, error } = await db.rpc('apply_path_revision_edit', {
    p_path_id: pathId,
    p_owner: ownerId,
    p_expected_edit_version: action.expectedEditVersion,
    p_action: rpcAction,
    p_payload: payload,
  });

  if (error) {
    console.error('apply_path_revision_edit error:', error);
    return { ok: false, status: 500, error: 'Failed to apply path edit' };
  }

  const result = data as {
    ok?: boolean;
    code?: string;
    edit_version?: number;
    revision_id?: string;
    path_video_id?: string | null;
  } | null;

  if (!result?.ok) {
    const mapped = mapEditCode(result?.code);
    return {
      ok: false,
      status: mapped.status,
      error: mapped.error,
      code: result?.code,
    };
  }

  return {
    ok: true,
    editVersion: result.edit_version || action.expectedEditVersion + 1,
    revisionId: result.revision_id || '',
    pathVideoId: result.path_video_id ?? null,
  };
}

export type ActivateRevisionResult =
  | {
      ok: true;
      revisionId: string;
      editVersion: number;
      alreadyActive: boolean;
    }
  | {
      ok: false;
      status: 404 | 409 | 500;
      error: string;
      code?: string;
      editVersion?: number;
    };

export async function activateOwnedPathRevision(
  db: DbClient,
  ownerId: string,
  pathId: string,
  input: ActivateRevisionInput
): Promise<ActivateRevisionResult> {
  const owned = await getOwnedPath(db, ownerId, pathId);
  if (!owned.ok) {
    return {
      ok: false,
      status: owned.status === 404 ? 404 : 500,
      error: owned.error,
    };
  }

  const { data, error } = await db.rpc('activate_path_revision', {
    p_path_id: pathId,
    p_owner: ownerId,
    p_revision_id: input.revisionId,
    p_expected_edit_version: input.expectedEditVersion,
  });

  if (error) {
    console.error('activate_path_revision error:', error);
    return { ok: false, status: 500, error: 'Failed to activate revision' };
  }

  const result = data as {
    ok?: boolean;
    code?: string;
    revision_id?: string;
    edit_version?: number;
    already_active?: boolean;
  } | null;

  if (!result?.ok) {
    if (result?.code === 'stale_edit') {
      return {
        ok: false,
        status: 409,
        code: 'stale_edit',
        error:
          'Path was edited since this draft was created. Review again before activating.',
        editVersion: result.edit_version,
      };
    }
    if (result?.code === 'not_found') {
      return {
        ok: false,
        status: 404,
        error: 'Revision not found',
        code: 'not_found',
      };
    }
    return {
      ok: false,
      status: 500,
      error: 'Failed to activate revision',
      code: result?.code,
    };
  }

  return {
    ok: true,
    revisionId: result.revision_id || input.revisionId,
    editVersion: result.edit_version || 1,
    alreadyActive: Boolean(result.already_active),
  };
}
