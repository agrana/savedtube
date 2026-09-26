import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  applyOwnedPathProgress,
  type PathStageProgressRecord,
} from './path-progress.ts';
import {
  buildFollowUpEvidence,
  buildTemplateFollowUp,
  resolveFollowUpContent,
  sanitizeFollowUpContent,
  selectCurrentFollowUps,
  type FollowUpLlm,
  type StageFollowUpRecord,
} from './path-followup.ts';
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
const VIDEO_A2 = '22222222-2222-4222-8222-222222222222';
const VIDEO_B1 = '33333333-3333-4333-8333-333333333333';

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
        {
          id: VIDEO_A2,
          stage_id: STAGE_A,
          position: 1,
          youtube_video_id: 'bbbbbbbbbbb',
          title: 'Pods',
          channel_title: 'Channel',
          selection_reason: 'Core concept',
          source: 'research',
          duration_seconds: 180,
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
      videos: [
        {
          id: VIDEO_B1,
          stage_id: STAGE_B,
          position: 0,
          youtube_video_id: 'ccccccccccc',
          title: 'Lab',
          channel_title: 'Channel',
          selection_reason: 'Practice',
          source: 'research',
          duration_seconds: 240,
          thumbnail_url: null,
          verified_at: '2026-09-26T12:00:00.000Z',
          metadata_snapshot: null,
          created_at: '2026-09-26T12:00:00.000Z',
          updated_at: '2026-09-26T12:00:00.000Z',
        },
      ],
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

type FollowupRow = StageFollowUpRecord;

function createFollowupDb(args?: { editVersion?: number }) {
  const editVersion = args?.editVersion ?? 1;
  const paths = [makePath()];
  const revisions = [
    {
      id: REVISION_ID,
      path_id: PATH_ID,
      revision_number: 2,
      status: 'active' as const,
      edit_version: editVersion,
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
  const videoProgress: Array<{
    id: string;
    owner: string;
    path_video_id: string;
    practiced: boolean;
    practiced_at: string | null;
    created_at: string;
    updated_at: string;
  }> = [];
  const stageProgress: PathStageProgressRecord[] = [];
  const stageFollowups: FollowupRow[] = [];
  const quizCards: Array<Record<string, unknown>> = [];
  let llmCalls = 0;

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
        return videoProgress as unknown as Record<string, unknown>[];
      case 'path_stage_progress':
        return stageProgress as unknown as Record<string, unknown>[];
      case 'stage_followups':
        return stageFollowups as unknown as Record<string, unknown>[];
      case 'quiz_cards':
        return quizCards;
      case 'quiz_review_attempts':
        return [];
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  }

  function from(table: string) {
    const state: {
      filters: Array<{ column: string; value: unknown; mode: 'eq' | 'in' }>;
      orderColumn?: string;
      ascending: boolean;
      mode: 'select' | 'upsert' | 'delete';
      pendingUpsert?: Record<string, unknown>;
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
            owner: String(payload.owner),
            path_video_id: String(payload.path_video_id),
            practiced: Boolean(payload.practiced),
            practiced_at: (payload.practiced_at as string | null) ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          videoProgress.push(row);
          return { data: [row], error: null };
        }
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
        const row = {
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

    if (name !== 'persist_stage_completion_followup') {
      throw new Error(`Unexpected rpc ${name}`);
    }
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
      (row) => row.id === pathRow.active_revision_id && row.status === 'active'
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

    const followup: FollowupRow = {
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

  const failingLlm: FollowUpLlm = {
    provider: 'test',
    model: 'test',
    async generateFollowUp() {
      llmCalls += 1;
      return {
        ok: false,
        code: 'provider_error',
        message: 'boom',
        latencyMs: 1,
      };
    },
  };

  const succeedingLlm: FollowUpLlm = {
    provider: 'test',
    model: 'test',
    async generateFollowUp() {
      llmCalls += 1;
      return {
        ok: true,
        data: {
          practicedSummary: 'You practiced Intro and Pods for Learn basics.',
          encouragement:
            'Solid progress on the Basics stage — keep practicing without assuming mastery.',
          nextStep: 'Continue with Practice — objective: Apply basics.',
        },
        latencyMs: 2,
      };
    },
  };

  return {
    from,
    rpc,
    paths,
    revisions,
    stages,
    videos,
    videoProgress,
    stageProgress,
    stageFollowups,
    quizCards,
    get llmCalls() {
      return llmCalls;
    },
    failingLlm,
    succeedingLlm,
    bumpEditVersion() {
      const active = revisions.find((row) => row.id === REVISION_ID);
      if (active) active.edit_version += 1;
    },
  };
}

describe('Slice 7 follow-up helpers', () => {
  it('builds evidence from objectives, titles, practiced flags, and reflection only', () => {
    const evidence = buildFollowUpEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      practicedVideoIds: new Set([VIDEO_A1]),
      reflection: 'I tried the intro lab',
    });
    assert.ok(evidence);
    assert.equal(evidence?.stageTitle, 'Basics');
    assert.equal(evidence?.learningObjective, 'Learn basics');
    assert.deepEqual(evidence?.practicedVideoTitles, ['Intro']);
    assert.deepEqual(evidence?.reportedVideoTitles, ['Intro', 'Pods']);
    assert.equal(evidence?.reflection, 'I tried the intro lab');
    assert.equal(evidence?.nextStageTitle, 'Practice');
  });

  it('template fallback never claims mastery or unseen teaching', () => {
    const evidence = buildFollowUpEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      practicedVideoIds: new Set([VIDEO_A1]),
      reflection: null,
    });
    assert.ok(evidence);
    const template = buildTemplateFollowUp(evidence!);
    assert.match(template.practicedSummary, /Learn basics/);
    assert.match(template.encouragement, /not a claim/i);
    assert.match(template.nextStep, /Practice/);
    assert.equal(
      /\bmastered\b|\bthe video teaches\b/i.test(
        `${template.practicedSummary} ${template.encouragement} ${template.nextStep}`
      ),
      false
    );
  });

  it('rejects model claims of mastery or unseen video content', () => {
    const evidence = buildFollowUpEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      practicedVideoIds: new Set(),
      reflection: null,
    });
    assert.ok(evidence);
    assert.equal(
      sanitizeFollowUpContent(
        {
          practicedSummary: 'The video teaches pods deeply.',
          encouragement: 'You mastered Basics.',
          nextStep: 'Go on',
        },
        evidence!
      ),
      null
    );
  });

  it('resolveFollowUpContent falls back to template when generation fails', async () => {
    const evidence = buildFollowUpEvidence({
      stages: sampleStages(),
      stageId: STAGE_A,
      practicedVideoIds: new Set([VIDEO_A1]),
      reflection: 'notes',
    });
    assert.ok(evidence);
    const resolved = await resolveFollowUpContent({
      evidence: evidence!,
      goal: 'Learn Kubernetes',
      background: null,
      llm: {
        provider: 'x',
        model: 'y',
        async generateFollowUp() {
          return {
            ok: false,
            code: 'timeout',
            message: 'late',
            latencyMs: 1,
          };
        },
      },
      timeoutMs: 100,
    });
    assert.equal(resolved.source, 'template');
    assert.match(resolved.content.practicedSummary, /Basics/);
  });
});

