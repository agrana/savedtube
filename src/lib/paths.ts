import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PATH_GOAL_MAX_LENGTH = 500;
export const PATH_BACKGROUND_MAX_LENGTH = 2000;
export const PATH_TITLE_MAX_LENGTH = 200;
export const PATH_LIST_DEFAULT_LIMIT = 20;
export const PATH_LIST_MAX_LIMIT = 50;

const trimmedNonEmpty = (max: number, field: string) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be at most ${max} characters`);

export const pathIdSchema = z.string().uuid('Invalid path ID format');

export const createPathSchema = z.object({
  goal: trimmedNonEmpty(PATH_GOAL_MAX_LENGTH, 'Goal'),
  background: z
    .string()
    .trim()
    .max(
      PATH_BACKGROUND_MAX_LENGTH,
      `Background must be at most ${PATH_BACKGROUND_MAX_LENGTH} characters`
    )
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null)),
  title: z
    .string()
    .trim()
    .max(
      PATH_TITLE_MAX_LENGTH,
      `Title must be at most ${PATH_TITLE_MAX_LENGTH} characters`
    )
    .optional()
    .nullable(),
});

export const updatePathSchema = z
  .object({
    goal: trimmedNonEmpty(PATH_GOAL_MAX_LENGTH, 'Goal').optional(),
    background: z
      .string()
      .trim()
      .max(
        PATH_BACKGROUND_MAX_LENGTH,
        `Background must be at most ${PATH_BACKGROUND_MAX_LENGTH} characters`
      )
      .nullable()
      .optional(),
    title: trimmedNonEmpty(PATH_TITLE_MAX_LENGTH, 'Title').optional(),
  })
  .refine(
    (value) =>
      value.goal !== undefined ||
      value.background !== undefined ||
      value.title !== undefined,
    { message: 'At least one field is required' }
  );

export const pathListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PATH_LIST_MAX_LIMIT)
    .default(PATH_LIST_DEFAULT_LIMIT),
});

export type CreatePathInput = {
  goal: string;
  background: string | null;
  title?: string | null;
};
export type UpdatePathInput = z.infer<typeof updatePathSchema>;
export type PathListQuery = {
  page: number;
  limit: number;
};

export type PathRecord = {
  id: string;
  owner: string;
  goal: string;
  background: string | null;
  title: string;
  active_revision_id?: string | null;
  created_at: string;
  updated_at: string;
};

export function derivePathTitle(goal: string, title?: string | null): string {
  const explicit = title?.trim();
  if (explicit) {
    return explicit.slice(0, PATH_TITLE_MAX_LENGTH);
  }
  const trimmedGoal = goal.trim();
  return trimmedGoal.slice(0, PATH_TITLE_MAX_LENGTH);
}

export function paginationRange(
  page: number,
  limit: number
): { from: number; to: number; offset: number } {
  const offset = (page - 1) * limit;
  return {
    from: offset,
    to: offset + limit - 1,
    offset,
  };
}

/**
 * Ownership gate for path reads/mutations.
 * Missing or foreign-owned rows both map to not_found (404) so existence is not leaked.
 */
export function resolveOwnedPathAccess(
  path: PathRecord | null | undefined,
  ownerId: string
): { status: 'ok'; path: PathRecord } | { status: 'not_found' } {
  if (!path || path.owner !== ownerId) {
    return { status: 'not_found' };
  }
  return { status: 'ok', path };
}

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

export function parseCreatePathBody(body: unknown) {
  const parsed = parseWithSchema(createPathSchema, body);
  if (!parsed.success) {
    return parsed;
  }
  return {
    success: true as const,
    data: {
      goal: parsed.data.goal,
      background: parsed.data.background ?? null,
      title: parsed.data.title ?? null,
    } satisfies CreatePathInput,
  };
}

export function parseUpdatePathBody(body: unknown) {
  return parseWithSchema(updatePathSchema, body);
}

export function parsePathId(pathId: unknown) {
  return parseWithSchema(pathIdSchema, pathId);
}

export function parsePathListQuery(query: unknown) {
  const parsed = parseWithSchema(pathListQuerySchema, query);
  if (!parsed.success) {
    return parsed;
  }
  return {
    success: true as const,
    data: {
      page: parsed.data.page ?? 1,
      limit: parsed.data.limit ?? PATH_LIST_DEFAULT_LIMIT,
    } satisfies PathListQuery,
  };
}

/** True when a Postgres error indicates a unique/conflict constraint. */
export function isConflictError(
  error: {
    code?: string;
    message?: string;
  } | null
): boolean {
  return error?.code === '23505';
}

type PathsClient = Pick<SupabaseClient, 'from'>;

export type PathListResult = {
  paths: PathRecord[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export type PathMutationResult =
  | { ok: true; path: PathRecord }
  | { ok: false; status: 404 | 409 | 500; error: string };

export type PathDeleteResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 500; error: string };

export async function listOwnedPaths(
  client: PathsClient,
  ownerId: string,
  query: PathListQuery
): Promise<
  { ok: true; data: PathListResult } | { ok: false; status: 500; error: string }
> {
  const { from, to, offset } = paginationRange(query.page, query.limit);

  const { data, error, count } = await client
    .from('paths')
    .select('*', { count: 'exact' })
    .eq('owner', ownerId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('listOwnedPaths error:', error);
    return { ok: false, status: 500, error: 'Failed to fetch paths' };
  }

  const total = count ?? 0;
  const paths = (data || []) as PathRecord[];

  return {
    ok: true,
    data: {
      paths,
      page: query.page,
      limit: query.limit,
      total,
      hasMore: offset + paths.length < total,
    },
  };
}

export async function createOwnedPath(
  client: PathsClient,
  ownerId: string,
  input: CreatePathInput
): Promise<PathMutationResult> {
  const title = derivePathTitle(input.goal, input.title);
  const background =
    input.background && input.background.length > 0 ? input.background : null;

  const { data, error } = await client
    .from('paths')
    .insert({
      owner: ownerId,
      goal: input.goal,
      background,
      title,
    })
    .select('*')
    .single();

  if (error) {
    console.error('createOwnedPath error:', error);
    if (isConflictError(error)) {
      return { ok: false, status: 409, error: 'Path conflict' };
    }
    return { ok: false, status: 500, error: 'Failed to create path' };
  }

  return { ok: true, path: data as PathRecord };
}

export async function getOwnedPath(
  client: PathsClient,
  ownerId: string,
  pathId: string
): Promise<PathMutationResult> {
  const { data, error } = await client
    .from('paths')
    .select('*')
    .eq('id', pathId)
    .maybeSingle();

  if (error) {
    console.error('getOwnedPath error:', error);
    return { ok: false, status: 500, error: 'Failed to fetch path' };
  }

  const access = resolveOwnedPathAccess(data as PathRecord | null, ownerId);
  if (access.status === 'not_found') {
    return { ok: false, status: 404, error: 'Path not found' };
  }

  return { ok: true, path: access.path };
}

export async function updateOwnedPath(
  client: PathsClient,
  ownerId: string,
  pathId: string,
  input: UpdatePathInput
): Promise<PathMutationResult> {
  const existing = await getOwnedPath(client, ownerId, pathId);
  if (!existing.ok) {
    return existing;
  }

  const patch: {
    goal?: string;
    background?: string | null;
    title?: string;
  } = {};

  if (input.goal !== undefined) {
    patch.goal = input.goal;
  }
  if (input.background !== undefined) {
    patch.background =
      input.background && input.background.length > 0 ? input.background : null;
  }
  if (input.title !== undefined) {
    patch.title = input.title;
  } else if (input.goal !== undefined && input.title === undefined) {
    // Keep explicit titles; only refresh derived titles that still match the old goal.
    if (existing.path.title === derivePathTitle(existing.path.goal)) {
      patch.title = derivePathTitle(input.goal);
    }
  }

  const { data, error } = await client
    .from('paths')
    .update(patch)
    .eq('id', pathId)
    .eq('owner', ownerId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('updateOwnedPath error:', error);
    if (isConflictError(error)) {
      return { ok: false, status: 409, error: 'Path conflict' };
    }
    return { ok: false, status: 500, error: 'Failed to update path' };
  }

  if (!data) {
    return { ok: false, status: 404, error: 'Path not found' };
  }

  return { ok: true, path: data as PathRecord };
}

export async function deleteOwnedPath(
  client: PathsClient,
  ownerId: string,
  pathId: string
): Promise<PathDeleteResult> {
  const existing = await getOwnedPath(client, ownerId, pathId);
  if (!existing.ok) {
    return existing;
  }

  // Cascades to future path-owned child tables via FK ON DELETE CASCADE.
  // Shared video_intervals are intentionally not referenced and are left intact.
  const { error, count } = await client
    .from('paths')
    .delete({ count: 'exact' })
    .eq('id', pathId)
    .eq('owner', ownerId);

  if (error) {
    console.error('deleteOwnedPath error:', error);
    if (isConflictError(error)) {
      return { ok: false, status: 409, error: 'Path conflict' };
    }
    return { ok: false, status: 500, error: 'Failed to delete path' };
  }

  if (!count) {
    return { ok: false, status: 404, error: 'Path not found' };
  }

  return { ok: true };
}
