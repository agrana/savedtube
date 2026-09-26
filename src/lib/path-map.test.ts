import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPathPresentation,
  compareByPositionThenId,
  PATH_MAP_GOAL_HEIGHT,
  PATH_MAP_GOAL_WIDTH,
  PATH_MAP_MAX_STAGES,
  PATH_MAP_MAX_VIDEOS_PER_STAGE,
  PATH_MAP_STAGE_HEIGHT,
  PATH_MAP_STAGE_WIDTH,
  PATH_MAP_VIDEO_HEIGHT,
  PATH_MAP_VIDEO_WIDTH,
  pathMapGoalNodeId,
  pathMapStageNodeId,
  pathMapVideoNodeId,
  pathPresentationA11yStructure,
  sortStagesForPresentation,
} from './path-map.ts';
import type {
  PathStageWithVideos,
  PathVideoRecord,
} from './path-research-schema.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PATH_ID = '11111111-1111-4111-8111-111111111111';

function makeVideo(
  overrides: Partial<PathVideoRecord> &
    Pick<PathVideoRecord, 'id' | 'stage_id' | 'position' | 'youtube_video_id'>
): PathVideoRecord {
  return {
    title: overrides.title || `Video ${overrides.youtube_video_id}`,
    channel_title: overrides.channel_title ?? 'Channel',
    selection_reason: overrides.selection_reason || 'reason',
    source: overrides.source || 'research',
    duration_seconds: overrides.duration_seconds ?? 120,
    thumbnail_url: overrides.thumbnail_url ?? null,
    verified_at: overrides.verified_at || '2026-09-26T12:00:00.000Z',
    metadata_snapshot: overrides.metadata_snapshot ?? null,
    created_at: overrides.created_at || '2026-09-26T12:00:00.000Z',
    updated_at: overrides.updated_at || '2026-09-26T12:00:00.000Z',
    ...overrides,
  };
}

function makeStage(
  overrides: Partial<PathStageWithVideos> &
    Pick<PathStageWithVideos, 'id' | 'position' | 'videos'>
): PathStageWithVideos {
  return {
    revision_id: overrides.revision_id || 'rev-1',
    title: overrides.title || `Stage ${overrides.position}`,
    learning_objective: overrides.learning_objective || 'Learn something',
    reason: overrides.reason || 'Because',
    created_at: overrides.created_at || '2026-09-26T12:00:00.000Z',
    updated_at: overrides.updated_at || '2026-09-26T12:00:00.000Z',
    ...overrides,
  };
}

function maxSizedStages(): PathStageWithVideos[] {
  const stages: PathStageWithVideos[] = [];
  for (let s = 0; s < PATH_MAP_MAX_STAGES; s += 1) {
    const stageId = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${s}`;
    const videos: PathVideoRecord[] = [];
    for (let v = 0; v < PATH_MAP_MAX_VIDEOS_PER_STAGE; v += 1) {
      videos.push(
        makeVideo({
          id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${s}${v}`,
          stage_id: stageId,
          position: v,
          youtube_video_id: `vid${s}${v}xxxxxx`.slice(0, 11),
          title: `S${s}V${v}`,
        })
      );
    }
    stages.push(
      makeStage({
        id: stageId,
        position: s,
        title: `Stage ${s + 1}`,
        videos,
      })
    );
  }
  return stages;
}

describe('path-map ordering', () => {
  it('sorts by position then stable id when positions collide', () => {
    const stages = [
      makeStage({
        id: 'stage-b',
        position: 0,
        videos: [
          makeVideo({
            id: 'video-b',
            stage_id: 'stage-b',
            position: 0,
            youtube_video_id: 'bbbbbbbbbbb',
          }),
          makeVideo({
            id: 'video-a',
            stage_id: 'stage-b',
            position: 0,
            youtube_video_id: 'aaaaaaaaaaa',
          }),
        ],
      }),
      makeStage({
        id: 'stage-a',
        position: 0,
        videos: [],
      }),
    ];

    const sorted = sortStagesForPresentation(stages);
    assert.equal(sorted[0].id, 'stage-a');
    assert.equal(sorted[1].id, 'stage-b');
    assert.equal(sorted[1].videos[0].id, 'video-a');
    assert.equal(sorted[1].videos[1].id, 'video-b');
    assert.ok(
      compareByPositionThenId(
        { position: 1, id: 'a' },
        { position: 2, id: 'a' }
      ) < 0
    );
  });

  it('builds the same ordered sequence for map and list', () => {
    const stages = [
      makeStage({
        id: 'stage-2',
        position: 1,
        title: 'Second',
        videos: [
          makeVideo({
            id: 'video-2',
            stage_id: 'stage-2',
            position: 0,
            youtube_video_id: 'ccccccccccc',
            title: 'Video two',
          }),
        ],
      }),
      makeStage({
        id: 'stage-1',
        position: 0,
        title: 'First',
        videos: [
          makeVideo({
            id: 'video-1',
            stage_id: 'stage-1',
            position: 0,
            youtube_video_id: 'ddddddddddd',
            title: 'Video one',
          }),
        ],
      }),
    ];

    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'CKA path',
      goal: 'Pass CKA',
      stages,
    });

    assert.deepEqual(
      presentation.orderedItems.map((item) => item.id),
      [
        pathMapGoalNodeId(PATH_ID),
        pathMapStageNodeId('stage-1'),
        pathMapVideoNodeId('video-1'),
        pathMapStageNodeId('stage-2'),
        pathMapVideoNodeId('video-2'),
      ]
    );

    const desktopIds = presentation.desktop.nodes.map((node) => node.id);
    const mobileIds = presentation.mobile.nodes.map((node) => node.id);
    assert.deepEqual(
      desktopIds,
      presentation.orderedItems.map((item) => item.id)
    );
    assert.deepEqual(
      mobileIds,
      presentation.orderedItems.map((item) => item.id)
    );
  });
});

