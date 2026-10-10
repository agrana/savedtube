import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_CONTRADICTING_EVIDENCE,
  PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_STATUS,
  PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_SUPPORTING_EVIDENCE,
  PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_STATUSES,
  ensurePathVideoDismissalReviewCandidate,
  isPathVideoDismissalReviewCandidateActiveForPathGeneration,
  listOwnedPathVideoDismissalReviewCandidates,
  type PathVideoDismissalReviewCandidateRecord,
  type PathVideoDismissalReviewCandidateStatus,
} from './path-dismissal-review-candidates.ts';
import {
  applyOwnedPathVideoDismissal,
  type PathVideoDismissalRecord,
} from './path-dismissals.ts';
import {
  excludeActiveDismissedPathVideos,
  loadActiveDismissedPathVideoIds,
} from './path-dismissal-filter.ts';
import type { PathStageWithVideos } from './path-research-schema.ts';
import type { PathRecord } from './paths.ts';
import { derivePathTitle } from './paths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = join(
  root,
  'supabase/migrations/20261010150000_create_path_video_dismissal_review_candidates.sql'
);
const candidatesRoutePath = join(
  root,
  'src/app/api/paths/dismissal-review-candidates/route.ts'
);
const filterSourcePath = join(root, 'src/lib/path-dismissal-filter.ts');

const VALID_PATH_ID = '11111111-1111-4111-8111-111111111111';
const VALID_PATH_VIDEO_ID = '22222222-2222-4222-8222-222222222222';
const VALID_YOUTUBE_ID = 'dQw4w9WgXcQ';
const VALID_OWNER = 'user-owner-1';
const FOREIGN_OWNER = 'user-foreign-2';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const STAGE_ID = '44444444-4444-4444-8444-444444444444';

describe('path_video_dismissal_review_candidates migration contract', () => {
  it('creates candidate table linked to dismissals with status enum, evidence counts, provenance, and deny-by-default RLS', () => {
    const source = readFileSync(migrationPath, 'utf8');

    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS public\.path_video_dismissal_review_candidates/
    );
    assert.match(
      source,
      /dismissal_id UUID NOT NULL REFERENCES public\.path_video_dismissals/
    );
    assert.match(source, /owner TEXT NOT NULL/);
    assert.match(source, /path_id UUID NOT NULL REFERENCES public\.paths/);
    assert.match(
      source,
      /path_video_id UUID NOT NULL REFERENCES public\.path_videos/
    );
    assert.match(source, /youtube_video_id TEXT NOT NULL/);
    assert.match(
      source,
      /supporting_evidence_count INTEGER NOT NULL DEFAULT 1/
    );
    assert.match(
      source,
      /contradicting_evidence_count INTEGER NOT NULL DEFAULT 0/
    );
    assert.match(source, /assessed_at TIMESTAMPTZ/);
    assert.match(source, /reviewer_id TEXT/);
    assert.match(source, /model_id TEXT/);
    assert.match(source, /assessment_notes TEXT/);
    assert.match(
      source,
      /path_video_dismissal_review_candidates_one_per_dismissal/
    );
    assert.match(source, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      source,
      /GRANT ALL ON TABLE public\.path_video_dismissal_review_candidates TO service_role/
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.path_video_dismissal_review_candidates FROM anon/
    );
    assert.match(
      source,
      /REVOKE ALL ON TABLE public\.path_video_dismissal_review_candidates FROM authenticated/
    );

    for (const status of PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_STATUSES) {
      assert.match(
        source,
        new RegExp(`'${status}'`),
        `migration must allow status ${status}`
      );
    }
  });

  it('does not call an LLM or alter path generation tables', () => {
    const source = readFileSync(migrationPath, 'utf8');
    assert.doesNotMatch(source, /openai|llm|embedding/i);
    assert.doesNotMatch(source, /ALTER TABLE\s+public\.path_videos\b/i);
    assert.doesNotMatch(source, /ALTER TABLE\s+public\.path_revisions\b/i);
  });
});

describe('candidate status inactivity', () => {
  it('treats every status as inactive for path generation', () => {
    for (const status of PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_STATUSES) {
      assert.equal(
        isPathVideoDismissalReviewCandidateActiveForPathGeneration(status),
        false,
        `status ${status} must not affect path generation`
      );
    }
    assert.equal(
      PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_STATUS,
      'pending'
    );
    assert.equal(
      PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_SUPPORTING_EVIDENCE,
      1
    );
    assert.equal(
      PATH_VIDEO_DISMISSAL_REVIEW_CANDIDATE_INITIAL_CONTRADICTING_EVIDENCE,
      0
    );
  });
});

describe('dismissal-review-candidates API route auth (source)', () => {
  it('requires requireApiSession, lists owned candidates only, and does not call an LLM', () => {
    const source = readFileSync(candidatesRoutePath, 'utf8');
    assert.match(source, /requireApiSession/);
    assert.match(source, /if \(auth\.error\)/);
    assert.match(source, /listOwnedPathVideoDismissalReviewCandidates/);
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /createOpenAi|llm|followUp|research/i);
    assert.doesNotMatch(source, /requireApiSessionWithAccessToken/);
  });
});

