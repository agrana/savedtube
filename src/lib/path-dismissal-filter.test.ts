import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  excludeActiveDismissedPathVideos,
  filterStagesExcludingActiveDismissals,
  loadActiveDismissedPathVideoIds,
} from './path-dismissal-filter.ts';
import { flattenPathVideos } from './path-edits.ts';
import { buildPathPresentation } from './path-map.ts';
import {
  buildProgressSummary,
  loadOwnedPathProgress,
  resolveContinueTarget,
  type PathStageProgressRecord,
  type PathVideoProgressRecord,
} from './path-progress.ts';
import type { PathStageWithVideos } from './path-research-schema.ts';
import { loadOwnedPathDetail } from './path-research-service.ts';
import { derivePathTitle, type PathRecord } from './paths.ts';
import type { PathVideoDismissalRecord } from './path-dismissals.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const OWNER = 'owner-a';
const PATH_A = '11111111-1111-4111-8111-111111111111';
const PATH_B = '22222222-2222-4222-8222-222222222222';
const REVISION_A = '33333333-3333-4333-8333-333333333333';
const REVISION_B = '44444444-4444-4444-8444-444444444444';
const STAGE_A = '55555555-5555-4555-8555-555555555555';
const STAGE_B = '66666666-6666-4666-8666-666666666666';
const STAGE_EMPTY = '77777777-7777-4777-8777-777777777777';
const VIDEO_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIDEO_A2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VIDEO_A3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VIDEO_B1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const YT_SHARED = 'sharedvideo1';

function makeVideo(
  id: string,
  stageId: string,
  position: number,
  youtubeVideoId: string,
  title: string
): PathStageWithVideos['videos'][number] {
  return {
    id,
    stage_id: stageId,
    position,
    youtube_video_id: youtubeVideoId,
    title,
    channel_title: 'Channel',
    selection_reason: 'Relevant',
    source: 'research',
    duration_seconds: 120,
    thumbnail_url: null,
    verified_at: '2026-10-10T12:00:00.000Z',
    metadata_snapshot: null,
    created_at: '2026-10-10T12:00:00.000Z',
    updated_at: '2026-10-10T12:00:00.000Z',
  };
}

function sampleStages(): PathStageWithVideos[] {
  return [
    {
      id: STAGE_A,
      revision_id: REVISION_A,
      position: 0,
      title: 'Foundations',
      learning_objective: 'Start',
      reason: 'Basics',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
      videos: [
        makeVideo(VIDEO_A1, STAGE_A, 0, 'aaaaaaaaaaa', 'Intro'),
        makeVideo(VIDEO_A2, STAGE_A, 1, YT_SHARED, 'Shared topic'),
        makeVideo(VIDEO_A3, STAGE_A, 2, 'ccccccccccc', 'Practice'),
      ],
    },
    {
      id: STAGE_EMPTY,
      revision_id: REVISION_A,
      position: 1,
      title: 'Empty stage',
      learning_objective: 'Keep stage',
      reason: 'Scaffold',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
      videos: [],
    },
  ];
}

function makeDismissal(args: {
  pathId: string;
  pathVideoId: string;
  youtubeVideoId: string;
  undismissedAt?: string | null;
  owner?: string;
}): PathVideoDismissalRecord {
  const now = '2026-10-10T13:00:00.000Z';
  return {
    id: randomUUID(),
    owner: args.owner ?? OWNER,
    path_id: args.pathId,
    path_video_id: args.pathVideoId,
    youtube_video_id: args.youtubeVideoId,
    reason: 'not_relevant',
    broader_feedback: false,
    dismissed_at: now,
    undismissed_at:
      args.undismissedAt === undefined ? null : args.undismissedAt,
    created_at: now,
    updated_at: now,
  };
}

