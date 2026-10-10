import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
  PATH_VIDEO_DISMISSAL_REASONS,
  PATH_VIDEO_DISMISSAL_UNTOUCHED_TABLES,
  applyOwnedPathVideoDismissal,
  isActivePathVideoDismissal,
  listOwnedActivePathVideoDismissals,
  parsePathVideoDismissalBody,
  parsePathVideoDismissalRestoreBody,
  pathVideoDismissalActiveIdentity,
  pathVideoDismissalReasonSchema,
  pathVideoDismissalRestoreSchema,
  pathVideoDismissalWriteSchema,
  restoreOwnedPathVideoDismissal,
  type PathVideoDismissalRecord,
} from './path-dismissals.ts';
import type { PathVideoDismissalReviewCandidateRecord } from './path-dismissal-review-candidates.ts';
import type { PathRecord } from './paths.ts';
import { derivePathTitle } from './paths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = join(
  root,
  'supabase/migrations/20261010140000_create_path_video_dismissals.sql'
);
const dismissalsRoutePath = join(
  root,
  'src/app/api/paths/[pathId]/dismissals/route.ts'
);

const VALID_PATH_ID = '11111111-1111-4111-8111-111111111111';
const VALID_PATH_VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const VALID_YOUTUBE_ID = 'dQw4w9WgXcQ';
const VALID_OWNER = 'user-owner-1';
const FOREIGN_OWNER = 'user-foreign-2';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const STAGE_ID = '44444444-4444-4444-8444-444444444444';
const FOREIGN_PATH_ID = '55555555-5555-4555-8555-555555555555';
const FOREIGN_VIDEO_ID = '66666666-6666-4666-8666-666666666666';
const FOREIGN_REVISION_ID = '77777777-7777-4777-8777-777777777777';
const FOREIGN_STAGE_ID = '88888888-8888-4888-8888-888888888888';

describe('path video dismissal reasons', () => {
  it('accepts every fixed snake_case reason', () => {
    for (const reason of PATH_VIDEO_DISMISSAL_REASONS) {
      const parsed = pathVideoDismissalReasonSchema.safeParse(reason);
      assert.equal(parsed.success, true, `expected ${reason} to be accepted`);
    }
    assert.deepEqual(
      [...PATH_VIDEO_DISMISSAL_REASONS],
      [
        'too_easy',
        'too_hard',
        'poor_quality',
        'not_relevant',
        'duplicate',
        'outdated',
        'wrong_language',
        'already_known',
        'other',
      ]
    );
  });

  it('rejects unknown and camelCase reasons', () => {
    for (const reason of [
      'tooEasy',
      'TOO_EASY',
      'irrelevant',
      'not-relevant',
      '',
      'spam',
    ]) {
      const parsed = pathVideoDismissalReasonSchema.safeParse(reason);
      assert.equal(parsed.success, false, `expected ${reason} to be rejected`);
    }
  });
});

describe('pathVideoDismissalWriteSchema', () => {
  it('requires pathId, pathVideoId, youtubeVideoId, and reason', () => {
    const missingAll = pathVideoDismissalWriteSchema.safeParse({});
    assert.equal(missingAll.success, false);

    const missingReason = pathVideoDismissalWriteSchema.safeParse({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
    });
    assert.equal(missingReason.success, false);

    const invalidIds = pathVideoDismissalWriteSchema.safeParse({
      pathId: 'not-a-uuid',
      pathVideoId: 'also-bad',
      youtubeVideoId: 'short',
      reason: 'other',
    });
    assert.equal(invalidIds.success, false);
  });

  it('defaults broaderFeedback to false when omitted', () => {
    const parsed = pathVideoDismissalWriteSchema.safeParse({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'not_relevant',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.broaderFeedback, false);
      assert.equal(parsed.data.reason, 'not_relevant');
    }
  });

  it('accepts explicit broaderFeedback true', () => {
    const parsed = pathVideoDismissalWriteSchema.safeParse({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'poor_quality',
      broaderFeedback: true,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.broaderFeedback, true);
    }
  });

  it('preserves the exact broader-feedback checkbox label for later UI', () => {
    assert.equal(
      PATH_VIDEO_DISMISSAL_BROADER_FEEDBACK_LABEL,
      'This could be a problem for other users'
    );
  });
});