describe('path-map stable ids and deterministic layout', () => {
  it('uses stable node ids derived from path/stage/video ids', () => {
    const stageId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const videoId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Title',
      goal: 'Goal text',
      stages: [
        makeStage({
          id: stageId,
          position: 0,
          videos: [
            makeVideo({
              id: videoId,
              stage_id: stageId,
              position: 0,
              youtube_video_id: 'eeeeeeeeeee',
            }),
          ],
        }),
      ],
    });

    assert.equal(presentation.goalNodeId, pathMapGoalNodeId(PATH_ID));
    assert.ok(
      presentation.desktop.nodes.some(
        (node) => node.id === pathMapStageNodeId(stageId)
      )
    );
    assert.ok(
      presentation.desktop.nodes.some(
        (node) => node.id === pathMapVideoNodeId(videoId)
      )
    );

    const again = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Title',
      goal: 'Goal text',
      stages: [
        makeStage({
          id: stageId,
          position: 0,
          videos: [
            makeVideo({
              id: videoId,
              stage_id: stageId,
              position: 0,
              youtube_video_id: 'eeeeeeeeeee',
            }),
          ],
        }),
      ],
    });
    assert.equal(again.contentKey, presentation.contentKey);
    assert.deepEqual(again.desktop, presentation.desktop);
    assert.deepEqual(again.mobile, presentation.mobile);
  });

  it('uses fixed card geometry on desktop nodes', () => {
    const stages = maxSizedStages().slice(0, 1);
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Small',
      goal: 'Goal',
      stages,
    });
    const goal = presentation.desktop.nodes.find(
      (node) => node.kind === 'goal'
    );
    const stage = presentation.desktop.nodes.find(
      (node) => node.kind === 'stage'
    );
    const video = presentation.desktop.nodes.find(
      (node) => node.kind === 'video'
    );
    assert.ok(goal);
    assert.ok(stage);
    assert.ok(video);
    assert.equal(goal.rect.width, PATH_MAP_GOAL_WIDTH);
    assert.equal(goal.rect.height, PATH_MAP_GOAL_HEIGHT);
    assert.equal(stage.rect.width, PATH_MAP_STAGE_WIDTH);
    assert.equal(stage.rect.height, PATH_MAP_STAGE_HEIGHT);
    assert.equal(video.rect.width, PATH_MAP_VIDEO_WIDTH);
    assert.equal(video.rect.height, PATH_MAP_VIDEO_HEIGHT);
  });

  it('keeps connector endpoints attached to node edges', () => {
    const stages = maxSizedStages().slice(0, 2);
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Two stages',
      goal: 'Goal',
      stages,
    });
    const byId = new Map(
      presentation.desktop.nodes.map((node) => [node.id, node])
    );
    for (const connector of presentation.desktop.connectors) {
      const from = byId.get(connector.fromNodeId);
      const to = byId.get(connector.toNodeId);
      assert.ok(from, connector.fromNodeId);
      assert.ok(to, connector.toNodeId);
      assert.ok(
        connector.y1 <= connector.y2 || connector.kind === 'stage-to-stage'
      );
      assert.notEqual(connector.x1, undefined);
      assert.notEqual(connector.x2, undefined);
    }
  });
});

