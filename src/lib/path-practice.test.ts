import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  activateOwnedPathRevision,
  applyOwnedPathEdit,
  assertExpectedEditVersion,
  flattenPathVideos,
  parsePathEditBody,
  resolveYouTubeVideoIdFromUrl,
  validateIdPermutation,
} from './path-edits.ts';
import {
  applyOwnedPathProgress,
  buildProgressSummary,
  resolveContinueTarget,
  type PathStageProgressRecord,
  type PathVideoProgressRecord,
} from './path-progress.ts';
import type { PathStageWithVideos } from './path-research-schema.ts';
import { derivePathTitle, type PathRecord } from './paths.ts';
import { buildPathWatchHref } from './path-links.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const OWNER = 'user-a';
const FOREIGN = 'user-b';
const PATH_ID = '11111111-1111-4111-8111-111111111111';
const REVISION_ID = '22222222-2222-4222-8222-222222222222';
const STAGE_A = '33333333-3333-4333-8333-333333333333';
const STAGE_B = '44444444-4444-4444-8444-444444444444';
const VIDEO_A1 = '55555555-5555-4555-8555-555555555555';
const VIDEO_A2 = '66666666-6666-4666-8666-666666666666';
const VIDEO_B1 = '77777777-7777-4777-8777-777777777777';

function makePath(overrides: Partial<PathRecord> = {}): PathRecord {
  const goal = overrides.goal || 'Learn Kubernetes';
  return {
    id: PATH_ID,
    owner: OWNER,
    goal,
    background: null,
    title: derivePathTitle(goal, overrides.title),
    active_revision_id: REVISION_ID,
    created_at: '2026-09-26T12:00:00.000Z',
    updated_at: '2026-09-26T12:00:00.000Z',
    ...overrides,
  };
}