function createFilterDb(args?: {
  dismissals?: PathVideoDismissalRecord[];
  includePathB?: boolean;
  editVersion?: number;
  practicedVideoIds?: string[];
}) {
  const editVersion = args?.editVersion ?? 4;
  const dismissals = [...(args?.dismissals ?? [])];
  const paths: PathRecord[] = [
    {
      id: PATH_A,
      owner: OWNER,
      goal: 'Learn filtering',
      background: null,
      title: derivePathTitle('Learn filtering'),
      active_revision_id: REVISION_A,
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
  ];
  const revisions = [
    {
      id: REVISION_A,
      path_id: PATH_A,
      revision_number: 1,
      status: 'active' as const,
      edit_version: editVersion,
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
  ];
  const stages = [
    {
      id: STAGE_A,
      revision_id: REVISION_A,
      position: 0,
      title: 'Foundations',
      learning_objective: 'Start',
      reason: 'Basics',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
    {
      id: STAGE_EMPTY,
      revision_id: REVISION_A,
      position: 1,
      title: 'Empty stage',
      learning_objective: 'Keep stage',
      reason: 'Scaffold',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    },
  ];
  const videos = [
    makeVideo(VIDEO_A1, STAGE_A, 0, 'aaaaaaaaaaa', 'Intro'),
    makeVideo(VIDEO_A2, STAGE_A, 1, YT_SHARED, 'Shared topic'),
    makeVideo(VIDEO_A3, STAGE_A, 2, 'ccccccccccc', 'Practice'),
  ];
  const videoProgress: PathVideoProgressRecord[] = (
    args?.practicedVideoIds ?? [VIDEO_A1, VIDEO_A2]
  ).map((pathVideoId) => ({
    id: randomUUID(),
    owner: OWNER,
    path_video_id: pathVideoId,
    practiced: true,
    practiced_at: '2026-10-10T12:30:00.000Z',
    created_at: '2026-10-10T12:30:00.000Z',
    updated_at: '2026-10-10T12:30:00.000Z',
  }));
  const stageProgress: PathStageProgressRecord[] = [
    {
      id: randomUUID(),
      owner: OWNER,
      path_stage_id: STAGE_A,
      completed_at: '2026-10-10T12:45:00.000Z',
      reflection: 'Solid',
      completion_version: 1,
      created_at: '2026-10-10T12:45:00.000Z',
      updated_at: '2026-10-10T12:45:00.000Z',
    },
  ];

  if (args?.includePathB) {
    paths.push({
      id: PATH_B,
      owner: OWNER,
      goal: 'Other path',
      background: null,
      title: derivePathTitle('Other path'),
      active_revision_id: REVISION_B,
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    });
    revisions.push({
      id: REVISION_B,
      path_id: PATH_B,
      revision_number: 1,
      status: 'active',
      edit_version: 1,
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    });
    stages.push({
      id: STAGE_B,
      revision_id: REVISION_B,
      position: 0,
      title: 'Other stage',
      learning_objective: 'Other',
      reason: 'Other',
      created_at: '2026-10-10T12:00:00.000Z',
      updated_at: '2026-10-10T12:00:00.000Z',
    });
    videos.push(makeVideo(VIDEO_B1, STAGE_B, 0, YT_SHARED, 'Same YouTube'));
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
      case 'stage_followups':
        return [];
      case 'quiz_cards':
        return [];
      case 'path_jobs':
        return [];
      case 'path_video_dismissals':
        return dismissals as unknown as Record<string, unknown>[];
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
      orderColumn?: string;
      ascending: boolean;
      limitCount?: number;
      wantSingle: boolean;
      wantMaybeSingle: boolean;
    } = {
      filters: [],
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
      if (state.limitCount !== undefined) {
        rows = rows.slice(0, state.limitCount);
      }
      return rows;
    };

    const finish = async () => {
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
      limit(count: number) {
        state.limitCount = count;
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
    rpc: async () => ({ data: null, error: null }),
    dismissals,
    videoProgress,
    stageProgress,
    revisions,
    videos,
    snapshot() {
      return {
        videoCount: videos.filter((row) => row.stage_id === STAGE_A).length,
        videoProgress: structuredClone(videoProgress),
        stageProgress: structuredClone(stageProgress),
        editVersion: revisions.find((row) => row.id === REVISION_A)
          ?.edit_version,
        dismissalCount: dismissals.length,
      };
    },
  };
}

describe('excludeActiveDismissedPathVideos', () => {
  it('returns a compact active sequence when there are no active dismissals', () => {
    const stages = sampleStages();
    const filtered = excludeActiveDismissedPathVideos(stages, new Set());
    assert.equal(filtered, stages);
    assert.deepEqual(
      flattenPathVideos(filtered).map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A2, VIDEO_A3]
    );
  });

  it('excludes only the dismissed path_video_id and reindexes the sequence', () => {
    const stages = sampleStages();
    const filtered = excludeActiveDismissedPathVideos(
      stages,
      new Set([VIDEO_A2])
    );
    assert.deepEqual(
      flattenPathVideos(filtered).map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A3]
    );
    assert.equal(filtered[0]?.videos[0]?.position, 0);
    assert.equal(filtered[0]?.videos[1]?.position, 1);
    assert.equal(filtered.length, 1);
  });

  it('removes empty stages when every video is dismissed', () => {
    const stages = sampleStages();
    const filtered = excludeActiveDismissedPathVideos(
      stages,
      new Set([VIDEO_A1, VIDEO_A2, VIDEO_A3])
    );
    assert.equal(filtered.length, 0);
    assert.equal(resolveContinueTarget(filtered, new Set()), null);
  });
});

describe('loadActiveDismissedPathVideoIds', () => {
  it('returns only active dismissals for the requested path', async () => {
    const db = createFilterDb({
      includePathB: true,
      dismissals: [
        makeDismissal({
          pathId: PATH_A,
          pathVideoId: VIDEO_A2,
          youtubeVideoId: YT_SHARED,
        }),
        makeDismissal({
          pathId: PATH_B,
          pathVideoId: VIDEO_B1,
          youtubeVideoId: YT_SHARED,
        }),
        makeDismissal({
          pathId: PATH_A,
          pathVideoId: VIDEO_A1,
          youtubeVideoId: 'aaaaaaaaaaa',
          undismissedAt: '2026-10-10T14:00:00.000Z',
        }),
      ],
    });

    const loaded = await loadActiveDismissedPathVideoIds(
      db as never,
      OWNER,
      PATH_A
    );
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.deepEqual([...loaded.pathVideoIds].sort(), [VIDEO_A2]);
  });

  it('keeps restored/undismissed rows eligible', async () => {
    const db = createFilterDb({
      dismissals: [
        makeDismissal({
          pathId: PATH_A,
          pathVideoId: VIDEO_A2,
          youtubeVideoId: YT_SHARED,
          undismissedAt: '2026-10-10T14:00:00.000Z',
        }),
      ],
    });

    const filtered = await filterStagesExcludingActiveDismissals(
      db as never,
      OWNER,
      PATH_A,
      sampleStages()
    );
    assert.equal(filtered.ok, true);
    if (!filtered.ok) return;
    assert.deepEqual(
      flattenPathVideos(filtered.stages).map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A2, VIDEO_A3]
    );
  });
});

describe('authenticated path-content filtering', () => {
  it('path detail, map list, Continue, and watch order skip active dismissals', async () => {
    const db = createFilterDb({
      includePathB: true,
      dismissals: [
        makeDismissal({
          pathId: PATH_A,
          pathVideoId: VIDEO_A2,
          youtubeVideoId: YT_SHARED,
        }),
      ],
    });

    const detail = await loadOwnedPathDetail(db as never, OWNER, PATH_A);
    assert.equal(detail.ok, true);
    if (!detail.ok) return;

    assert.deepEqual(
      flattenPathVideos(detail.stages).map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A3]
    );
    assert.equal(
      detail.stages.some((stage) => stage.id === STAGE_EMPTY),
      false
    );

    const presentation = buildPathPresentation({
      pathId: PATH_A,
      pathTitle: detail.path.title,
      goal: detail.path.goal,
      stages: detail.stages,
      practicedVideoIds: [VIDEO_A1],
    });
    const videoItems = presentation.orderedItems.filter(
      (item) => item.kind === 'video'
    );
    assert.deepEqual(
      videoItems.map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A3]
    );

    const progress = await loadOwnedPathProgress(db as never, OWNER, PATH_A);
    assert.equal(progress.ok, true);
    if (!progress.ok) return;
    assert.equal(progress.summary.continueTarget?.pathVideoId, VIDEO_A3);
    assert.equal(progress.summary.totalVideos, 2);
    assert.equal(progress.summary.activeEditVersion, 4);

    const flat = flattenPathVideos(progress.stages);
    assert.deepEqual(
      flat.map((item) => item.pathVideoId),
      [VIDEO_A1, VIDEO_A3]
    );
  });

  it('does not hide the same YouTube video in another path', async () => {
    const db = createFilterDb({
      includePathB: true,
      dismissals: [
        makeDismissal({
          pathId: PATH_A,
          pathVideoId: VIDEO_A2,
          youtubeVideoId: YT_SHARED,
        }),
      ],
    });

    const pathB = await loadOwnedPathDetail(db as never, OWNER, PATH_B);
    assert.equal(pathB.ok, true);
    if (!pathB.ok) return;
    assert.deepEqual(
      flattenPathVideos(pathB.stages).map((item) => item.pathVideoId),
      [VIDEO_B1]
    );
    assert.equal(pathB.stages[0]?.videos[0]?.youtube_video_id, YT_SHARED);
  });

  it('persists exclusion across refresh without mutating progress or edit_version', async () => {
    const db = createFilterDb({
      dismissals: [
        makeDismissal({
          pathId: PATH_A,
          pathVideoId: VIDEO_A1,
          youtubeVideoId: 'aaaaaaaaaaa',
        }),
      ],
      practicedVideoIds: [VIDEO_A1, VIDEO_A2],
    });
    const before = db.snapshot();

    const first = await loadOwnedPathProgress(db as never, OWNER, PATH_A);
    const second = await loadOwnedPathProgress(db as never, OWNER, PATH_A);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;

    assert.deepEqual(
      flattenPathVideos(first.stages).map((item) => item.pathVideoId),
      [VIDEO_A2, VIDEO_A3]
    );
    assert.deepEqual(
      flattenPathVideos(second.stages).map((item) => item.pathVideoId),
      [VIDEO_A2, VIDEO_A3]
    );
    assert.equal(first.summary.continueTarget?.pathVideoId, VIDEO_A3);
    assert.equal(second.summary.continueTarget?.pathVideoId, VIDEO_A3);

    const after = db.snapshot();
    assert.deepEqual(after.videoProgress, before.videoProgress);
    assert.deepEqual(after.stageProgress, before.stageProgress);
    assert.equal(after.editVersion, before.editVersion);
    assert.equal(after.videoCount, before.videoCount);
    assert.equal(after.dismissalCount, before.dismissalCount);

    const summary = buildProgressSummary(
      first.stages,
      after.videoProgress,
      after.stageProgress,
      [],
      after.editVersion ?? null
    );
    assert.equal(summary.activeEditVersion, 4);
    assert.ok(summary.practicedVideoIds.includes(VIDEO_A1));
    assert.ok(summary.practicedVideoIds.includes(VIDEO_A2));
  });
});

describe('soft-dismiss filter wiring (source)', () => {
  it('uses the shared filter helper from path detail and progress loaders', () => {
    const detailSource = readFileSync(
      join(root, 'src/lib/path-research-service.ts'),
      'utf8'
    );
    const progressSource = readFileSync(
      join(root, 'src/lib/path-progress.ts'),
      'utf8'
    );
    const watchSource = readFileSync(
      join(root, 'src/lib/path-watch.ts'),
      'utf8'
    );

    assert.match(detailSource, /loadActiveDismissedPathVideoIds/);
    assert.match(detailSource, /excludeActiveDismissedPathVideos/);
    assert.match(progressSource, /filterStagesExcludingActiveDismissals/);
    assert.match(watchSource, /loadOwnedPathDetail/);
    assert.match(watchSource, /loadOwnedPathProgress/);
    assert.match(watchSource, /flattenPathVideos/);
  });
});
