import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATH_GOAL_MAX_LENGTH,
  PATH_LIST_DEFAULT_LIMIT,
  createOwnedPath,
  deleteOwnedPath,
  derivePathTitle,
  getOwnedPath,
  isConflictError,
  listOwnedPaths,
  paginationRange,
  parseCreatePathBody,
  parsePathId,
  parsePathListQuery,
  parseUpdatePathBody,
  resolveOwnedPathAccess,
  updateOwnedPath,
  type PathRecord,
} from './paths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function makePath(
  overrides: Partial<PathRecord> & Pick<PathRecord, 'id' | 'owner' | 'goal'>
): PathRecord {
  const goal = overrides.goal;
  return {
    background: null,
    title: derivePathTitle(goal, overrides.title),
    created_at: '2026-09-26T12:00:00.000Z',
    updated_at: '2026-09-26T12:00:00.000Z',
    ...overrides,
  };
}

type StoreRow = PathRecord;

/** Minimal chainable fake matching the Supabase query surface used by paths-service. */
function createMemoryPathsClient(initial: StoreRow[] = []) {
  const rows: StoreRow[] = [...initial];

  function matchesFilters(
    row: StoreRow,
    filters: { owner?: string; id?: string }
  ): boolean {
    if (filters.owner !== undefined && row.owner !== filters.owner) {
      return false;
    }
    if (filters.id !== undefined && row.id !== filters.id) {
      return false;
    }
    return true;
  }

  return {
    rows,
    from(table: string) {
      assert.equal(table, 'paths');
      const state: {
        filters: { owner?: string; id?: string };
        ascending: boolean;
        rangeFrom?: number;
        rangeTo?: number;
        wantCount: boolean;
        wantSingle: boolean;
        wantMaybeSingle: boolean;
        deleteCount?: boolean;
        pendingInsert?: Partial<StoreRow>;
        pendingUpdate?: Partial<StoreRow>;
        mode: 'select' | 'insert' | 'update' | 'delete';
      } = {
        filters: {},
        ascending: false,
        wantCount: false,
        wantSingle: false,
        wantMaybeSingle: false,
        mode: 'select',
      };

      const builder: {
        select: (
          _columns?: string,
          options?: { count?: string }
        ) => typeof builder;
        insert: (payload: Partial<StoreRow>) => typeof builder;
        update: (payload: Partial<StoreRow>) => typeof builder;
        delete: (options?: { count?: string }) => typeof builder;
        eq: (column: string, value: string) => typeof builder;
        order: (
          _column: string,
          options: { ascending: boolean }
        ) => typeof builder;
        range: (from: number, to: number) => typeof builder;
        single: () => Promise<{
          data: StoreRow | null;
          error: { code?: string; message: string } | null;
        }>;
        maybeSingle: () => Promise<{
          data: StoreRow | null;
          error: { code?: string; message: string } | null;
          count?: number | null;
        }>;
        then: (
          resolve: (value: {
            data: StoreRow[] | null;
            error: { code?: string; message: string } | null;
            count?: number | null;
          }) => void
        ) => void;
      } = {
        select(_columns?: string, options?: { count?: string }) {
          state.wantCount = options?.count === 'exact';
          if (state.mode === 'insert' || state.mode === 'update') {
            // keep mode
          } else {
            state.mode = 'select';
          }
          return builder;
        },
        insert(payload: Partial<StoreRow>) {
          state.mode = 'insert';
          state.pendingInsert = payload;
          return builder;
        },
        update(payload: Partial<StoreRow>) {
          state.mode = 'update';
          state.pendingUpdate = payload;
          return builder;
        },
        delete(options?: { count?: string }) {
          state.mode = 'delete';
          state.deleteCount = options?.count === 'exact';
          return builder;
        },
        eq(column: string, value: string) {
          if (column === 'owner' || column === 'id') {
            state.filters[column] = value;
          }
          return builder;
        },
        order(_column: string, options: { ascending: boolean }) {
          state.ascending = options.ascending;
          return builder;
        },
        range(from: number, to: number) {
          state.rangeFrom = from;
          state.rangeTo = to;
          return builder;
        },
        async single() {
          const result = await execute();
          if (result.error) {
            return { data: null, error: result.error };
          }
          const data = Array.isArray(result.data)
            ? result.data[0] || null
            : result.data;
          if (!data) {
            return {
              data: null,
              error: { message: 'No rows' },
            };
          }
          return { data, error: null };
        },
        async maybeSingle() {
          const result = await execute();
          if (result.error) {
            return { data: null, error: result.error, count: result.count };
          }
          const data = Array.isArray(result.data)
            ? result.data[0] || null
            : result.data;
          return { data, error: null, count: result.count };
        },
        then(resolve) {
          void execute().then(resolve);
        },
      };

      async function execute(): Promise<{
        data: StoreRow[] | null;
        error: { code?: string; message: string } | null;
        count?: number | null;
      }> {
        if (state.mode === 'insert' && state.pendingInsert) {
          const now = new Date().toISOString();
          const row = makePath({
            id: crypto.randomUUID(),
            owner: String(state.pendingInsert.owner),
            goal: String(state.pendingInsert.goal),
            background:
              (state.pendingInsert.background as string | null) ?? null,
            title: String(state.pendingInsert.title),
            created_at: now,
            updated_at: now,
          });
          rows.push(row);
          return { data: [row], error: null, count: 1 };
        }

        if (state.mode === 'update' && state.pendingUpdate) {
          const index = rows.findIndex((row) =>
            matchesFilters(row, state.filters)
          );
          if (index < 0) {
            return { data: [], error: null, count: 0 };
          }
          const updated: StoreRow = {
            ...rows[index],
            ...state.pendingUpdate,
            updated_at: new Date().toISOString(),
          };
          rows[index] = updated;
          return { data: [updated], error: null, count: 1 };
        }

        if (state.mode === 'delete') {
          const before = rows.length;
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (matchesFilters(rows[index], state.filters)) {
              rows.splice(index, 1);
            }
          }
          const removed = before - rows.length;
          return {
            data: null,
            error: null,
            count: state.deleteCount ? removed : null,
          };
        }

        let matched = rows.filter((row) => matchesFilters(row, state.filters));
        matched = matched.sort((a, b) => {
          const left = a.created_at;
          const right = b.created_at;
          if (left === right) {
            return 0;
          }
          return state.ascending
            ? left < right
              ? -1
              : 1
            : left > right
              ? -1
              : 1;
        });

        const total = matched.length;
        if (state.rangeFrom !== undefined && state.rangeTo !== undefined) {
          matched = matched.slice(state.rangeFrom, state.rangeTo + 1);
        }

        return {
          data: matched,
          error: null,
          count: state.wantCount ? total : null,
        };
      }

      return builder;
    },
  };
}