describe('path-dismissal-filter has no candidate table impact', () => {
  it('never reads path_video_dismissal_review_candidates', () => {
    const source = readFileSync(filterSourcePath, 'utf8');
    assert.doesNotMatch(source, /path_video_dismissal_review_candidates/);
    assert.match(source, /path_video_dismissals/);
  });
});

type RevisionRow = {
  id: string;
  path_id: string;
  revision_number: number;
  status: 'active' | 'draft' | 'archived';
  edit_version: number;
};

function createCandidateDb(args?: {
  owner?: string;
  pathId?: string;
  pathVideoId?: string;
  youtubeVideoId?: string;
}) {
  const owner = args?.owner ?? VALID_OWNER;
  const pathId = args?.pathId ?? VALID_PATH_ID;
  const pathVideoId = args?.pathVideoId ?? VALID_PATH_VIDEO_ID;
  const youtubeVideoId = args?.youtubeVideoId ?? VALID_YOUTUBE_ID;

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
      edit_version: 1,
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
  const dismissals: PathVideoDismissalRecord[] = [];
  const reviewCandidates: PathVideoDismissalReviewCandidateRecord[] = [];

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
        if (table === 'path_video_dismissals') {
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
              (payload.status as PathVideoDismissalReviewCandidateStatus) ||
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

        throw new Error(`Unexpected insert into ${table}`);
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
      update() {
        throw new Error(`Unexpected update on ${table}`);
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
    dismissals,
    reviewCandidates,
  };
}

describe('broaderFeedback checkbox drives candidate creation', () => {
  it('creates no candidate when broaderFeedback is false', async () => {
    const db = createCandidateDb();
    const result = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'not_relevant',
        broaderFeedback: false,
      }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(result.dismissal.broaderFeedback, false);
    assert.equal(db.dismissals.length, 1);
    assert.equal(db.reviewCandidates.length, 0);

    const listed = await listOwnedPathVideoDismissalReviewCandidates(
      db as never,
      VALID_OWNER
    );
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.candidates.length, 0);
  });

  it('creates a pending candidate with deterministic evidence when broaderFeedback is true', async () => {
    const db = createCandidateDb();
    const result = await applyOwnedPathVideoDismissal(
      db as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'poor_quality',
        broaderFeedback: true,
      }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(db.dismissals.length, 1);
    assert.equal(db.reviewCandidates.length, 1);

    const candidate = db.reviewCandidates[0]!;
    assert.equal(candidate.dismissal_id, result.dismissal.id);
    assert.equal(candidate.owner, VALID_OWNER);
    assert.equal(candidate.path_id, VALID_PATH_ID);
    assert.equal(candidate.path_video_id, VALID_PATH_VIDEO_ID);
    assert.equal(candidate.youtube_video_id, VALID_YOUTUBE_ID);
    assert.equal(candidate.reason, 'poor_quality');
    assert.equal(candidate.status, 'pending');
    assert.equal(candidate.supporting_evidence_count, 1);
    assert.equal(candidate.contradicting_evidence_count, 0);
    assert.equal(candidate.reviewer_id, null);
    assert.equal(candidate.model_id, null);
    assert.equal(candidate.assessment_notes, null);
    assert.equal(candidate.assessed_at, null);
  });
});

