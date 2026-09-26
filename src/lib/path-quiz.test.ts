import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  applyOwnedPathProgress,
  loadOwnedPathProgress,
} from './path-progress.ts';
import {
  assertQuestionPayloadHidesRubric,
  buildQuizEvidence,
  buildTemplateQuizCards,
  ensureStageQuizCards,
  initialQuizDueAt,
  listDueReviewsForOwner,
  listDueReviewsForPath,
  nextScheduleAfterRating,
  QUIZ_METADATA_ONLY_LABEL,
  rememberedIntervalDays,
  selectActiveDueQuizCards,
  submitOwnedQuizReview,
  toQuizCardQuestionPublic,
  type QuizCardRecord,
  type QuizReviewAttemptRecord,
} from './path-quiz.ts';
import type { PathStageWithVideos } from './path-research-schema.ts';
import { derivePathTitle, type PathRecord } from './paths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const OWNER = 'user-a';
const FOREIGN = 'user-b';
const PATH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVISION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ARCHIVED_REVISION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STAGE_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STAGE_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ARCHIVED_STAGE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const VIDEO_A1 = '11111111-1111-4111-8111-111111111111';

function sampleStages(revisionId = REVISION_ID): PathStageWithVideos[] {
  return [
    {
      id: STAGE_A,
      revision_id: revisionId,
      position: 0,
      title: 'Basics',
      learning_objective: 'Learn basics',
      reason: 'Start here',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
      videos: [
        {
          id: VIDEO_A1,
          stage_id: STAGE_A,
          position: 0,
          youtube_video_id: 'aaaaaaaaaaa',
          title: 'Intro',
          channel_title: 'Channel',
          selection_reason: 'Good intro',
          source: 'research',
          duration_seconds: 120,
          thumbnail_url: null,
          verified_at: '2026-09-26T12:00:00.000Z',
          metadata_snapshot: null,
          created_at: '2026-09-26T12:00:00.000Z',
          updated_at: '2026-09-26T12:00:00.000Z',
        },
      ],
    },
    {
      id: STAGE_B,
      revision_id: revisionId,
      position: 1,
      title: 'Practice',
      learning_objective: 'Apply basics',
      reason: 'Hands on',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
      videos: [],
    },
  ];
}

function makePath(): PathRecord {
  return {
    id: PATH_ID,
    owner: OWNER,
    goal: 'Learn Kubernetes',
    background: 'I know Linux',
    title: derivePathTitle('Learn Kubernetes'),
    active_revision_id: REVISION_ID,
    created_at: '2026-09-26T12:00:00.000Z',
    updated_at: '2026-09-26T12:00:00.000Z',
  };
}