describe('active dismissal identity', () => {
  it('uses owner + pathVideoId as the idempotent active identity', () => {
    const first = pathVideoDismissalActiveIdentity(
      VALID_OWNER,
      VALID_PATH_VIDEO_ID
    );
    const second = pathVideoDismissalActiveIdentity(
      `  ${VALID_OWNER}  `,
      VALID_PATH_VIDEO_ID
    );
    assert.deepEqual(first, {
      owner: VALID_OWNER,
      pathVideoId: VALID_PATH_VIDEO_ID,
    });
    assert.deepEqual(first, second);
    assert.equal(isActivePathVideoDismissal({ undismissed_at: null }), true);
    assert.equal(
      isActivePathVideoDismissal({
        undismissed_at: '2026-10-10T12:00:00.000Z',
      }),
      false
    );
  });

  it('rejects blank owner or non-UUID pathVideoId for active identity', () => {
    assert.throws(() =>
      pathVideoDismissalActiveIdentity('  ', VALID_PATH_VIDEO_ID)
    );
    assert.throws(() =>
      pathVideoDismissalActiveIdentity(VALID_OWNER, 'not-a-uuid')
    );
  });
});

describe('path_video_dismissals migration contract', () => {
  it('creates soft-dismiss table with reason check, active unique index, and deny-by-default RLS', () => {
    const source = readFileSync(migrationPath, 'utf8');

    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS public\.path_video_dismissals/
    );
    assert.match(source, /path_id UUID NOT NULL REFERENCES public\.paths/);
    assert.match(
      source,
      /path_video_id UUID NOT NULL REFERENCES public\.path_videos/
    );
    assert.match(source, /youtube_video_id TEXT NOT NULL/);
    assert.match(source, /broader_feedback BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(source, /dismissed_at TIMESTAMPTZ NOT NULL/);
    assert.match(source, /undismissed_at TIMESTAMPTZ/);
    assert.match(source, /path_video_dismissals_one_active_per_owner_video/);
    assert.match(source, /WHERE undismissed_at IS NULL/);
    assert.match(source, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      source,
      /GRANT ALL ON TABLE public\.path_video_dismissals TO service_role/
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.path_video_dismissals FROM anon/
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.path_video_dismissals FROM authenticated/
    );

    for (const reason of PATH_VIDEO_DISMISSAL_REASONS) {
      assert.match(
        source,
        new RegExp(`'${reason}'`),
        `migration must allow reason ${reason}`
      );
    }
  });

  it('does not mutate progress or video_intervals tables', () => {
    const source = readFileSync(migrationPath, 'utf8');

    for (const table of PATH_VIDEO_DISMISSAL_UNTOUCHED_TABLES) {
      assert.doesNotMatch(
        source,
        new RegExp(
          `(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+public\\.${table}\\b`,
          'i'
        ),
        `dismissal migration must not mutate ${table}`
      );
      assert.doesNotMatch(
        source,
        new RegExp(`ALTER TABLE\\s+public\\.${table}\\b`, 'i'),
        `dismissal migration must not alter ${table}`
      );
    }

    // Soft-dismiss must not hard-delete path videos.
    assert.doesNotMatch(source, /DELETE\s+FROM\s+public\.path_videos\b/i);
  });
});

type VideoProgressRow = {
  id: string;
  owner: string;
  path_video_id: string;
  practiced: boolean;
  practiced_at: string | null;
};

type StageProgressRow = {
  id: string;
  owner: string;
  path_stage_id: string;
  completed_at: string;
  reflection: string | null;
  completion_version: number;
};

type IntervalRow = {
  id: string;
  user_id: string;
  video_id: string;
  name: string | null;
  start_time: number;
  end_time: number;
  order_index: number;
};

type RevisionRow = {
  id: string;
  path_id: string;
  revision_number: number;
  status: 'active' | 'draft' | 'archived';
  edit_version: number;
};