describe('candidate creation idempotency', () => {
  it('avoids duplicate candidates for the same active dismissal', async () => {
    const db = createCandidateDb();
    const first = await applyOwnedPathVideoDismissal(db as never, VALID_OWNER, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'too_hard',
      broaderFeedback: true,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const second = await applyOwnedPathVideoDismissal(
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
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.created, false);
    assert.equal(second.dismissal.id, first.dismissal.id);
    assert.equal(db.dismissals.length, 1);
    assert.equal(db.reviewCandidates.length, 1);
    assert.equal(db.reviewCandidates[0]?.dismissal_id, first.dismissal.id);

    const ensureAgain = await ensurePathVideoDismissalReviewCandidate(
      db as never,
      VALID_OWNER,
      second.dismissal
    );
    assert.equal(ensureAgain.ok, true);
    if (!ensureAgain.ok) return;
    assert.equal(ensureAgain.created, false);
    assert.equal(ensureAgain.candidate?.id, db.reviewCandidates[0]?.id);
    assert.equal(db.reviewCandidates.length, 1);
  });
});

describe('ownership privacy for review candidates', () => {
  it('lists only the current user candidates and hides foreign feedback', async () => {
    const ownerDb = createCandidateDb({ owner: VALID_OWNER });
    const foreignDb = createCandidateDb({ owner: FOREIGN_OWNER });

    const owned = await applyOwnedPathVideoDismissal(
      ownerDb as never,
      VALID_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'outdated',
        broaderFeedback: true,
      }
    );
    assert.equal(owned.ok, true);

    const foreign = await applyOwnedPathVideoDismissal(
      foreignDb as never,
      FOREIGN_OWNER,
      {
        pathId: VALID_PATH_ID,
        pathVideoId: VALID_PATH_VIDEO_ID,
        youtubeVideoId: VALID_YOUTUBE_ID,
        reason: 'duplicate',
        broaderFeedback: true,
      }
    );
    assert.equal(foreign.ok, true);

    // Shared listing surface: merge rows but filter by owner in the query helper.
    const shared = {
      from(table: string) {
        if (table !== 'path_video_dismissal_review_candidates') {
          return ownerDb.from(table);
        }
        const all = [
          ...ownerDb.reviewCandidates,
          ...foreignDb.reviewCandidates,
        ];
        const state: {
          filters: Array<{ column: string; value: unknown }>;
          orderColumn?: string;
          ascending: boolean;
        } = { filters: [], ascending: true };
        const finish = async () => {
          let rows = all.filter((row) =>
            state.filters.every(
              (filter) =>
                (row as unknown as Record<string, unknown>)[filter.column] ===
                filter.value
            )
          );
          if (state.orderColumn) {
            const column = state.orderColumn;
            rows = [...rows].sort((a, b) => {
              const left = (a as unknown as Record<string, unknown>)[column];
              const right = (b as unknown as Record<string, unknown>)[column];
              if (left === right) return 0;
              if (String(left) < String(right)) return state.ascending ? -1 : 1;
              return state.ascending ? 1 : -1;
            });
          }
          return { data: rows, error: null };
        };
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            state.filters.push({ column, value });
            return builder;
          },
          order(column: string, options: { ascending: boolean }) {
            state.orderColumn = column;
            state.ascending = options.ascending;
            return builder;
          },
          then(
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown
          ) {
            return finish().then(resolve, reject);
          },
        };
        return builder;
      },
    };

    const listed = await listOwnedPathVideoDismissalReviewCandidates(
      shared as never,
      VALID_OWNER
    );
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.candidates.length, 1);
    assert.equal(listed.candidates[0]?.pathId, VALID_PATH_ID);
    assert.equal(listed.candidates[0]?.reason, 'outdated');
    assert.ok(
      !listed.candidates.some((candidate) => candidate.reason === 'duplicate')
    );
  });
});

describe('candidates do not affect path dismissal filters', () => {
  it('keeps path-filter behavior based only on active dismissals', async () => {
    const db = createCandidateDb();
    const stages: PathStageWithVideos[] = [
      {
        id: STAGE_ID,
        revision_id: REVISION_ID,
        position: 0,
        title: 'Stage',
        learning_objective: 'Learn',
        reason: 'Start',
        created_at: '2026-10-10T12:00:00.000Z',
        updated_at: '2026-10-10T12:00:00.000Z',
        videos: [
          {
            id: VALID_PATH_VIDEO_ID,
            stage_id: STAGE_ID,
            position: 0,
            youtube_video_id: VALID_YOUTUBE_ID,
            title: 'Video',
            channel_title: 'Channel',
            selection_reason: 'Relevant',
            source: 'research',
            duration_seconds: 120,
            thumbnail_url: null,
            verified_at: '2026-10-10T12:00:00.000Z',
            metadata_snapshot: null,
            created_at: '2026-10-10T12:00:00.000Z',
            updated_at: '2026-10-10T12:00:00.000Z',
          },
        ],
      },
    ];

    const before = await loadActiveDismissedPathVideoIds(
      db as never,
      VALID_OWNER,
      VALID_PATH_ID
    );
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.equal(before.pathVideoIds.size, 0);

    await applyOwnedPathVideoDismissal(db as never, VALID_OWNER, {
      pathId: VALID_PATH_ID,
      pathVideoId: VALID_PATH_VIDEO_ID,
      youtubeVideoId: VALID_YOUTUBE_ID,
      reason: 'already_known',
      broaderFeedback: true,
    });
    assert.equal(db.reviewCandidates.length, 1);
    assert.equal(
      isPathVideoDismissalReviewCandidateActiveForPathGeneration(
        db.reviewCandidates[0]!.status
      ),
      false
    );

    const after = await loadActiveDismissedPathVideoIds(
      db as never,
      VALID_OWNER,
      VALID_PATH_ID
    );
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.pathVideoIds.size, 1);
    assert.ok(after.pathVideoIds.has(VALID_PATH_VIDEO_ID));

    const filtered = excludeActiveDismissedPathVideos(
      stages,
      after.pathVideoIds
    );
    assert.equal(filtered[0]?.videos.length, 0);

    // Candidate rows alone never contribute dismissed ids.
    const dismissalOnlyIds = new Set(
      db.dismissals
        .filter((row) => row.undismissed_at == null)
        .map((row) => row.path_video_id)
    );
    assert.deepEqual(
      [...after.pathVideoIds].sort(),
      [...dismissalOnlyIds].sort()
    );
  });
});