function createQuizDb() {
  const paths = [makePath()];
  const revisions = [
    {
      id: REVISION_ID,
      path_id: PATH_ID,
      revision_number: 2,
      status: 'active' as const,
      edit_version: 1,
    },
    {
      id: ARCHIVED_REVISION_ID,
      path_id: PATH_ID,
      revision_number: 1,
      status: 'archived' as const,
      edit_version: 3,
    },
  ];
  const stages = sampleStages().map((stage) => ({
    id: stage.id,
    revision_id: stage.revision_id,
    position: stage.position,
    title: stage.title,
    learning_objective: stage.learning_objective,
    reason: stage.reason,
  }));
  stages.push({
    id: ARCHIVED_STAGE,
    revision_id: ARCHIVED_REVISION_ID,
    position: 0,
    title: 'Old stage',
    learning_objective: 'Old objective',
    reason: 'Archived',
  });
  const videos = sampleStages().flatMap((stage) =>
    stage.videos.map((video) => ({
      id: video.id,
      stage_id: video.stage_id,
      position: video.position,
      youtube_video_id: video.youtube_video_id,
      title: video.title,
      channel_title: video.channel_title,
      selection_reason: video.selection_reason,
      source: video.source,
      duration_seconds: video.duration_seconds,
      thumbnail_url: video.thumbnail_url,
      verified_at: video.verified_at,
      metadata_snapshot: video.metadata_snapshot,
    }))
  );
  const videoProgress: Array<Record<string, unknown>> = [];
  const stageProgress: Array<Record<string, unknown>> = [];
  const stageFollowups: Array<Record<string, unknown>> = [];
  const quizCards: QuizCardRecord[] = [];
  const quizAttempts: QuizReviewAttemptRecord[] = [];

  function matches(
    row: Record<string, unknown>,
    filters: Array<{ column: string; value: unknown; mode: 'eq' | 'in' }>
  ) {
    return filters.every((filter) => {
      if (filter.mode === 'eq') {
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
        return videoProgress;
      case 'path_stage_progress':
        return stageProgress;
      case 'stage_followups':
        return stageFollowups;
      case 'quiz_cards':
        return quizCards as unknown as Record<string, unknown>[];
      case 'quiz_review_attempts':
        return quizAttempts as unknown as Record<string, unknown>[];
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  }

  function from(table: string) {
    const state: {
      filters: Array<{ column: string; value: unknown; mode: 'eq' | 'in' }>;
      orderColumn?: string;
      ascending: boolean;
      mode: 'select' | 'upsert' | 'delete' | 'update';
      pendingUpsert?: Record<string, unknown>;
      pendingUpdate?: Record<string, unknown>;
      wantMaybeSingle: boolean;
      wantSingle: boolean;
    } = {
      filters: [],
      ascending: true,
      mode: 'select',
      wantMaybeSingle: false,
      wantSingle: false,
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
      if (state.mode === 'upsert' && state.pendingUpsert) {
        const payload = { ...state.pendingUpsert };
        if (table === 'path_video_progress') {
          const existing = videoProgress.find(
            (row) =>
              row.owner === payload.owner &&
              row.path_video_id === payload.path_video_id
          );
          if (existing) {
            Object.assign(existing, payload);
            return { data: [existing], error: null };
          }
          const row = {
            id: randomUUID(),
            ...payload,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          videoProgress.push(row);
          return { data: [row], error: null };
        }
      }

      if (state.mode === 'update' && state.pendingUpdate) {
        const rows = resolveSelect();
        for (const row of rows) {
          Object.assign(row, state.pendingUpdate, {
            updated_at: new Date().toISOString(),
          });
        }
        return { data: rows, error: null };
      }

      if (state.mode === 'delete') {
        const rows = resolveSelect();
        const store = tableRows(table);
        for (const row of rows) {
          const index = store.indexOf(row);
          if (index >= 0) store.splice(index, 1);
        }
        return { data: rows, error: null };
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
      upsert(payload: Record<string, unknown>) {
        state.mode = 'upsert';
        state.pendingUpsert = payload;
        return finish();
      },
      update(payload: Record<string, unknown>) {
        state.mode = 'update';
        state.pendingUpdate = payload;
        return builder;
      },
      delete() {
        state.mode = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, value, mode: 'eq' });
        return builder;
      },
      in(column: string, value: unknown[]) {
        state.filters.push({ column, value, mode: 'in' });
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

  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === 'persist_stage_completion_followup') {
      const pathId = String(args.p_path_id);
      const owner = String(args.p_owner);
      const stageId = String(args.p_stage_id);
      const reflection =
        args.p_reflection && String(args.p_reflection).trim().length > 0
          ? String(args.p_reflection).trim()
          : null;
      const pathRow = paths.find((row) => row.id === pathId);
      if (!pathRow || pathRow.owner !== owner) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const revision = revisions.find(
        (row) =>
          row.id === pathRow.active_revision_id && row.status === 'active'
      );
      if (!revision) {
        return { data: { ok: false, code: 'no_active_revision' }, error: null };
      }
      const stage = stages.find(
        (row) => row.id === stageId && row.revision_id === revision.id
      );
      if (!stage) {
        return { data: { ok: false, code: 'foreign_id' }, error: null };
      }
      const existing = stageFollowups.find(
        (row) =>
          row.owner === owner &&
          row.path_stage_id === stageId &&
          row.completion_version === revision.edit_version
      );
      if (existing) {
        let progress = stageProgress.find(
          (row) => row.owner === owner && row.path_stage_id === stageId
        );
        if (!progress) {
          progress = {
            id: randomUUID(),
            owner,
            path_stage_id: stageId,
            completed_at: new Date().toISOString(),
            reflection: existing.reflection,
            completion_version: revision.edit_version,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          stageProgress.push(progress);
        }
        return {
          data: {
            ok: true,
            created: false,
            completion_version: revision.edit_version,
            revision_id: revision.id,
            progress,
            followup: existing,
          },
          error: null,
        };
      }
      const now = new Date().toISOString();
      let progress = stageProgress.find(
        (row) => row.owner === owner && row.path_stage_id === stageId
      );
      if (progress) {
        progress.completed_at = now;
        progress.reflection = reflection;
        progress.completion_version = revision.edit_version;
        progress.updated_at = now;
      } else {
        progress = {
          id: randomUUID(),
          owner,
          path_stage_id: stageId,
          completed_at: now,
          reflection,
          completion_version: revision.edit_version,
          created_at: now,
          updated_at: now,
        };
        stageProgress.push(progress);
      }
      const followup = {
        id: randomUUID(),
        owner,
        path_id: pathId,
        path_stage_id: stageId,
        revision_id: revision.id,
        completion_version: revision.edit_version,
        reflection,
        practiced_summary: String(args.p_practiced_summary),
        encouragement: String(args.p_encouragement),
        next_step: String(args.p_next_step),
        source: args.p_source === 'model' ? 'model' : 'template',
        created_at: now,
        updated_at: now,
      };
      stageFollowups.push(followup);
      return {
        data: {
          ok: true,
          created: true,
          completion_version: revision.edit_version,
          revision_id: revision.id,
          progress,
          followup,
        },
        error: null,
      };
    }

    if (name === 'insert_stage_quiz_cards') {
      const pathId = String(args.p_path_id);
      const owner = String(args.p_owner);
      const stageId = String(args.p_stage_id);
      const completionVersion = Number(args.p_completion_version);
      const pathRow = paths.find((row) => row.id === pathId);
      if (!pathRow || pathRow.owner !== owner) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const revision = revisions.find(
        (row) =>
          row.id === pathRow.active_revision_id && row.status === 'active'
      );
      if (!revision) {
        return { data: { ok: false, code: 'no_active_revision' }, error: null };
      }
      if (revision.edit_version !== completionVersion) {
        return {
          data: { ok: false, code: 'stale_completion_version' },
          error: null,
        };
      }
      const stage = stages.find(
        (row) => row.id === stageId && row.revision_id === revision.id
      );
      if (!stage) {
        return { data: { ok: false, code: 'foreign_id' }, error: null };
      }
      const existing = quizCards.filter(
        (row) =>
          row.owner === owner &&
          row.path_stage_id === stageId &&
          row.completion_version === completionVersion
      );
      if (existing.length > 0) {
        return {
          data: {
            ok: true,
            created: false,
            revision_id: revision.id,
            completion_version: completionVersion,
            cards: existing,
          },
          error: null,
        };
      }
      const payload = Array.isArray(args.p_cards)
        ? (args.p_cards as Array<Record<string, unknown>>)
        : [];
      const now = new Date().toISOString();
      const created = payload.map((card, index) => {
        const row: QuizCardRecord = {
          id: randomUUID(),
          owner,
          path_id: pathId,
          path_stage_id: stageId,
          revision_id: revision.id,
          completion_version: completionVersion,
          card_index:
            typeof card.card_index === 'number' ? card.card_index : index,
          question: String(card.question),
          answer_rubric: String(card.answer_rubric),
          evidence_basis: String(card.evidence_basis),
          evidence_label: String(card.evidence_label),
          is_metadata_only: card.is_metadata_only !== false,
          schedule_version: 0,
          due_at: String(args.p_due_at),
          review_state: 'new',
          created_at: now,
          updated_at: now,
        };
        quizCards.push(row);
        return row;
      });
      return {
        data: {
          ok: true,
          created: true,
          revision_id: revision.id,
          completion_version: completionVersion,
          cards: created,
        },
        error: null,
      };
    }

    if (name === 'submit_quiz_review') {
      const pathId = String(args.p_path_id);
      const owner = String(args.p_owner);
      const cardId = String(args.p_card_id);
      const rating = String(args.p_rating) === 'again' ? 'again' : 'remembered';
      const expected = Number(args.p_expected_schedule_version);
      const reviewedAt = new Date(String(args.p_reviewed_at));
      const pathRow = paths.find((row) => row.id === pathId);
      if (!pathRow || pathRow.owner !== owner) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const card = quizCards.find(
        (row) =>
          row.id === cardId && row.owner === owner && row.path_id === pathId
      );
      if (!card) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const revision = revisions.find((row) => row.id === card.revision_id);
      if (
        !revision ||
        pathRow.active_revision_id !== card.revision_id ||
        revision.status !== 'active'
      ) {
        return { data: { ok: false, code: 'archived_revision' }, error: null };
      }

      const existingAttempt = quizAttempts.find(
        (row) =>
          row.quiz_card_id === card.id &&
          row.schedule_version_before === expected
      );
      if (existingAttempt) {
        return {
          data: {
            ok: true,
            created: false,
            card,
            attempt: existingAttempt,
          },
          error: null,
        };
      }

      if (card.schedule_version !== expected) {
        return { data: { ok: false, code: 'stale_schedule' }, error: null };
      }

      const next = nextScheduleAfterRating({
        rating,
        scheduleVersionBefore: card.schedule_version,
        reviewedAt,
        dueAtBefore: new Date(card.due_at),
      });

      const attempt: QuizReviewAttemptRecord = {
        id: randomUUID(),
        owner,
        quiz_card_id: card.id,
        path_id: card.path_id,
        path_stage_id: card.path_stage_id,
        revision_id: card.revision_id,
        rating,
        schedule_version_before: card.schedule_version,
        schedule_version_after: next.scheduleVersionAfter,
        due_at_before: card.due_at,
        due_at_after: next.dueAtAfter.toISOString(),
        review_state_after: next.reviewStateAfter,
        reviewed_at: reviewedAt.toISOString(),
        created_at: reviewedAt.toISOString(),
      };
      quizAttempts.push(attempt);
      card.schedule_version = next.scheduleVersionAfter;
      card.due_at = next.dueAtAfter.toISOString();
      card.review_state = next.reviewStateAfter;
      card.updated_at = reviewedAt.toISOString();

      return {
        data: {
          ok: true,
          created: true,
          card,
          attempt,
        },
        error: null,
      };
    }

    throw new Error(`Unexpected rpc ${name}`);
  }

  return {
    from,
    rpc,
    paths,
    revisions,
    quizCards,
    quizAttempts,
    stageProgress,
    stageFollowups,
    archiveActiveRevision() {
      const active = revisions.find((row) => row.id === REVISION_ID);
      if (active) active.status = 'archived';
      paths[0]!.active_revision_id = ARCHIVED_REVISION_ID;
      const archived = revisions.find((row) => row.id === ARCHIVED_REVISION_ID);
      if (archived) archived.status = 'active';
    },
    restoreActiveRevision() {
      const archived = revisions.find((row) => row.id === ARCHIVED_REVISION_ID);
      if (archived) archived.status = 'archived';
      const active = revisions.find((row) => row.id === REVISION_ID);
      if (active) active.status = 'active';
      paths[0]!.active_revision_id = REVISION_ID;
    },
  };
}

describe('Slice 8 quiz generation and evidence', () => {
  it('builds evidence from objectives, video titles, and reflection only', () => {
    const evidence = buildQuizEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      goal: 'Learn Kubernetes',
      reflection: 'I practiced intro',
    });
    assert.ok(evidence);
    assert.equal(evidence?.learningObjective, 'Learn basics');
    assert.deepEqual(evidence?.videoTitles, ['Intro']);
    assert.equal(evidence?.reflection, 'I practiced intro');
  });

  it('labels metadata-only questions as general topic practice', () => {
    const evidence = buildQuizEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      goal: 'Learn Kubernetes',
      reflection: null,
    });
    assert.ok(evidence);
    const cards = buildTemplateQuizCards(evidence!);
    assert.ok(cards.length >= 2);
    for (const card of cards) {
      assert.equal(card.is_metadata_only, true);
      assert.equal(card.evidence_label, QUIZ_METADATA_ONLY_LABEL);
      assert.match(card.question, /General topic practice/);
      assert.match(
        card.answer_rubric,
        /Do not require details that only appear inside video playback|metadata titles|Titles are the only/
      );
    }
  });

  it('includes reflection evidence wording when present', () => {
    const evidence = buildQuizEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      goal: 'Learn Kubernetes',
      reflection: 'Tried the lab notes',
    });
    const cards = buildTemplateQuizCards(evidence!);
    assert.equal(cards.length, 3);
    assert.equal(cards[2]?.evidence_basis, 'objectives_metadata_reflection');
    assert.match(cards[2]!.answer_rubric, /Tried the lab notes/);
    assert.match(cards[2]!.answer_rubric, /not proof of mastery/);
  });

  it('hides answer rubrics from the public question payload', () => {
    const now = new Date('2026-09-26T12:00:00.000Z');
    const record: QuizCardRecord = {
      id: randomUUID(),
      owner: OWNER,
      path_id: PATH_ID,
      path_stage_id: STAGE_A,
      revision_id: REVISION_ID,
      completion_version: 1,
      card_index: 0,
      question: 'Q?',
      answer_rubric: 'SECRET RUBRIC',
      evidence_basis: 'objectives_metadata',
      evidence_label: QUIZ_METADATA_ONLY_LABEL,
      is_metadata_only: true,
      schedule_version: 0,
      due_at: initialQuizDueAt(now).toISOString(),
      review_state: 'new',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const publicPayload = toQuizCardQuestionPublic(record) as unknown as Record<
      string,
      unknown
    >;
    assert.equal(assertQuestionPayloadHidesRubric(publicPayload), true);
    assert.equal('answerRubric' in publicPayload, false);
    assert.equal('answer_rubric' in publicPayload, false);
    assert.equal(publicPayload.question, 'Q?');
  });
});