/** Minimal in-memory surface for soft-dismiss ownership + idempotency. */
function createDismissalDb(args?: {
  owner?: string;
  pathId?: string;
  pathVideoId?: string;
  youtubeVideoId?: string;
  editVersion?: number;
  includeForeignPath?: boolean;
}) {
  const owner = args?.owner ?? VALID_OWNER;
  const pathId = args?.pathId ?? VALID_PATH_ID;
  const pathVideoId = args?.pathVideoId ?? VALID_PATH_VIDEO_ID;
  const youtubeVideoId = args?.youtubeVideoId ?? VALID_YOUTUBE_ID;
  const editVersion = args?.editVersion ?? 3;

  const paths: PathRecord[] = [
    {
      id: pathId,
      owner,
      goal: 'Learn soft dismiss',
      background: null,
      title: derivePathTitle('Learn soft dismiss'),
      active_revision_id: REVISION_ID,
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
  ];
  const revisions: RevisionRow[] = [
    {
      id: REVISION_ID,
      path_id: pathId,
      revision_number: 1,
      status: 'active',
      edit_version: editVersion,
    },
  ];
  const stages = [
    {
      id: STAGE_ID,
      revision_id: REVISION_ID,
      position: 0,
      title: 'Stage',
      learning_objective: 'Learn',
      reason: 'Start',
    },
  ];
  const videos = [
    {
      id: pathVideoId,
      stage_id: STAGE_ID,
      position: 0,
      youtube_video_id: youtubeVideoId,
      title: 'Video',
      channel_title: 'Channel',
      selection_reason: 'Relevant',
      source: 'research' as const,
    },
  ];
  const videoProgress: VideoProgressRow[] = [
    {
      id: randomUUID(),
      owner,
      path_video_id: pathVideoId,
      practiced: true,
      practiced_at: '2026-10-10T11:00:00.000Z',
    },
  ];
  const stageProgress: StageProgressRow[] = [
    {
      id: randomUUID(),
      owner,
      path_stage_id: STAGE_ID,
      completed_at: '2026-10-10T11:30:00.000Z',
      reflection: 'Keep going',
      completion_version: 1,
    },
  ];
  const intervals: IntervalRow[] = [
    {
      id: randomUUID(),
      user_id: owner,
      video_id: youtubeVideoId,
      name: 'Loop',
      start_time: 10,
      end_time: 40,
      order_index: 0,
    },
  ];
  const dismissals: PathVideoDismissalRecord[] = [];
  const reviewCandidates: PathVideoDismissalReviewCandidateRecord[] = [];

  if (args?.includeForeignPath) {
    paths.push({
      id: FOREIGN_PATH_ID,
      owner: FOREIGN_OWNER,
      goal: 'Foreign path',
      background: null,
      title: derivePathTitle('Foreign path'),
      active_revision_id: FOREIGN_REVISION_ID,
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    });
    revisions.push({
      id: FOREIGN_REVISION_ID,
      path_id: FOREIGN_PATH_ID,
      revision_number: 1,
      status: 'active',
      edit_version: 1,
    });
    stages.push({
      id: FOREIGN_STAGE_ID,
      revision_id: FOREIGN_REVISION_ID,
      position: 0,
      title: 'Foreign stage',
      learning_objective: 'Other',
      reason: 'Other',
    });
    videos.push({
      id: FOREIGN_VIDEO_ID,
      stage_id: FOREIGN_STAGE_ID,
      position: 0,
      youtube_video_id: 'zzzzzzzzzzz',
      title: 'Foreign video',
      channel_title: 'Other',
      selection_reason: 'Other',
      source: 'research',
    });
  }

  function matches(
    row: Record<string, unknown>,
    filters: Array<{
      column: string;
      value: unknown;
      mode: 'eq' | 'in' | 'is';
    }>
  ) {
    return filters.every((filter) => {
      if (filter.mode === 'eq') {
        return row[filter.column] === filter.value;
      }
      if (filter.mode === 'is') {
        if (filter.value === null) {
          return row[filter.column] == null;
        }
        return row[filter.column] === filter.value;
      }
      return (filter.value as unknown[]).includes(row[filter.column]);
    });
  }

  function tableRows(table: string): Record<string, unknown>[] {
    switch (table) {
      case 'paths':
        return paths as unknown as Record<string, unknown>[];
      case 'path_revisions':
        return revisions as unknown as Record<string, unknown>[];
      case 'path_stages':
        return stages as unknown as Record<string, unknown>[];
      case 'path_videos':
        return videos as unknown as Record<string, unknown>[];
      case 'path_video_progress':
        return videoProgress as unknown as Record<string, unknown>[];
      case 'path_stage_progress':
        return stageProgress as unknown as Record<string, unknown>[];
      case 'video_intervals':
        return intervals as unknown as Record<string, unknown>[];
      case 'path_video_dismissals':
        return dismissals as unknown as Record<string, unknown>[];
      case 'path_video_dismissal_review_candidates':
        return reviewCandidates as unknown as Record<string, unknown>[];
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  }

  function from(table: string) {
    const state: {
      filters: Array<{
        column: string;
        value: unknown;
        mode: 'eq' | 'in' | 'is';
      }>;
      mode: 'select' | 'insert' | 'update' | 'delete';
      pendingInsert?: Record<string, unknown>;
      pendingUpdate?: Record<string, unknown>;
      orderColumn?: string;
      ascending: boolean;
      wantSingle: boolean;
      wantMaybeSingle: boolean;
    } = {
      filters: [],
      mode: 'select',
      ascending: true,
      wantSingle: false,
      wantMaybeSingle: false,
    };

    const resolveSelect = () => {
      let rows = tableRows(table).filter((row) => matches(row, state.filters));
      if (state.orderColumn) {
        const column = state.orderColumn;
        rows = [...rows].sort((a, b) => {
          const left = a[column];
          const right = b[column];
          if (left === right) return 0;
          if (left == null) return state.ascending ? -1 : 1;
          if (right == null) return state.ascending ? 1 : -1;
          if (left < right) return state.ascending ? -1 : 1;
          return state.ascending ? 1 : -1;
        });
      }
      return rows;
    };

    const finish = async () => {
      if (state.mode === 'insert' && state.pendingInsert) {
        if (table === 'path_video_dismissal_review_candidates') {
          const payload = state.pendingInsert;
          const conflict = reviewCandidates.find(
            (row) => row.dismissal_id === payload.dismissal_id
          );
          if (conflict) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key value' },
            };
          }
          const now = new Date().toISOString();
          const row: PathVideoDismissalReviewCandidateRecord = {
            id: randomUUID(),
            dismissal_id: String(payload.dismissal_id),
            owner: String(payload.owner),
            path_id: String(payload.path_id),
            path_video_id: String(payload.path_video_id),
            youtube_video_id: String(payload.youtube_video_id),
            reason:
              payload.reason as PathVideoDismissalReviewCandidateRecord['reason'],
            status:
              (payload.status as PathVideoDismissalReviewCandidateRecord['status']) ||
              'pending',
            supporting_evidence_count: Number(
              payload.supporting_evidence_count ?? 1
            ),
            contradicting_evidence_count: Number(
              payload.contradicting_evidence_count ?? 0
            ),
            created_at: now,
            updated_at: now,
            assessed_at: null,
            reviewer_id: null,
            model_id: null,
            prompt_version: null,
            assessment_notes: null,
          };
          reviewCandidates.push(row);
          if (state.wantSingle) {
            return { data: row, error: null };
          }
          return { data: [row], error: null };
        }

        if (table !== 'path_video_dismissals') {
          throw new Error(`Unexpected insert into ${table}`);
        }
        const payload = state.pendingInsert;
        const conflict = dismissals.find(
          (row) =>
            row.owner === payload.owner &&
            row.path_video_id === payload.path_video_id &&
            row.undismissed_at == null
        );
        if (conflict) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value' },
          };
        }
        const now = new Date().toISOString();
        const row: PathVideoDismissalRecord = {
          id: randomUUID(),
          owner: String(payload.owner),
          path_id: String(payload.path_id),
          path_video_id: String(payload.path_video_id),
          youtube_video_id: String(payload.youtube_video_id),
          reason: payload.reason as PathVideoDismissalRecord['reason'],
          broader_feedback: Boolean(payload.broader_feedback),
          dismissed_at: now,
          undismissed_at: null,
          created_at: now,
          updated_at: now,
        };
        dismissals.push(row);
        if (state.wantSingle) {
          return { data: row, error: null };
        }
        return { data: [row], error: null };
      }

      if (state.mode === 'update' && state.pendingUpdate) {
        if (table !== 'path_video_dismissals') {
          throw new Error(`Unexpected update on ${table}`);
        }
        const targets = dismissals.filter((row) =>
          matches(row as unknown as Record<string, unknown>, state.filters)
        );
        const now = new Date().toISOString();
        for (const row of targets) {
          Object.assign(row, state.pendingUpdate, { updated_at: now });
        }
        if (state.wantMaybeSingle || state.wantSingle) {
          return { data: targets[0] || null, error: null };
        }
        return { data: targets, error: null };
      }

      const rows = resolveSelect();
      if (state.wantMaybeSingle || state.wantSingle) {
        return { data: rows[0] || null, error: null };
      }
      return { data: rows, error: null };
    };

    const builder = {
      select() {
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.mode = 'insert';
        state.pendingInsert = payload;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.mode = 'update';
        state.pendingUpdate = payload;
        return builder;
      },
      delete() {
        throw new Error(`Unexpected delete on ${table}`);
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, value, mode: 'eq' });
        return builder;
      },
      in(column: string, value: unknown[]) {
        state.filters.push({ column, value, mode: 'in' });
        return builder;
      },
      is(column: string, value: unknown) {
        state.filters.push({ column, value, mode: 'is' });
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        state.orderColumn = column;
        state.ascending = options.ascending;
        return builder;
      },
      single() {
        state.wantSingle = true;
        return finish();
      },
      maybeSingle() {
        state.wantMaybeSingle = true;
        return finish();
      },
      then(
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        return finish().then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    from,
    snapshot() {
      return {
        videos: structuredClone(videos),
        videoProgress: structuredClone(videoProgress),
        stageProgress: structuredClone(stageProgress),
        intervals: structuredClone(intervals),
        editVersion: revisions[0]?.edit_version,
        dismissalCount: dismissals.length,
      };
    },
    dismissals,
    reviewCandidates,
  };
}