describe('Slice 7 completion + follow-up persistence', () => {
  it('completes a stage with optional reflection and stores one follow-up', async () => {
    const db = createFollowupDb();
    db.videoProgress.push({
      id: randomUUID(),
      owner: OWNER,
      path_video_id: VIDEO_A1,
      practiced: true,
      practiced_at: '2026-09-26T12:00:00.000Z',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    });

    const result = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      {
        action: 'complete_stage',
        stageId: STAGE_A,
        reflection: 'I practiced the intro section',
      },
      new Date(),
      { llm: db.succeedingLlm }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.followUpCreated, true);
    assert.ok(result.followUp);
    assert.equal(result.followUp?.pathStageId, STAGE_A);
    assert.equal(result.followUp?.completionVersion, 1);
    assert.equal(result.followUp?.reflection, 'I practiced the intro section');
    assert.equal(result.summary.completedStageIds.includes(STAGE_A), true);
    assert.equal(result.summary.followUps.length, 1);
    assert.equal(db.stageFollowups.length, 1);
    assert.equal(
      db.stageProgress[0]?.reflection,
      'I practiced the intro section'
    );
    assert.equal(db.stageProgress[0]?.completion_version, 1);
  });

  it('allows completing without reflection', async () => {
    const db = createFollowupDb();
    const result = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A },
      new Date(),
      { llm: null }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.followUp?.reflection, null);
    assert.equal(result.followUp?.source, 'template');
  });

  it('retries are idempotent and do not duplicate follow-ups or regenerate', async () => {
    const db = createFollowupDb();
    const first = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      {
        action: 'complete_stage',
        stageId: STAGE_A,
        reflection: 'first',
      },
      new Date(),
      { llm: db.succeedingLlm }
    );
    assert.equal(first.ok, true);
    const callsAfterFirst = db.llmCalls;

    const second = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      {
        action: 'complete_stage',
        stageId: STAGE_A,
        reflection: 'retry different reflection',
      },
      new Date(),
      { llm: db.succeedingLlm }
    );
    assert.equal(second.ok, true);
    if (!second.ok || !first.ok) return;
    assert.equal(second.followUpCreated, false);
    assert.equal(second.followUp?.id, first.followUp?.id);
    assert.equal(db.stageFollowups.length, 1);
    assert.equal(db.llmCalls, callsAfterFirst);
    assert.equal(second.followUp?.reflection, 'first');
  });

  it('falls back to template when generation fails and still completes', async () => {
    const db = createFollowupDb();
    const result = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A },
      new Date(),
      { llm: db.failingLlm }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.followUp?.source, 'template');
    assert.equal(result.summary.completedStageIds.includes(STAGE_A), true);
    assert.equal(db.llmCalls, 1);
  });

  it('reload reads stored follow-up without regenerating', async () => {
    const db = createFollowupDb();
    const created = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A },
      new Date(),
      { llm: db.succeedingLlm }
    );
    assert.equal(created.ok, true);
    const calls = db.llmCalls;

    const { loadOwnedPathProgress } = await import('./path-progress.ts');
    const loaded = await loadOwnedPathProgress(db as never, OWNER, PATH_ID);
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !created.ok) return;
    assert.equal(loaded.summary.followUps.length, 1);
    assert.equal(loaded.summary.followUps[0]?.id, created.followUp?.id);
    assert.equal(db.llmCalls, calls);
  });

  it('hides archived-revision follow-ups from the active view', () => {
    const archived: StageFollowUpRecord = {
      id: randomUUID(),
      owner: OWNER,
      path_id: PATH_ID,
      path_stage_id: ARCHIVED_STAGE,
      revision_id: ARCHIVED_REVISION_ID,
      completion_version: 3,
      reflection: null,
      practiced_summary: 'old',
      encouragement: 'old',
      next_step: 'old',
      source: 'template',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    };
    const current: StageFollowUpRecord = {
      id: randomUUID(),
      owner: OWNER,
      path_id: PATH_ID,
      path_stage_id: STAGE_A,
      revision_id: REVISION_ID,
      completion_version: 1,
      reflection: null,
      practiced_summary: 'new',
      encouragement: 'new',
      next_step: 'new',
      source: 'template',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    };

    const selected = selectCurrentFollowUps({
      followUps: [archived, current],
      stageProgress: [
        { path_stage_id: STAGE_A, completion_version: 1 },
        { path_stage_id: ARCHIVED_STAGE, completion_version: 3 },
      ],
      activeStageIds: new Set([STAGE_A, STAGE_B]),
      activeRevisionId: REVISION_ID,
      activeEditVersion: 1,
    });

    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.pathStageId, STAGE_A);
  });

  it('does not attach old follow-up after edit_version changes', async () => {
    const db = createFollowupDb({ editVersion: 1 });
    const first = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A },
      new Date(),
      { llm: null }
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.summary.followUps.length, 1);

    db.bumpEditVersion();

    const { loadOwnedPathProgress } = await import('./path-progress.ts');
    const afterEdit = await loadOwnedPathProgress(db as never, OWNER, PATH_ID);
    assert.equal(afterEdit.ok, true);
    if (!afterEdit.ok) return;
    assert.equal(afterEdit.summary.followUps.length, 0);
    assert.equal(db.stageFollowups.length, 1);

    const second = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A },
      new Date(),
      { llm: null }
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.followUpCreated, true);
    assert.equal(db.stageFollowups.length, 2);
    assert.equal(second.followUp?.completionVersion, 2);
    assert.notEqual(second.followUp?.id, first.followUp?.id);
  });

  it('enforces ownership privacy for foreign users', async () => {
    const db = createFollowupDb();
    const foreign = await applyOwnedPathProgress(
      db as never,
      FOREIGN,
      PATH_ID,
      { action: 'complete_stage', stageId: STAGE_A },
      new Date(),
      { llm: null }
    );
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 404);
    }
    assert.equal(db.stageFollowups.length, 0);

    const { loadOwnedPathProgress } = await import('./path-progress.ts');
    const foreignLoad = await loadOwnedPathProgress(
      db as never,
      FOREIGN,
      PATH_ID
    );
    assert.equal(foreignLoad.ok, false);
    if (!foreignLoad.ok) {
      assert.equal(foreignLoad.status, 404);
    }
  });
});

describe('Slice 7 migration hardening', () => {
  it('adds stage_followups with deny-by-default RLS and service_role grants', () => {
    const sql = readFileSync(
      join(
        root,
        'supabase/migrations/20260926190000_create_stage_followups.sql'
      ),
      'utf8'
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.stage_followups/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.stage_followups FROM anon/);
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.stage_followups FROM authenticated/
    );
    assert.match(
      sql,
      /GRANT ALL ON TABLE public\.stage_followups TO service_role/
    );
    assert.match(sql, /completion_version/);
    assert.match(sql, /persist_stage_completion_followup/);
    assert.match(sql, /stage_followups_owner_stage_version_unique/);
  });
});