function sampleStages(): PathStageWithVideos[] {
  return [
    {
      id: STAGE_A,
      revision_id: REVISION_ID,
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
      revision_id: REVISION_ID,
      position: 1,
      title: 'Practice',
      learning_objective: 'Apply',
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

type RevisionRow = {
  id: string;
  path_id: string;
  revision_number: number;
  status: 'draft' | 'active' | 'archived';
  edit_version: number;
};

type StageRow = {
  id: string;
  revision_id: string;
  position: number;
  title: string;
  learning_objective: string;
  reason: string;
};

type VideoRow = {
  id: string;
  stage_id: string;
  position: number;
  youtube_video_id: string;
  title: string;
  channel_title: string | null;
  selection_reason: string;
  source: 'research' | 'manual';
  duration_seconds: number | null;
  thumbnail_url: string | null;
  verified_at: string;
  metadata_snapshot: Record<string, unknown> | null;
};

/** Minimal in-memory surface for Slice 3 edits, progress, and activation. */
function createPracticeDb(args?: {
  path?: PathRecord;
  editVersion?: number;
  includeActive?: boolean;
}) {
  const includeActive = args?.includeActive !== false;
  const path = makePath(args?.path);
  const paths: PathRecord[] = [path];
  const revisions: RevisionRow[] = includeActive
    ? [
        {
          id: REVISION_ID,
          path_id: PATH_ID,
          revision_number: 1,
          status: 'active',
          edit_version: args?.editVersion ?? 1,
        },
      ]
    : [];
  const stages: StageRow[] = [];
  const videos: VideoRow[] = [];
  const videoProgress: PathVideoProgressRecord[] = [];
  const stageProgress: PathStageProgressRecord[] = [];
  const stageFollowups: Array<{
    id: string;
    owner: string;
    path_id: string;
    path_stage_id: string;
    revision_id: string;
    completion_version: number;
    reflection: string | null;
    practiced_summary: string;
    encouragement: string;
    next_step: string;
    source: 'model' | 'template';
    created_at: string;
    updated_at: string;
  }> = [];
  const quizCards: Array<Record<string, unknown>> = [];

  if (includeActive) {
    for (const stage of sampleStages()) {
      stages.push({
        id: stage.id,
        revision_id: stage.revision_id,
        position: stage.position,
        title: stage.title,
        learning_objective: stage.learning_objective,
        reason: stage.reason,
      });
      for (const video of stage.videos) {
        videos.push({
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
        });
      }
    }
  }

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
      mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
      pendingInsert?: Record<string, unknown>;
      pendingUpdate?: Record<string, unknown>;
      pendingUpsert?: Record<string, unknown>;
      onConflict?: string;
      wantSingle: boolean;
      wantMaybeSingle: boolean;
    } = {
      filters: [],
      ascending: true,
      mode: 'select',
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
      if (state.mode === 'upsert' && state.pendingUpsert) {
        const payload = { ...state.pendingUpsert };
        if (table === 'path_video_progress') {
          const existing = videoProgress.find(
            (row) =>
              row.owner === payload.owner &&
              row.path_video_id === payload.path_video_id
          );
          if (existing) {
            Object.assign(existing, payload, {
              updated_at: new Date().toISOString(),
            });
            return { data: [existing], error: null };
          }
          const row: PathVideoProgressRecord = {
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
        if (table === 'path_stage_progress') {
          const existing = stageProgress.find(
            (row) =>
              row.owner === payload.owner &&
              row.path_stage_id === payload.path_stage_id
          );
          if (existing) {
            Object.assign(existing, payload, {
              updated_at: new Date().toISOString(),
            });
            return { data: [existing], error: null };
          }
          const row: PathStageProgressRecord = {
            id: randomUUID(),
            owner: String(payload.owner),
            path_stage_id: String(payload.path_stage_id),
            completed_at: String(payload.completed_at),
            reflection: (payload.reflection as string | null) ?? null,
            completion_version:
              typeof payload.completion_version === 'number'
                ? payload.completion_version
                : 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          stageProgress.push(row);
          return { data: [row], error: null };
        }
        if (table === 'stage_followups') {
          const existing = stageFollowups.find(
            (row) =>
              row.owner === payload.owner &&
              row.path_stage_id === payload.path_stage_id &&
              row.completion_version === payload.completion_version
          );
          if (existing) {
            return { data: [existing], error: null };
          }
          const row = {
            id: randomUUID(),
            owner: String(payload.owner),
            path_id: String(payload.path_id),
            path_stage_id: String(payload.path_stage_id),
            revision_id: String(payload.revision_id),
            completion_version: Number(payload.completion_version),
            reflection: (payload.reflection as string | null) ?? null,
            practiced_summary: String(payload.practiced_summary),
            encouragement: String(payload.encouragement),
            next_step: String(payload.next_step),
            source:
              payload.source === 'model'
                ? ('model' as const)
                : ('template' as const),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          stageFollowups.push(row);
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
      upsert(
        payload: Record<string, unknown>,
        options?: { onConflict?: string }
      ) {
        state.mode = 'upsert';
        state.pendingUpsert = payload;
        state.onConflict = options?.onConflict;
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
    if (name === 'apply_path_revision_edit') {
      const pathId = String(args.p_path_id);
      const owner = String(args.p_owner);
      const expected = Number(args.p_expected_edit_version);
      const action = String(args.p_action);
      const payload = (args.p_payload || {}) as Record<string, unknown>;
      const pathRow = paths.find((row) => row.id === pathId);
      if (!pathRow || pathRow.owner !== owner) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const revision = revisions.find(
        (row) =>
          row.id === pathRow.active_revision_id && row.status === 'active'
      );
      if (!revision) {
        return {
          data: { ok: false, code: 'no_active_revision' },
          error: null,
        };
      }
      if (revision.edit_version !== expected) {
        return { data: { ok: false, code: 'stale_edit' }, error: null };
      }

      if (action === 'rename_stage') {
        const stage = stages.find(
          (row) => row.id === payload.stageId && row.revision_id === revision.id
        );
        if (!stage) {
          return { data: { ok: false, code: 'foreign_id' }, error: null };
        }
        stage.title = String(payload.title);
      } else if (action === 'reorder_items') {
        const stageId = String(payload.stageId);
        const ordered = payload.orderedPathVideoIds as string[];
        const existing = videos
          .filter((row) => row.stage_id === stageId)
          .map((row) => row.id);
        const check = validateIdPermutation(existing, ordered);
        if (!check.ok) {
          return { data: { ok: false, code: check.code }, error: null };
        }
        ordered.forEach((id, index) => {
          const video = videos.find((row) => row.id === id);
          if (video) video.position = index;
        });
      } else if (action === 'add_item') {
        const stage = stages.find(
          (row) => row.id === payload.stageId && row.revision_id === revision.id
        );
        if (!stage) {
          return { data: { ok: false, code: 'foreign_id' }, error: null };
        }
        const maxPos = Math.max(
          -1,
          ...videos
            .filter((row) => row.stage_id === stage.id)
            .map((row) => row.position)
        );
        const newId = randomUUID();
        videos.push({
          id: newId,
          stage_id: stage.id,
          position: maxPos + 1,
          youtube_video_id: String(payload.youtubeVideoId),
          title: String(payload.title),
          channel_title: (payload.channelTitle as string | null) ?? null,
          selection_reason: String(payload.selectionReason || 'Added manually'),
          source: 'manual',
          duration_seconds:
            (payload.durationSeconds as number | null | undefined) ?? null,
          thumbnail_url: (payload.thumbnailUrl as string | null) ?? null,
          verified_at: String(payload.verifiedAt),
          metadata_snapshot:
            (payload.metadataSnapshot as Record<string, unknown> | null) ??
            null,
        });
        revision.edit_version += 1;
        return {
          data: {
            ok: true,
            edit_version: revision.edit_version,
            revision_id: revision.id,
            path_video_id: newId,
          },
          error: null,
        };
      } else if (action === 'replace_item') {
        const video = videos.find((row) => row.id === payload.pathVideoId);
        const stage = video
          ? stages.find((row) => row.id === video.stage_id)
          : null;
        if (!video || !stage || stage.revision_id !== revision.id) {
          return { data: { ok: false, code: 'foreign_id' }, error: null };
        }
        video.youtube_video_id = String(payload.youtubeVideoId);
        video.title = String(payload.title);
        video.source = 'manual';
        for (let i = videoProgress.length - 1; i >= 0; i -= 1) {
          if (videoProgress[i]?.path_video_id === video.id) {
            videoProgress.splice(i, 1);
          }
        }
      } else if (action === 'remove_item') {
        const video = videos.find((row) => row.id === payload.pathVideoId);
        const stage = video
          ? stages.find((row) => row.id === video.stage_id)
          : null;
        if (!video || !stage || stage.revision_id !== revision.id) {
          return { data: { ok: false, code: 'foreign_id' }, error: null };
        }
        if (videos.length <= 1) {
          return { data: { ok: false, code: 'empty_revision' }, error: null };
        }
        const index = videos.indexOf(video);
        videos.splice(index, 1);
      } else {
        return { data: { ok: false, code: 'unknown_action' }, error: null };
      }

      revision.edit_version += 1;
      return {
        data: {
          ok: true,
          edit_version: revision.edit_version,
          revision_id: revision.id,
          path_video_id: null,
        },
        error: null,
      };
    }

    if (name === 'activate_path_revision') {
      const pathId = String(args.p_path_id);
      const owner = String(args.p_owner);
      const revisionId = String(args.p_revision_id);
      const expected = Number(args.p_expected_edit_version);
      const pathRow = paths.find((row) => row.id === pathId);
      if (!pathRow || pathRow.owner !== owner) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      const target = revisions.find(
        (row) => row.id === revisionId && row.path_id === pathId
      );
      if (!target) {
        return { data: { ok: false, code: 'not_found' }, error: null };
      }
      if (
        target.status === 'active' &&
        pathRow.active_revision_id === target.id
      ) {
        return {
          data: {
            ok: true,
            revision_id: target.id,
            already_active: true,
            edit_version: target.edit_version,
          },
          error: null,
        };
      }
      if (target.status !== 'draft' && target.status !== 'archived') {
        return { data: { ok: false, code: 'invalid_status' }, error: null };
      }
      const current = revisions.find(
        (row) => row.id === pathRow.active_revision_id
      );
      if (current && current.edit_version !== expected) {
        return {
          data: {
            ok: false,
            code: 'stale_edit',
            edit_version: current.edit_version,
          },
          error: null,
        };
      }
      if (current) {
        current.status = 'archived';
      }
      target.status = 'active';
      pathRow.active_revision_id = target.id;
      return {
        data: {
          ok: true,
          revision_id: target.id,
          already_active: false,
          edit_version: target.edit_version,
        },
        error: null,
      };
    }

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
        return {
          data: { ok: false, code: 'no_active_revision' },
          error: null,
        };
      }
      const stage = stages.find(
        (row) => row.id === stageId && row.revision_id === revision.id
      );
      if (!stage) {
        return { data: { ok: false, code: 'foreign_id' }, error: null };
      }

      const existingFollowup = stageFollowups.find(
        (row) =>
          row.owner === owner &&
          row.path_stage_id === stageId &&
          row.completion_version === revision.edit_version
      );
      if (existingFollowup) {
        let progress = stageProgress.find(
          (row) => row.owner === owner && row.path_stage_id === stageId
        );
        if (!progress) {
          progress = {
            id: randomUUID(),
            owner,
            path_stage_id: stageId,
            completed_at: new Date().toISOString(),
            reflection: existingFollowup.reflection,
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
            followup: existingFollowup,
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
        source:
          args.p_source === 'model'
            ? ('model' as const)
            : ('template' as const),
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
      const nowIso = new Date().toISOString();
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
          created_at: nowIso,
          updated_at: nowIso,
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

    throw new Error(`Unexpected rpc ${name}`);
  }

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
  };
}

describe('path edit validation', () => {
  it('rejects foreign, duplicate, and incomplete ID permutations', () => {
    const expected = [VIDEO_A1, VIDEO_A2];
    assert.equal(
      validateIdPermutation(expected, [VIDEO_A2, VIDEO_A1]).ok,
      true
    );
    assert.equal(
      validateIdPermutation(expected, [VIDEO_A1, VIDEO_B1]).ok,
      false
    );
    assert.equal(
      validateIdPermutation(expected, [VIDEO_A1, VIDEO_A1]).ok,
      false
    );
    assert.equal(validateIdPermutation(expected, [VIDEO_A1]).ok, false);
  });

  it('returns stale_edit when expected edit versions diverge', () => {
    const ok = assertExpectedEditVersion({ edit_version: 3 }, 3);
    assert.equal(ok.ok, true);
    const stale = assertExpectedEditVersion({ edit_version: 4 }, 3);
    assert.equal(stale.ok, false);
    if (!stale.ok) {
      assert.equal(stale.code, 'stale_edit');
    }
    const missing = assertExpectedEditVersion(null, 1);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, 'no_active_revision');
    }
  });

  it('parses add/replace URL actions and rejects blank URLs', () => {
    const add = parsePathEditBody({
      action: 'add',
      stageId: STAGE_A,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      expectedEditVersion: 1,
    });
    assert.equal(add.success, true);

    const blank = parsePathEditBody({
      action: 'replace',
      pathVideoId: VIDEO_A1,
      url: '   ',
      expectedEditVersion: 1,
    });
    assert.equal(blank.success, false);
  });

  it('resolves YouTube watch URLs and bare video IDs', () => {
    assert.equal(
      resolveYouTubeVideoIdFromUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      ).ok,
      true
    );
    assert.equal(resolveYouTubeVideoIdFromUrl('dQw4w9WgXcQ').ok, true);
    assert.equal(resolveYouTubeVideoIdFromUrl('not-a-valid-id').ok, false);
    assert.equal(
      resolveYouTubeVideoIdFromUrl('https://example.com/watch').ok,
      false
    );
  });
});

describe('progress and continue', () => {
  it('Continue starts at the first unpracticed item in saved order', () => {
    const stages = sampleStages();
    const flat = flattenPathVideos(stages);
    assert.deepEqual(
      flat.map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A2, VIDEO_B1]
    );

    const none = resolveContinueTarget(stages, new Set());
    assert.equal(none?.pathVideoId, VIDEO_A1);

    const mid = resolveContinueTarget(stages, new Set([VIDEO_A1]));
    assert.equal(mid?.pathVideoId, VIDEO_A2);

    const all = resolveContinueTarget(
      stages,
      new Set([VIDEO_A1, VIDEO_A2, VIDEO_B1])
    );
    assert.equal(all?.pathVideoId, VIDEO_A1);

    const summary = buildProgressSummary(
      stages,
      [
        {
          id: randomUUID(),
          owner: OWNER,
          path_video_id: VIDEO_A1,
          practiced: true,
          practiced_at: '2026-09-26T12:00:00.000Z',
          created_at: '2026-09-26T12:00:00.000Z',
          updated_at: '2026-09-26T12:00:00.000Z',
        },
      ],
      []
    );
    assert.equal(summary.practicedCount, 1);
    assert.equal(summary.continueTarget?.pathVideoId, VIDEO_A2);
  });

  it('marks practiced only for owned active-revision membership', async () => {
    const db = createPracticeDb();
    const marked = await applyOwnedPathProgress(db as never, OWNER, PATH_ID, {
      action: 'mark_practiced',
      pathVideoId: VIDEO_A1,
      practiced: true,
    });
    assert.equal(marked.ok, true);
    if (marked.ok) {
      assert.equal(marked.summary.continueTarget?.pathVideoId, VIDEO_A2);
    }

    const foreignVideo = await applyOwnedPathProgress(
      db as never,
      OWNER,
      PATH_ID,
      {
        action: 'mark_practiced',
        pathVideoId: '99999999-9999-4999-8999-999999999999',
        practiced: true,
      }
    );
    assert.equal(foreignVideo.ok, false);
    if (!foreignVideo.ok) {
      assert.equal(foreignVideo.status, 404);
    }

    const foreignOwner = await applyOwnedPathProgress(
      db as never,
      FOREIGN,
      PATH_ID,
      {
        action: 'mark_practiced',
        pathVideoId: VIDEO_A1,
        practiced: true,
      }
    );
    assert.equal(foreignOwner.ok, false);
    if (!foreignOwner.ok) {
      assert.equal(foreignOwner.status, 404);
    }
  });
});

describe('owned transactional edits', () => {
  it('applies rename with edit_version bump and rejects stale tabs', async () => {
    const db = createPracticeDb({ editVersion: 2 });
    const first = await applyOwnedPathEdit(db as never, OWNER, PATH_ID, {
      action: 'rename_stage',
      stageId: STAGE_A,
      title: 'Foundations',
      expectedEditVersion: 2,
    });
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.editVersion, 3);
    }
    assert.equal(
      db.stages.find((row) => row.id === STAGE_A)?.title,
      'Foundations'
    );

    const stale = await applyOwnedPathEdit(db as never, OWNER, PATH_ID, {
      action: 'rename_stage',
      stageId: STAGE_A,
      title: 'Stale title',
      expectedEditVersion: 2,
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) {
      assert.equal(stale.status, 409);
      assert.equal(stale.code, 'stale_edit');
    }
  });

  it('rejects foreign owners and foreign item IDs', async () => {
    const db = createPracticeDb();
    const foreign = await applyOwnedPathEdit(db as never, FOREIGN, PATH_ID, {
      action: 'rename_stage',
      stageId: STAGE_A,
      title: 'Nope',
      expectedEditVersion: 1,
    });
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 404);
    }

    const badId = await applyOwnedPathEdit(db as never, OWNER, PATH_ID, {
      action: 'reorder_items',
      stageId: STAGE_A,
      orderedPathVideoIds: [VIDEO_A1, VIDEO_B1],
      expectedEditVersion: 1,
    });
    assert.equal(badId.ok, false);
    if (!badId.ok) {
      assert.equal(badId.status, 400);
      assert.equal(badId.code, 'foreign_id');
    }
  });

  it('adds and replaces with verified metadata and clears practiced on replace', async () => {
    const db = createPracticeDb();
    db.videoProgress.push({
      id: randomUUID(),
      owner: OWNER,
      path_video_id: VIDEO_A1,
      practiced: true,
      practiced_at: '2026-09-26T12:00:00.000Z',
      created_at: '2026-09-26T12:00:00.000Z',
      updated_at: '2026-09-26T12:00:00.000Z',
    });

    const added = await applyOwnedPathEdit(
      db as never,
      OWNER,
      PATH_ID,
      {
        action: 'add',
        stageId: STAGE_B,
        url: 'https://youtu.be/ddddddddddd',
        expectedEditVersion: 1,
      },
      {
        youtubeVideoId: 'ddddddddddd',
        title: 'Extra lab',
        channelTitle: 'Channel',
        durationSeconds: 90,
        thumbnailUrl: null,
        verifiedAt: '2026-09-26T13:00:00.000Z',
      }
    );
    assert.equal(added.ok, true);
    if (added.ok) {
      assert.ok(added.pathVideoId);
      assert.equal(added.editVersion, 2);
    }
    assert.equal(
      db.videos.some((row) => row.youtube_video_id === 'ddddddddddd'),
      true
    );

    const replaced = await applyOwnedPathEdit(
      db as never,
      OWNER,
      PATH_ID,
      {
        action: 'replace',
        pathVideoId: VIDEO_A1,
        url: 'https://youtu.be/eeeeeeeeeee',
        expectedEditVersion: 2,
      },
      {
        youtubeVideoId: 'eeeeeeeeeee',
        title: 'Replacement',
        channelTitle: 'Channel',
        durationSeconds: 100,
        thumbnailUrl: null,
        verifiedAt: '2026-09-26T13:05:00.000Z',
      }
    );
    assert.equal(replaced.ok, true);
    assert.equal(
      db.videos.find((row) => row.id === VIDEO_A1)?.youtube_video_id,
      'eeeeeeeeeee'
    );
    assert.equal(
      db.videoProgress.some((row) => row.path_video_id === VIDEO_A1),
      false
    );
  });

  it('requires verified metadata for add/replace', async () => {
    const db = createPracticeDb();
    const missing = await applyOwnedPathEdit(db as never, OWNER, PATH_ID, {
      action: 'add',
      stageId: STAGE_A,
      url: 'https://youtu.be/ffffffffff',
      expectedEditVersion: 1,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 400);
    }
  });
});

describe('draft activation and old revision restoration', () => {
  it('activates a draft with version check and restores an archived revision', async () => {
    const db = createPracticeDb({ editVersion: 5 });
    const draftId = '88888888-8888-4888-8888-888888888888';
    db.revisions.push({
      id: draftId,
      path_id: PATH_ID,
      revision_number: 2,
      status: 'draft',
      edit_version: 1,
    });

    const stale = await activateOwnedPathRevision(db as never, OWNER, PATH_ID, {
      revisionId: draftId,
      expectedEditVersion: 4,
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) {
      assert.equal(stale.status, 409);
      assert.equal(stale.code, 'stale_edit');
    }

    const activated = await activateOwnedPathRevision(
      db as never,
      OWNER,
      PATH_ID,
      {
        revisionId: draftId,
        expectedEditVersion: 5,
      }
    );
    assert.equal(activated.ok, true);
    assert.equal(db.paths[0]?.active_revision_id, draftId);
    assert.equal(
      db.revisions.find((row) => row.id === REVISION_ID)?.status,
      'archived'
    );
    assert.equal(
      db.revisions.find((row) => row.id === draftId)?.status,
      'active'
    );

    const restored = await activateOwnedPathRevision(
      db as never,
      OWNER,
      PATH_ID,
      {
        revisionId: REVISION_ID,
        expectedEditVersion: 1,
      }
    );
    assert.equal(restored.ok, true);
    assert.equal(db.paths[0]?.active_revision_id, REVISION_ID);
    assert.equal(
      db.revisions.find((row) => row.id === REVISION_ID)?.status,
      'active'
    );
    assert.equal(
      db.revisions.find((row) => row.id === draftId)?.status,
      'archived'
    );
  });

  it('builds stable path watch hrefs with pathVideoId', () => {
    const href = buildPathWatchHref('aaaaaaaaaaa', PATH_ID, VIDEO_A1);
    assert.match(href, new RegExp(`/watch/aaaaaaaaaaa\\?`));
    assert.match(href, new RegExp(`pathId=${PATH_ID}`));
    assert.match(href, new RegExp(`pathVideoId=${VIDEO_A1}`));
  });
});

describe('slice 3 migration contracts', () => {
  it('creates progress tables, edit RPC, and draft activation helpers', () => {
    const source = readFileSync(
      join(
        root,
        'supabase/migrations/20260926170000_create_path_progress_and_edits.sql'
      ),
      'utf8'
    );
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS public\.path_video_progress/
    );
    assert.match(
      source,
      /CREATE TABLE IF NOT EXISTS public\.path_stage_progress/
    );
    assert.match(source, /apply_path_revision_edit/);
    assert.match(source, /activate_path_revision/);
    assert.match(source, /add_item/);
    assert.match(source, /replace_item/);
    assert.match(source, /stale_edit/);
    assert.match(source, /p_as_draft/);
    assert.match(
      source,
      /GRANT ALL ON TABLE public\.path_video_progress TO service_role/
    );
    assert.doesNotMatch(source, /playlist_item_edits/);
    assert.doesNotMatch(source, /video_intervals.*REFERENCES public\.paths/);
  });
});