describe('path-map empty / small / max handling', () => {
  it('handles an empty path with only the goal node', () => {
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Empty',
      goal: 'Learn anything',
      stages: [],
    });
    assert.equal(presentation.stageCount, 0);
    assert.equal(presentation.videoCount, 0);
    assert.equal(presentation.orderedItems.length, 1);
    assert.equal(presentation.orderedItems[0].kind, 'goal');
    assert.equal(presentation.desktop.nodes.length, 1);
    assert.equal(presentation.desktop.connectors.length, 0);
    assert.equal(presentation.mobile.nodes.length, 1);
  });

  it('handles a small path (one stage, one video)', () => {
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Small',
      goal: 'Goal',
      stages: [
        makeStage({
          id: 'stage-1',
          position: 0,
          videos: [
            makeVideo({
              id: 'video-1',
              stage_id: 'stage-1',
              position: 0,
              youtube_video_id: 'fffffffffff',
            }),
          ],
        }),
      ],
      practicedVideoIds: ['video-1'],
      selectedPathVideoId: 'video-1',
    });
    assert.equal(presentation.stageCount, 1);
    assert.equal(presentation.videoCount, 1);
    const video = presentation.orderedItems.find(
      (item) => item.kind === 'video'
    );
    assert.ok(video && video.kind === 'video');
    assert.equal(video.practiced, true);
    assert.equal(video.selected, true);
    assert.match(video.href, /\/watch\/fffffffffff\?/);
    assert.match(video.href, /pathId=/);
    assert.match(video.href, /pathVideoId=video-1/);
  });

  it('caps max-sized paths at five stages and two videos each', () => {
    const oversized = maxSizedStages();
    oversized.push(
      makeStage({
        id: 'stage-extra',
        position: 99,
        videos: [
          makeVideo({
            id: 'video-extra',
            stage_id: 'stage-extra',
            position: 0,
            youtube_video_id: 'ggggggggggg',
          }),
          makeVideo({
            id: 'video-extra-2',
            stage_id: 'stage-extra',
            position: 1,
            youtube_video_id: 'hhhhhhhhhhh',
          }),
          makeVideo({
            id: 'video-extra-3',
            stage_id: 'stage-extra',
            position: 2,
            youtube_video_id: 'iiiiiiiiiii',
          }),
        ],
      })
    );
    // Also oversize first stage videos
    oversized[0] = {
      ...oversized[0],
      videos: [
        ...oversized[0].videos,
        makeVideo({
          id: 'video-overflow',
          stage_id: oversized[0].id,
          position: 9,
          youtube_video_id: 'jjjjjjjjjjj',
        }),
      ],
    };

    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Max',
      goal: 'Goal',
      stages: oversized,
    });

    assert.equal(presentation.stageCount, PATH_MAP_MAX_STAGES);
    assert.equal(
      presentation.videoCount,
      PATH_MAP_MAX_STAGES * PATH_MAP_MAX_VIDEOS_PER_STAGE
    );
    assert.ok(presentation.desktop.width > PATH_MAP_GOAL_WIDTH);
    assert.ok(presentation.desktop.height > PATH_MAP_GOAL_HEIGHT);
    assert.ok(presentation.desktop.connectors.length > 0);
    assert.ok(presentation.mobile.height > presentation.desktop.height / 2);
  });
});

describe('path-map accessibility structure', () => {
  it('exposes labeled ordered items and keyboard-focusable video targets', () => {
    const stages = maxSizedStages().slice(0, 2);
    const withStates = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'A11y',
      goal: 'Pass the exam',
      stages,
      completedStageIds: [stages[0].id],
      practicedVideoIds: [stages[0].videos[0].id],
      selectedPathVideoId: stages[0].videos[0].id,
    });

    const a11y = pathPresentationA11yStructure(withStates);
    assert.equal(a11y.orderedListRole, 'list');
    assert.equal(a11y.itemCount, withStates.orderedItems.length);
    assert.equal(a11y.items[0].kind, 'goal');
    assert.match(a11y.items[0].ariaLabel, /Path goal:/);
    assert.equal(a11y.items[0].tabIndexHint, -1);

    const videoItems = a11y.items.filter((item) => item.kind === 'video');
    assert.ok(videoItems.length >= 1);
    for (const video of videoItems) {
      assert.equal(video.tabIndexHint, 0);
      assert.ok(video.href);
      assert.match(video.ariaLabel, /^Video:/);
    }

    const stageItems = a11y.items.filter((item) => item.kind === 'stage');
    assert.match(stageItems[0].ariaLabel, /completed/);
    assert.equal(a11y.mapHasConnectors, true);
    assert.deepEqual(a11y.desktopNodeIds, a11y.mobileNodeIds);
  });

  it('PathMap component derives content from the presentation contract', () => {
    const source = readFileSync(
      join(root, 'src/components/PathMap.tsx'),
      'utf8'
    );
    assert.match(source, /buildPathPresentation/);
    assert.match(source, /role="img"/);
    assert.match(source, /<ol/);
    assert.match(source, /focus-visible:ring/);
    assert.match(source, /href=\{node\.href\}/);
    assert.match(source, /href=\{item\.href\}/);
    assert.equal(source.includes('fetch('), false);
    assert.equal(/openai|anthropic|generateText|llm/i.test(source), false);
  });

  it('path detail wires map and edit list to the same stages state', () => {
    const source = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    assert.match(source, /import PathMap from '@\/components\/PathMap'/);
    assert.match(source, /<PathMap/);
    assert.match(source, /stages=\{pageState\.stages\}/);
    assert.match(source, /data\.stages/);
  });
});