describe('Slice 8 schedule transitions and UTC handling', () => {
  it('uses +1 day first due and Remembered 3/7/14/30 with Again reset', () => {
    const reviewedAt = new Date('2026-01-15T15:30:00.000Z');
    assert.equal(
      initialQuizDueAt(reviewedAt).toISOString(),
      '2026-01-16T15:30:00.000Z'
    );
    assert.equal(rememberedIntervalDays(0), 3);
    assert.equal(rememberedIntervalDays(1), 7);
    assert.equal(rememberedIntervalDays(2), 14);
    assert.equal(rememberedIntervalDays(3), 30);
    assert.equal(rememberedIntervalDays(4), 30);

    const first = nextScheduleAfterRating({
      rating: 'remembered',
      scheduleVersionBefore: 0,
      reviewedAt,
      dueAtBefore: initialQuizDueAt(reviewedAt),
    });
    assert.equal(first.scheduleVersionAfter, 1);
    assert.equal(first.dueAtAfter.toISOString(), '2026-01-18T15:30:00.000Z');
    assert.equal(first.reviewStateAfter, 'review');

    const again = nextScheduleAfterRating({
      rating: 'again',
      scheduleVersionBefore: 2,
      reviewedAt,
      dueAtBefore: first.dueAtAfter,
    });
    assert.equal(again.scheduleVersionAfter, 0);
    assert.equal(again.dueAtAfter.toISOString(), '2026-01-16T15:30:00.000Z');
    assert.equal(again.reviewStateAfter, 'relearning');
  });

  it('keeps due arithmetic in UTC across local time-zone offsets', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      // Near a Pacific day boundary: 2026-03-08 01:30 UTC is still previous local day.
      const nearBoundary = new Date('2026-03-08T01:30:00.000Z');
      const due = initialQuizDueAt(nearBoundary);
      assert.equal(due.toISOString(), '2026-03-09T01:30:00.000Z');

      const remembered = nextScheduleAfterRating({
        rating: 'remembered',
        scheduleVersionBefore: 0,
        reviewedAt: nearBoundary,
        dueAtBefore: due,
      });
      assert.equal(
        remembered.dueAtAfter.toISOString(),
        '2026-03-11T01:30:00.000Z'
      );
    } finally {
      if (previousTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTz;
      }
    }
  });
});