describe('path validation', () => {
  it('accepts bounded create payloads and derives defaults', () => {
    const result = parseCreatePathBody({
      goal: '  Pass the CKA  ',
      background: '  Linux admin  ',
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.goal, 'Pass the CKA');
      assert.equal(result.data.background, 'Linux admin');
    }
  });

  it('rejects oversized goals and blank goals', () => {
    assert.equal(
      parseCreatePathBody({ goal: 'x'.repeat(PATH_GOAL_MAX_LENGTH + 1) })
        .success,
      false
    );
    assert.equal(parseCreatePathBody({ goal: '   ' }).success, false);
  });

  it('rejects client owner fields by ignoring them in the schema shape', () => {
    const result = parseCreatePathBody({
      goal: 'Learn darts',
      owner: 'attacker-id',
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal('owner' in result.data, false);
    }
  });

  it('requires at least one field on update', () => {
    assert.equal(parseUpdatePathBody({}).success, false);
    assert.equal(parseUpdatePathBody({ title: 'New title' }).success, true);
  });

  it('validates path ids and list pagination', () => {
    assert.equal(parsePathId('not-a-uuid').success, false);
    assert.equal(
      parsePathId('11111111-1111-4111-8111-111111111111').success,
      true
    );

    const list = parsePathListQuery({});
    assert.equal(list.success, true);
    if (list.success) {
      assert.equal(list.data.page, 1);
      assert.equal(list.data.limit, PATH_LIST_DEFAULT_LIMIT);
    }

    assert.equal(parsePathListQuery({ limit: 999 }).success, false);
  });
});

describe('path ownership helpers', () => {
  it('hides foreign-owned and missing paths as not_found', () => {
    const owned = makePath({
      id: '11111111-1111-4111-8111-111111111111',
      owner: 'user-a',
      goal: 'CKA',
    });

    assert.equal(resolveOwnedPathAccess(owned, 'user-a').status, 'ok');
    assert.equal(resolveOwnedPathAccess(owned, 'user-b').status, 'not_found');
    assert.equal(resolveOwnedPathAccess(null, 'user-a').status, 'not_found');
  });

  it('computes pagination ranges', () => {
    assert.deepEqual(paginationRange(1, 20), {
      from: 0,
      to: 19,
      offset: 0,
    });
    assert.deepEqual(paginationRange(3, 10), {
      from: 20,
      to: 29,
      offset: 20,
    });
  });

  it('detects conflict error codes', () => {
    assert.equal(isConflictError({ code: '23505' }), true);
    assert.equal(isConflictError({ code: '42501' }), false);
  });
});

describe('path CRUD service (in-memory)', () => {
  it('creates, lists with pagination, updates, and deletes owned paths', async () => {
    const client = createMemoryPathsClient() as never;

    const created = await createOwnedPath(client, 'user-a', {
      goal: 'Pass the CKA',
      background: 'Linux admin',
      title: null,
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    assert.equal(created.path.owner, 'user-a');
    assert.equal(created.path.title, 'Pass the CKA');

    const second = await createOwnedPath(client, 'user-a', {
      goal: 'Learn darts',
      background: null,
      title: 'Darts path',
    });
    assert.equal(second.ok, true);

    const page1 = await listOwnedPaths(client, 'user-a', {
      page: 1,
      limit: 1,
    });
    assert.equal(page1.ok, true);
    if (page1.ok) {
      assert.equal(page1.data.paths.length, 1);
      assert.equal(page1.data.total, 2);
      assert.equal(page1.data.hasMore, true);
    }

    const updated = await updateOwnedPath(client, 'user-a', created.path.id, {
      title: 'CKA mastery',
    });
    assert.equal(updated.ok, true);
    if (updated.ok) {
      assert.equal(updated.path.title, 'CKA mastery');
    }

    const deleted = await deleteOwnedPath(client, 'user-a', created.path.id);
    assert.equal(deleted.ok, true);

    const afterDelete = await getOwnedPath(client, 'user-a', created.path.id);
    assert.equal(afterDelete.ok, false);
    if (!afterDelete.ok) {
      assert.equal(afterDelete.status, 404);
    }
  });

  it('prevents user B from reading, updating, or deleting user A paths', async () => {
    const client = createMemoryPathsClient([
      makePath({
        id: '22222222-2222-4222-8222-222222222222',
        owner: 'user-a',
        goal: 'Private goal',
        title: 'Private',
      }),
    ]) as never;

    const read = await getOwnedPath(
      client,
      'user-b',
      '22222222-2222-4222-8222-222222222222'
    );
    assert.equal(read.ok, false);
    if (!read.ok) {
      assert.equal(read.status, 404);
    }

    const patched = await updateOwnedPath(
      client,
      'user-b',
      '22222222-2222-4222-8222-222222222222',
      { goal: 'Hijacked' }
    );
    assert.equal(patched.ok, false);
    if (!patched.ok) {
      assert.equal(patched.status, 404);
    }

    const removed = await deleteOwnedPath(
      client,
      'user-b',
      '22222222-2222-4222-8222-222222222222'
    );
    assert.equal(removed.ok, false);
    if (!removed.ok) {
      assert.equal(removed.status, 404);
    }

    const stillThere = await getOwnedPath(
      client,
      'user-a',
      '22222222-2222-4222-8222-222222222222'
    );
    assert.equal(stillThere.ok, true);
  });

  it('lists only the requesting owner rows', async () => {
    const client = createMemoryPathsClient([
      makePath({
        id: '33333333-3333-4333-8333-333333333333',
        owner: 'user-a',
        goal: 'A goal',
      }),
      makePath({
        id: '44444444-4444-4444-8444-444444444444',
        owner: 'user-b',
        goal: 'B goal',
      }),
    ]) as never;

    const listed = await listOwnedPaths(client, 'user-a', {
      page: 1,
      limit: 20,
    });
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.data.total, 1);
      assert.equal(listed.data.paths[0]?.owner, 'user-a');
    }
  });
});

describe('paths migration', () => {
  it('creates paths with deny-by-default RLS and cascade guidance', () => {
    const source = readFileSync(
      join(root, 'supabase/migrations/20260926150000_create_paths.sql'),
      'utf8'
    );
    assert.match(source, /CREATE TABLE IF NOT EXISTS public\.paths/);
    assert.match(source, /owner TEXT NOT NULL/);
    assert.match(source, /ENABLE ROW LEVEL SECURITY/);
    assert.match(source, /REVOKE ALL ON TABLE public\.paths FROM anon/);
    assert.match(source, /GRANT ALL ON TABLE public\.paths TO service_role/);
    assert.match(source, /ON DELETE CASCADE/);
    assert.match(source, /video_intervals/);
  });
});