describe('dismissals API route auth (source)', () => {
  it('requires requireApiSession and does not call an LLM', () => {
    const source = readFileSync(dismissalsRoutePath, 'utf8');
    assert.match(source, /requireApiSession/);
    assert.match(source, /if \(auth\.error\)/);
    assert.match(source, /applyOwnedPathVideoDismissal/);
    assert.match(source, /parsePathVideoDismissalBody/);
    assert.match(source, /restoreOwnedPathVideoDismissal/);
    assert.match(source, /parsePathVideoDismissalRestoreBody/);
    assert.match(source, /listOwnedActivePathVideoDismissals/);
    assert.match(source, /export async function DELETE/);
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /createOpenAi|llm|followUp|research/i);
    assert.doesNotMatch(source, /requireApiSessionWithAccessToken/);
  });
});

describe('pathVideoDismissalRestoreSchema', () => {
  it('requires pathId and pathVideoId UUIDs', () => {
    const missing = pathVideoDismissalRestoreSchema.safeParse({});
    assert.equal(missing.success, false);

    const parsed = parsePathVideoDismissalRestoreBody({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data, {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
      });
    }
  });
});

describe('applyOwnedPathVideoDismissal', () => {
  it('rejects invalid reason before any write', () => {
    const parsed = parsePathVideoDismissalBody({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'tooEasy',
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.match(parsed.error, /Invalid dismissal reason/i);
    }
  });

  it('returns 404 for a foreign-owned path', async () => {
    const db = createDismissalDb({ includeForeignPath: true });
    const before = db.snapshot();
    const result = await applyOwnedPathVideoDismissal(
      db as never,
      FOREIGN_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'not_relevant',
        broaderFeedback: false,
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, 'Path not found');
    }
    assert.deepEqual(db.snapshot(), before);
  });

  it('returns 404 for a path video that belongs to another path', async () => {
    const db = createDismissalDb({ includeForeignPath: true });
    const before = db.snapshot();
    const result = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: FOREIGN_VIDEO_ID,
        youtubeVideoId: 'zzzzzzzzzzz',
        reason: 'duplicate',
        broaderFeedback: false,
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, 'Path video not found');
    }
    assert.deepEqual(db.snapshot(), before);
  });

  it('returns 404 when the youtube snapshot does not match', async () => {
    const db = createDismissalDb();
    const before = db.snapshot();
    const result = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: 'xxxxxxxxxxx',
        reason: 'outdated',
        broaderFeedback: false,
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, 'Path video not found');
    }
    assert.deepEqual(db.snapshot(), before);
  });

  it('creates an active dismissal and reuses it on repeated submission', async () => {
    const db = createDismissalDb();
    const first = await applyOwnedPathVideoDismissal(db as never, VALID_OWNER, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'too_hard',
      broaderFeedback: true,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.created, true);
    assert.equal(first.dismissal.pathId, VALID_PATH_ID);
    assert.equal(first.dismissal.pathVideoId, VALID_PATH_VIDEO_ID);
    assert.equal(first.dismissal.youtubeVideoId, VALID_YOUTUBE_ID);
    assert.equal(first.dismissal.reason, 'too_hard');
    assert.equal(first.dismissal.broaderFeedback, true);
    assert.equal(db.dismissals.length, 1);

    const second = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'too_easy',
        broaderFeedback: false,
      }
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.created, false);
    assert.equal(second.dismissal.id, first.dismissal.id);
    assert.equal(second.dismissal.reason, 'too_hard');
    assert.equal(second.dismissal.broaderFeedback, true);
    assert.equal(db.dismissals.length, 1);
  });

  it('defaults broaderFeedback to false and preserves progress tables/state', async () => {
    const db = createDismissalDb({ editVersion: 7 });
    const before = db.snapshot();
    const parsed = parsePathVideoDismissalBody({
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'already_known',
    });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;

    const result = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      parsed.data
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(result.dismissal.broaderFeedback, false);

    const after = db.snapshot();
    assert.deepEqual(after.videos, before.videos);
    assert.deepEqual(after.videoProgress, before.videoProgress);
    assert.deepEqual(after.stageProgress, before.stageProgress);
    assert.deepEqual(after.intervals, before.intervals);
    assert.equal(after.editVersion, before.editVersion);
    assert.equal(after.editVersion, 7);
    assert.equal(after.dismissalCount, 1);
  });
});