describe('Slice 8 persistence, idempotency, ownership, archive', () => {
  it('generates a small card set once on stage completion and not on reload', async () => {
    const db = createQuizDb();
    const first = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A, reflection: 'notes' },
      new Date('2026-09-26T12:00:00.000Z'),
      { llm: null }
    );
    assert.equal(first.ok, true);
    assert.ok(db.quizCards.length >= 2);
    assert.ok(db.quizCards.length <= 3);
    const countAfterFirst = db.quizCards.length;
    const ids = db.quizCards.map((row) => row.id).sort();

    const second = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A, reflection: 'retry' },
      new Date('2026-09-26T13:00:00.000Z'),
      { llm: null }
    );
    assert.equal(second.ok, true);
    assert.equal(db.quizCards.length, countAfterFirst);
    assert.deepEqual(db.quizCards.map((row) => row.id).sort(), ids);

    const loaded = await loadOwnedPathProgress(db as never, OWNER, PATH_ID);
    assert.equal(loaded.ok, true);
    assert.equal(db.quizCards.length, countAfterFirst);
  });

  it('ensureStageQuizCards is one-time and returns questions without rubrics', async () => {
    const db = createQuizDb();
    const first = await ensureStageQuizCards({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      stageId: STAGE_A,
      completionVersion: 1,
      stages: sampleStages(),
      goal: 'Learn Kubernetes',
      reflection: null,
      now: new Date('2026-09-26T12:00:00.000Z'),
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.created, true);
    for (const question of first.questions) {
      assert.equal(
        assertQuestionPayloadHidesRubric(
          question as unknown as Record<string, unknown>
        ),
        true
      );
    }

    const second = await ensureStageQuizCards({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      stageId: STAGE_A,
      completionVersion: 1,
      stages: sampleStages(),
      goal: 'Learn Kubernetes',
      reflection: null,
      now: new Date('2026-09-27T12:00:00.000Z'),
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.created, false);
    assert.equal(second.cards.length, first.cards.length);
    assert.equal(db.quizCards.length, first.cards.length);
  });

  it('submits reviews idempotently without double-advance', async () => {
    const db = createQuizDb();
    const ensured = await ensureStageQuizCards({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      stageId: STAGE_A,
      completionVersion: 1,
      stages: sampleStages(),
      goal: 'Learn Kubernetes',
      reflection: null,
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;
    const cardId = ensured.cards[0]!.id;
    const reviewedAt = new Date('2026-09-02T00:00:00.000Z');

    const first = await submitOwnedQuizReview({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      cardId,
      rating: 'remembered',
      expectedScheduleVersion: 0,
      now: reviewedAt,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.created, true);
    assert.equal(first.question.scheduleVersion, 1);
    assert.equal(first.question.dueAt, '2026-09-05T00:00:00.000Z');
    assert.equal(db.quizAttempts.length, 1);

    const retry = await submitOwnedQuizReview({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      cardId,
      rating: 'remembered',
      expectedScheduleVersion: 0,
      now: new Date('2026-09-02T01:00:00.000Z'),
    });
    assert.equal(retry.ok, true);
    if (!retry.ok) return;
    assert.equal(retry.created, false);
    assert.equal(retry.attempt.id, first.attempt.id);
    assert.equal(db.quizAttempts.length, 1);
    assert.equal(db.quizCards[0]?.schedule_version, 1);
    assert.equal(db.quizCards[0]?.due_at, '2026-09-05T00:00:00.000Z');
  });

  it('excludes archived-revision cards from the active due list but retains history', async () => {
    const db = createQuizDb();
    const ensured = await ensureStageQuizCards({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      stageId: STAGE_A,
      completionVersion: 1,
      stages: sampleStages(),
      goal: 'Learn Kubernetes',
      reflection: null,
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;

    // Make cards due now.
    for (const card of db.quizCards) {
      card.due_at = '2026-09-01T00:00:00.000Z';
    }

    const before = await listDueReviewsForPath({
      db: db as never,
      ownerId: OWNER,
      pathId: PATH_ID,
      now: new Date('2026-09-02T00:00:00.000Z'),
    });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.ok(before.due.length > 0);

    const archivedCard: QuizCardRecord = {
      ...db.quizCards[0]!,
      id: randomUUID(),
      path_stage_id: ARCHIVED_STAGE,
      revision_id: ARCHIVED_REVISION_ID,
      completion_version: 3,
      due_at: '2026-09-01T00:00:00.000Z',
    };
    db.quizCards.push(archivedCard);

    db.archiveActiveRevision();

    const afterArchive = selectActiveDueQuizCards({
      cards: db.quizCards,
      activeRevisionId: ARCHIVED_REVISION_ID,
      now: new Date('2026-09-02T00:00:00.000Z'),
    });
    assert.equal(
      afterArchive.every((row) => row.revision_id === ARCHIVED_REVISION_ID),
      true
    );
    assert.equal(
      afterArchive.some((row) => row.revision_id === REVISION_ID),
      false
    );
    assert.ok(db.quizCards.some((row) => row.revision_id === REVISION_ID));

    db.restoreActiveRevision();
    const restored = selectActiveDueQuizCards({
      cards: db.quizCards,
      activeRevisionId: REVISION_ID,
      now: new Date('2026-09-02T00:00:00.000Z'),
    });
    assert.ok(restored.some((row) => row.revision_id === REVISION_ID));
    assert.equal(
      restored.some((row) => row.revision_id === ARCHIVED_REVISION_ID),
      false
    );
  });

  it('enforces ownership privacy for foreign users', async () => {
    const db = createQuizDb();
    const foreignEnsure = await ensureStageQuizCards({
      db: db as never,
      ownerId: FOREIGN,
      pathId: PATH_ID,
      stageId: STAGE_A,
      completionVersion: 1,
      stages: sampleStages(),
      goal: 'Learn Kubernetes',
      reflection: null,
    });
    assert.equal(foreignEnsure.ok, false);
    if (!foreignEnsure.ok) {
      assert.equal(foreignEnsure.status, 404);
    }
    assert.equal(db.quizCards.length, 0);

    const foreignDue = await listDueReviewsForPath({
      db: db as never,
      ownerId: FOREIGN,
      pathId: PATH_ID,
    });
    assert.equal(foreignDue.ok, false);
    if (!foreignDue.ok) {
      assert.equal(foreignDue.status, 404);
    }

    const ownerList = await listDueReviewsForOwner({
      db: db as never,
      ownerId: FOREIGN,
    });
    assert.equal(ownerList.ok, true);
    if (!ownerList.ok) return;
    assert.equal(ownerList.summaries.length, 0);
  });
});

describe('Slice 8 migration hardening', () => {
  it('creates quiz_cards and immutable quiz_review_attempts with deny-by-default RLS', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/20260926200000_create_quiz_cards.sql'),
      'utf8'
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.quiz_cards/);
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS public\.quiz_review_attempts/
    );
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.quiz_cards FROM anon/);
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.quiz_cards FROM authenticated/
    );
    assert.match(sql, /GRANT ALL ON TABLE public\.quiz_cards TO service_role/);
    assert.match(
      sql,
      /GRANT SELECT, INSERT, DELETE ON TABLE public\.quiz_review_attempts TO service_role/
    );
    assert.match(sql, /quiz_review_attempts are immutable/);
    assert.match(sql, /insert_stage_quiz_cards/);
    assert.match(sql, /submit_quiz_review/);
    assert.match(sql, /due_at/);
    assert.match(sql, /schedule_version/);
    assert.match(sql, /answer_rubric/);
  });
});