describe('restoreOwnedPathVideoDismissal', () => {
  it('returns 404 for foreign ownership', async () => {
    const db = createDismissalDb({ includeForeignPath: true });
    await applyOwnedPathVideoDismissal(db as never, VALID_OWNER, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'not_relevant',
      broaderFeedback: false,
    });
    const before = db.snapshot();
    const result = await restoreOwnedPathVideoDismissal(
      db as never,
      FOREIGN_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, 'Path not found');
    }
    assert.equal(db.dismissals[0]?.undismissed_at, null);
    assert.deepEqual(db.snapshot().videoProgress, before.videoProgress);
  });

  it('returns 404 when path_video_id belongs to another path', async () => {
    const db = createDismissalDb({ includeForeignPath: true });
    const before = db.snapshot();
    const result = await restoreOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: FOREIGN_VIDEO_ID,
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.equal(result.error, 'Path video not found');
    }
    assert.deepEqual(db.snapshot(), before);
  });

  it('is idempotent when already restored', async () => {
    const db = createDismissalDb();
    const created = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'duplicate',
        broaderFeedback: false,
      }
    );
    assert.equal(created.ok, true);

    const first = await restoreOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
      }
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.restored, true);
    assert.ok(first.dismissal?.undismissedAt);
    assert.ok(db.dismissals[0]?.undismissed_at);

    const second = await restoreOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
      }
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.restored, false);
    assert.equal(second.dismissal, null);
    assert.equal(db.dismissals.length, 1);
  });

  it('restores an active dismissal successfully', async () => {
    const db = createDismissalDb();
    const created = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'too_easy',
        broaderFeedback: true,
      }
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const result = await restoreOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
      }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.restored, true);
    assert.equal(result.dismissal?.id, created.dismissal.id);
    assert.equal(result.dismissal?.pathVideoId, VALID_PATH_VIDEO_ID);
    assert.equal(result.dismissal?.reason, 'too_easy');
    assert.equal(result.dismissal?.broaderFeedback, true);
    assert.ok(result.dismissal?.undismissedAt);
    assert.equal(isActivePathVideoDismissal(db.dismissals[0]!), false);

    const listed = await listOwnedActivePathVideoDismissals(
      db as never,
      VALID_OWNER,
      VALID_PATH_ID
    );
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.dismissals.length, 0);
  });

  it('preserves path membership, progress, intervals, and edit_version on restore', async () => {
    const db = createDismissalDb({ editVersion: 9 });
    await applyOwnedPathVideoDismissal(db as never, VALID_OWNER, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'outdated',
      broaderFeedback: false,
    });
    const before = db.snapshot();

    const result = await restoreOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
      }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.restored, true);

    const after = db.snapshot();
    assert.deepEqual(after.videos, before.videos);
    assert.deepEqual(after.videoProgress, before.videoProgress);
    assert.deepEqual(after.stageProgress, before.stageProgress);
    assert.deepEqual(after.intervals, before.intervals);
    assert.equal(after.editVersion, before.editVersion);
    assert.equal(after.editVersion, 9);
    assert.equal(after.dismissalCount, 1);
    assert.ok(db.dismissals[0]?.undismissed_at);
  });
});

describe('listOwnedActivePathVideoDismissals', () => {
  it('returns active dismissals with titles for the owned path', async () => {
    const db = createDismissalDb();
    await applyOwnedPathVideoDismissal(db as never, VALID_OWNER, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'poor_quality',
      broaderFeedback: false,
    });

    const listed = await listOwnedActivePathVideoDismissals(
      db as never,
      VALID_OWNER,
      VALID_PATH_ID
    );
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.dismissals.length, 1);
    assert.equal(listed.dismissals[0]?.pathVideoId, VALID_PATH_VIDEO_ID);
    assert.equal(listed.dismissals[0]?.title, 'Video');
    assert.equal(listed.dismissals[0]?.reason, 'poor_quality');
  });
});
