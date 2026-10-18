import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPathPresentation,
  compareByPositionThenId,
  PATH_MAP_GAP_X,
  PATH_MAP_MAX_STAGES,
  PATH_MAP_MAX_VIDEOS_PER_STAGE,
  PATH_MAP_MOBILE_VIDEO_WIDTH,
  PATH_MAP_PADDING,
  PATH_MAP_STAGE_GROUP_GAP,
  PATH_MAP_STAGE_HEIGHT,
  PATH_MAP_VIDEO_HEIGHT,
  PATH_MAP_VIDEO_WIDTH,
  pathMapGoalNodeId,
  pathMapLayoutDomId,
  pathMapStageDetailsId,
  pathMapStageNodeId,
  pathMapVideoNodeId,
  pathPresentationA11yStructure,
  resolvePathMapExpandedStageId,
  resolveRecommendedNextLesson,
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

    assert.equal(presentation.goalContext, 'Pass CKA');
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

    // Canvas is a sequential lesson spine: stages + lessons, no goal node.
    const spineIds = [
      pathMapStageNodeId('stage-1'),
      pathMapVideoNodeId('video-1'),
      pathMapStageNodeId('stage-2'),
      pathMapVideoNodeId('video-2'),
    ];
    assert.deepEqual(
      presentation.desktop.nodes.map((node) => node.id),
      spineIds
    );
    assert.deepEqual(
      presentation.mobile.nodes.map((node) => node.id),
      spineIds
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
    assert.equal(presentation.goalContext, 'Goal text');
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
    assert.equal(
      presentation.desktop.nodes.some((node) => node.kind === 'goal'),
      false
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

  it('uses compact stage headings and prominent lesson geometry', () => {
    const stages = maxSizedStages().slice(0, 1);
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Small',
      goal: 'Goal',
      stages,
    });
    const stage = presentation.desktop.nodes.find(
      (node) => node.kind === 'stage'
    );
    const video = presentation.desktop.nodes.find(
      (node) => node.kind === 'video'
    );
    assert.ok(stage);
    assert.ok(video);
    assert.equal(stage.rect.height, PATH_MAP_STAGE_HEIGHT);
    assert.ok(stage.rect.height < PATH_MAP_VIDEO_HEIGHT);
    assert.equal(video.rect.width, PATH_MAP_VIDEO_WIDTH);
    assert.equal(video.rect.height, PATH_MAP_VIDEO_HEIGHT);
    assert.equal(presentation.desktop.bands.length, 1);
  });

  it('keeps lesson-to-lesson spine connectors attached to lesson edges', () => {
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
    assert.ok(presentation.desktop.connectors.length >= 1);
    for (const connector of presentation.desktop.connectors) {
      assert.equal(connector.kind, 'lesson-to-lesson');
      const from = byId.get(connector.fromNodeId);
      const to = byId.get(connector.toNodeId);
      assert.ok(from && from.kind === 'video', connector.fromNodeId);
      assert.ok(to && to.kind === 'video', connector.toNodeId);
      assert.equal(connector.y1, connector.y2);
      assert.ok(connector.x1 < connector.x2);
    }
  });

  it('fits an ordinary three-stage desktop spine within 1280px content width', () => {
    const stages = maxSizedStages().slice(0, 3);
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Three stages',
      goal: 'Goal',
      stages,
    });
    const contentWidthAt1280 = 1280 - 64;
    const lessonCount = stages.reduce(
      (sum, stage) => sum + stage.videos.length,
      0
    );
    const expectedWidth =
      PATH_MAP_PADDING * 2 +
      lessonCount * PATH_MAP_VIDEO_WIDTH +
      (lessonCount - stages.length) * PATH_MAP_GAP_X +
      (stages.length - 1) * PATH_MAP_STAGE_GROUP_GAP;
    assert.equal(presentation.desktop.width, expectedWidth);
    assert.ok(presentation.desktop.width <= contentWidthAt1280);
    assert.ok(
      presentation.mobile.width <=
        PATH_MAP_PADDING * 2 + PATH_MAP_MOBILE_VIDEO_WIDTH
    );
  });
});

describe('path-map empty / small / max handling', () => {
  it('handles an empty path with goal context and no spine nodes', () => {
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
    assert.equal(presentation.goalContext, 'Learn anything');
    assert.equal(presentation.desktop.nodes.length, 0);
    assert.equal(presentation.desktop.connectors.length, 0);
    assert.equal(presentation.mobile.nodes.length, 0);
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
    assert.equal(video.watchedCompleted, false);
    assert.equal(video.selected, true);
    assert.match(video.href, /\/watch\/fffffffffff\?/);
    assert.match(video.href, /pathId=/);
    assert.match(video.href, /pathVideoId=video-1/);
  });

  it('marks watched-completed separately from practiced for path return checks', () => {
    const presentation = buildPathPresentation({
      pathId: '11111111-1111-4111-8111-111111111111',
      pathTitle: 'Path',
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
              title: 'Intro lesson',
            }),
            makeVideo({
              id: 'video-2',
              stage_id: 'stage-1',
              position: 1,
              youtube_video_id: 'ggggggggggg',
              title: 'Next lesson',
            }),
          ],
        }),
      ],
      practicedVideoIds: ['video-2'],
      watchedCompletedVideoIds: ['video-1'],
    });

    const finished = presentation.orderedItems.find(
      (item) => item.kind === 'video' && item.pathVideoId === 'video-1'
    );
    const practicedOnly = presentation.orderedItems.find(
      (item) => item.kind === 'video' && item.pathVideoId === 'video-2'
    );
    assert.ok(finished && finished.kind === 'video');
    assert.ok(practicedOnly && practicedOnly.kind === 'video');
    assert.equal(finished.watchedCompleted, true);
    assert.equal(finished.practiced, false);
    assert.match(finished.ariaLabel, /finished/);
    assert.doesNotMatch(finished.ariaLabel, /practiced/);
    assert.equal(practicedOnly.watchedCompleted, false);
    assert.equal(practicedOnly.practiced, true);
    assert.match(practicedOnly.ariaLabel, /practiced/);
    assert.doesNotMatch(practicedOnly.ariaLabel, /finished/);
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
    assert.ok(presentation.desktop.width > PATH_MAP_VIDEO_WIDTH);
    assert.ok(
      presentation.desktop.height >=
        PATH_MAP_PADDING * 2 + PATH_MAP_STAGE_HEIGHT + PATH_MAP_VIDEO_HEIGHT
    );
    assert.equal(
      presentation.desktop.connectors.length,
      PATH_MAP_MAX_STAGES * PATH_MAP_MAX_VIDEOS_PER_STAGE - 1
    );
    assert.ok(presentation.mobile.height > presentation.desktop.height);
    assert.ok(
      presentation.mobile.width <=
        PATH_MAP_PADDING * 2 + PATH_MAP_MOBILE_VIDEO_WIDTH
    );
  });
});

describe('path-map accessibility structure', () => {
  it('exposes labeled ordered items and keyboard-focusable stage/video targets', () => {
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
    for (const stage of stageItems) {
      assert.equal(stage.tabIndexHint, 0);
      assert.ok(stage.detailsId);
      assert.equal(
        stage.detailsId,
        pathMapStageDetailsId(stage.id.slice('path-map-stage-'.length))
      );
    }
    assert.deepEqual(
      a11y.stageDetailsIds,
      withStates.stages.map((stage) => stage.detailsId)
    );
    assert.equal(a11y.mapHasConnectors, true);
    assert.deepEqual(a11y.desktopNodeIds, a11y.mobileNodeIds);
    assert.equal(
      a11y.desktopNodeIds.some((id) => id.startsWith('path-map-goal-')),
      false
    );
    assert.ok(
      a11y.desktopNodeIds.some((id) => id.startsWith('path-map-video-'))
    );
  });

  it('PathMap component derives content from the presentation contract', () => {
    const source = readFileSync(
      join(root, 'src/components/PathMap.tsx'),
      'utf8'
    );
    assert.match(source, /buildPathPresentation/);
    assert.match(source, /resolvePathMapExpandedStageId/);
    assert.match(source, /pathMapLayoutDomId/);
    assert.match(source, /aria-expanded=/);
    assert.match(source, /aria-controls=/);
    assert.match(source, /hidden=\{!expanded\}/);
    assert.match(source, /detailsInOrderedList/);
    assert.match(source, /detailsUnderMap/);
    assert.match(source, /includeDetails=\{detailsInOrderedList\}/);
    assert.match(source, /sr-only/);
    assert.match(source, /goalContext/);
    assert.match(source, /layout\.bands/);
    assert.match(source, /<ol/);
    assert.match(source, /focus-visible:ring/);
    assert.match(source, /motion-reduce:transition-none/);
    assert.match(source, /href=\{node\.href\}/);
    assert.match(source, /href=\{lesson\.href\}/);
    assert.match(source, /href=\{stage\.primaryAction\.href\}/);
    assert.match(source, /FinishedCheck/);
    assert.match(source, /watchedCompleted/);
    assert.equal(source.includes('role="img"'), false);
    assert.equal(source.includes('fetch('), false);
    assert.equal(/openai|anthropic|generateText|llm/i.test(source), false);
    assert.equal(source.includes('allLessonsPracticed'), false);
  });

  it('path detail wires practiced, completion, and continue selection into PathMap', () => {
    const source = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    assert.match(source, /import PathMap from '@\/components\/PathMap'/);
    assert.match(source, /<PathMap/);
    assert.match(source, /stages=\{pageState\.stages\}/);
    assert.match(
      source,
      /practicedVideoIds=\{pageState\.progress\?\.practicedVideoIds/
    );
    assert.match(source, /watchedCompletedVideoIds=\{watchedCompletedIds\}/);
    assert.match(
      source,
      /completedStageIds=\{pageState\.progress\?\.completedStageIds/
    );
    assert.match(
      source,
      /selectedPathVideoId=\{\s*pageState\.progress\?\.continueTarget\?\.pathVideoId/
    );
    assert.match(
      source,
      /selectedStageId=\{\s*pageState\.progress\?\.continueTarget\?\.stageId/
    );
    assert.match(source, /data\.stages/);
  });

  it('path detail keeps sequence editor hidden until Edit sequence disclosure', () => {
    const source = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    assert.match(
      source,
      /const \[isSequenceEditorOpen, setIsSequenceEditorOpen\] = useState\(false\)/
    );
    assert.match(
      source,
      /useEffect\(\(\) => \{\s*setIsSequenceEditorOpen\(false\);\s*\}, \[pathId\]\)/
    );
    assert.match(source, /aria-expanded=\{isSequenceEditorOpen\}/);
    assert.match(source, /aria-controls="path-sequence-editor"/);
    assert.match(source, />\s*Edit sequence\s*</);
    assert.match(source, /id="path-sequence-editor"/);
    assert.match(source, /role="region"/);
    assert.match(source, /aria-labelledby="path-sequence-editor-heading"/);
    assert.match(source, /hidden=\{!isSequenceEditorOpen\}/);
    assert.match(source, /setIsSequenceEditorOpen\(false\)/);
    assert.match(source, />\s*Done\s*</);

    const regenerateMatch = source.match(/>\s*Regenerate\s*</);
    const regenerateIndex = regenerateMatch?.index ?? -1;
    const regenerateDraftIndex = source.indexOf('Regenerate draft');
    const editDisclosureIndex = source.indexOf(
      'aria-controls="path-sequence-editor"'
    );
    const mapIndex = source.indexOf('<PathMap');
    const editorRegionIndex = source.indexOf('id="path-sequence-editor"');
    const emptyPathIndex = source.indexOf('Empty path');
    assert.ok(regenerateIndex > 0);
    assert.equal(regenerateDraftIndex, -1);
    assert.match(source, /buildPathRegenerateHref/);
    assert.ok(editDisclosureIndex > regenerateIndex);
    assert.ok(mapIndex > editDisclosureIndex);
    assert.ok(editorRegionIndex > mapIndex);
    assert.ok(emptyPathIndex > 0);
    assert.match(source, /No stages yet\. Research builds a stored sequence/);
    assert.match(source, /action: 'rename_stage'/);
    assert.match(source, /action: 'reorder_stages'/);
    assert.match(source, /PathDismissedVideosReview/);
  });

  it('demo landing keeps inline selection and selected stage wiring', () => {
    const source = readFileSync(
      join(root, 'src/components/DemoPathLanding.tsx'),
      'utf8'
    );
    assert.match(source, /selectedStageId: selectedVideo\?\.stageId/);
    assert.match(source, /onVideoSelect=/);
    assert.match(source, /window\.location\.hash = desiredHash/);
    assert.equal(source.includes('replaceState'), false);
    assert.match(source, /hashchange/);
    assert.match(source, /resolveDemoLandingVideoFromHash/);
    assert.equal(source.includes('if (!fromHash)'), false);
    assert.equal(source.includes('lg:grid-cols-'), false);
    assert.match(source, /space-y-10/);
    assert.match(source, /id="demo-player"/);
    const mapIndex = source.indexOf('<PathMap');
    const playerIndex = source.indexOf('id="demo-player"');
    assert.ok(mapIndex > 0);
    assert.ok(playerIndex > mapIndex);
  });
});

describe('path-map stage expansion contract', () => {
  function twoStageFixture(): PathStageWithVideos[] {
    return [
      makeStage({
        id: 'stage-1',
        position: 0,
        title: 'Foundations',
        learning_objective: 'Build foundations',
        videos: [
          makeVideo({
            id: 'video-1a',
            stage_id: 'stage-1',
            position: 0,
            youtube_video_id: 'aaaaaaaaaaa',
            title: 'Lesson 1A',
          }),
          makeVideo({
            id: 'video-1b',
            stage_id: 'stage-1',
            position: 1,
            youtube_video_id: 'bbbbbbbbbbb',
            title: 'Lesson 1B',
          }),
        ],
      }),
      makeStage({
        id: 'stage-2',
        position: 1,
        title: 'Practice',
        learning_objective: 'Apply the skill',
        videos: [
          makeVideo({
            id: 'video-2a',
            stage_id: 'stage-2',
            position: 0,
            youtube_video_id: 'ccccccccccc',
            title: 'Lesson 2A',
          }),
        ],
      }),
    ];
  }

  it('keeps stage and lesson order identical across stages, ordered items, and layouts', () => {
    const stages = twoStageFixture();
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Order path',
      goal: 'Goal',
      stages,
    });

    assert.deepEqual(
      presentation.stages.map((stage) => stage.stageId),
      ['stage-1', 'stage-2']
    );
    assert.deepEqual(
      presentation.stages.flatMap((stage) =>
        stage.lessons.map((lesson) => lesson.pathVideoId)
      ),
      ['video-1a', 'video-1b', 'video-2a']
    );

    const orderedStageAndVideoIds = presentation.orderedItems
      .filter((item) => item.kind !== 'goal')
      .map((item) => (item.kind === 'stage' ? item.stageId : item.pathVideoId));
    assert.deepEqual(orderedStageAndVideoIds, [
      'stage-1',
      'video-1a',
      'video-1b',
      'stage-2',
      'video-2a',
    ]);

    assert.deepEqual(
      presentation.desktop.nodes.map((node) =>
        node.kind === 'stage' ? node.stageId : node.pathVideoId
      ),
      orderedStageAndVideoIds
    );
    assert.deepEqual(
      presentation.mobile.nodes.map((node) =>
        node.kind === 'stage' ? node.stageId : node.pathVideoId
      ),
      orderedStageAndVideoIds
    );
  });

  it('reports truthful per-stage practiced counts and explicit recommended next', () => {
    const stages = twoStageFixture();
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Counts path',
      goal: 'Goal',
      stages,
      practicedVideoIds: ['video-1a'],
    });

    assert.equal(presentation.stages[0].practicedCount, 1);
    assert.equal(presentation.stages[0].lessonCount, 2);
    assert.equal(presentation.stages[1].practicedCount, 0);
    assert.equal(presentation.stages[1].lessonCount, 1);

    assert.ok(presentation.recommendedNext);
    assert.equal(presentation.recommendedNext.pathVideoId, 'video-1b');
    assert.equal(presentation.recommendedNext.stageId, 'stage-1');
    assert.equal(presentation.currentStageId, 'stage-1');
    assert.equal(presentation.stages[0].isCurrent, true);
    assert.equal(presentation.stages[1].isCurrent, false);

    const recommendedLesson = presentation.stages[0].lessons.find(
      (lesson) => lesson.pathVideoId === 'video-1b'
    );
    assert.ok(recommendedLesson);
    assert.equal(recommendedLesson.recommended, true);
    assert.equal(presentation.stages[0].lessons[0].recommended, false);

    const desktopRecommended = presentation.desktop.nodes.find(
      (node) => node.kind === 'video' && node.pathVideoId === 'video-1b'
    );
    assert.ok(desktopRecommended && desktopRecommended.kind === 'video');
    assert.equal(desktopRecommended.recommended, true);

    assert.equal(presentation.stages[0].primaryAction?.kind, 'continue');
    assert.equal(presentation.stages[0].primaryAction?.pathVideoId, 'video-1b');
    assert.equal(presentation.stages[1].primaryAction?.kind, 'start');
    assert.equal(presentation.stages[1].primaryAction?.pathVideoId, 'video-2a');
  });

  it('marks completed and current semantics without locking future stages', () => {
    const stages = twoStageFixture();
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Semantics path',
      goal: 'Goal',
      stages,
      practicedVideoIds: ['video-1a', 'video-1b'],
      completedStageIds: ['stage-1'],
      selectedStageId: 'stage-2',
    });

    assert.equal(presentation.stages[0].completed, true);
    assert.equal(presentation.stages[0].isCurrent, false);
    assert.equal(presentation.stages[1].completed, false);
    assert.equal(presentation.stages[1].isCurrent, true);
    assert.equal(presentation.stages[1].selected, true);
    assert.equal(presentation.recommendedNext?.pathVideoId, 'video-2a');

    const stageOrdered = presentation.orderedItems.filter(
      (item) => item.kind === 'stage'
    );
    assert.equal(stageOrdered[0].kind, 'stage');
    assert.equal(stageOrdered[0].completed, true);
    assert.equal(stageOrdered[0].isCurrent, false);
    assert.equal(stageOrdered[1].kind, 'stage');
    assert.equal(stageOrdered[1].isCurrent, true);
    assert.equal(stageOrdered[1].selected, true);

    const allPracticed = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Done path',
      goal: 'Goal',
      stages,
      practicedVideoIds: ['video-1a', 'video-1b', 'video-2a'],
      completedStageIds: ['stage-1', 'stage-2'],
    });
    assert.equal(allPracticed.recommendedNext, null);
    assert.equal(allPracticed.currentStageId, null);
    assert.ok(allPracticed.stages.every((stage) => stage.primaryAction));
  });

  it('exposes stable expansion ids aligned with stage summaries', () => {
    const stages = twoStageFixture();
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Ids path',
      goal: 'Goal',
      stages,
    });

    for (const [index, stage] of presentation.stages.entries()) {
      assert.equal(stage.nodeId, pathMapStageNodeId(stage.stageId));
      assert.equal(stage.detailsId, pathMapStageDetailsId(stage.stageId));
      assert.equal(stage.objective, stages[index].learning_objective);
    }

    const stageItems = presentation.orderedItems.filter(
      (item) => item.kind === 'stage'
    );
    assert.deepEqual(
      stageItems.map((item) => (item.kind === 'stage' ? item.detailsId : null)),
      presentation.stages.map((stage) => stage.detailsId)
    );

    const stageNodes = presentation.desktop.nodes.filter(
      (node) => node.kind === 'stage'
    );
    assert.deepEqual(
      stageNodes.map((node) => (node.kind === 'stage' ? node.detailsId : null)),
      presentation.stages.map((stage) => stage.detailsId)
    );

    const recommended = resolveRecommendedNextLesson(
      sortStagesForPresentation(stages),
      new Set(),
      PATH_ID,
      (youtubeVideoId, pathId, pathVideoId) =>
        `/watch/${youtubeVideoId}?pathId=${pathId}&pathVideoId=${pathVideoId}`
    );
    assert.equal(recommended?.pathVideoId, 'video-1a');
    assert.equal(recommended?.nodeId, pathMapVideoNodeId('video-1a'));
  });

  it('preserves custom buildVideoHref on recommended next and primary actions', () => {
    const stages = twoStageFixture();
    const presentation = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Href path',
      goal: 'Goal',
      stages,
      practicedVideoIds: ['video-1a'],
      buildVideoHref: (_youtubeVideoId, _pathId, pathVideoId) =>
        `/#demo-${pathVideoId}`,
    });

    assert.equal(presentation.recommendedNext?.href, '/#demo-video-1b');
    assert.equal(presentation.stages[0].primaryAction?.href, '/#demo-video-1b');
    assert.equal(presentation.stages[0].lessons[1].href, '/#demo-video-1b');
    const mapVideo = presentation.desktop.nodes.find(
      (node) => node.kind === 'video' && node.pathVideoId === 'video-1b'
    );
    assert.ok(mapVideo && mapVideo.kind === 'video');
    assert.equal(mapVideo.href, '/#demo-video-1b');
  });

  it('resolves expansion for return, collapse, revisit, and path changes', () => {
    const available = ['stage-1', 'stage-2'];

    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: available,
        selectedStageId: 'stage-2',
        currentStageId: 'stage-1',
      }),
      'stage-2'
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: available,
        currentStageId: 'stage-1',
      }),
      'stage-1'
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: available,
        previousExpandedStageId: null,
        currentStageId: 'stage-1',
      }),
      null
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: available,
        previousExpandedStageId: 'stage-2',
        currentStageId: 'stage-1',
      }),
      'stage-2'
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: available,
        previousExpandedStageId: 'stage-2',
        selectedStageId: 'stage-1',
        selectionChanged: true,
      }),
      'stage-1'
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: ['stage-2'],
        previousExpandedStageId: 'stage-1',
        currentStageId: 'stage-2',
        pathChanged: true,
      }),
      'stage-2'
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: ['stage-2'],
        previousExpandedStageId: 'stage-gone',
        currentStageId: 'stage-2',
      }),
      'stage-2'
    );
    assert.equal(
      resolvePathMapExpandedStageId({
        availableStageIds: [],
        previousExpandedStageId: 'stage-1',
      }),
      null
    );

    assert.equal(
      pathMapLayoutDomId('desktop', pathMapStageNodeId('stage-1')),
      'desktop-path-map-stage-stage-1'
    );
    assert.equal(
      pathMapLayoutDomId('mobile', pathMapStageNodeId('stage-1')),
      'mobile-path-map-stage-stage-1'
    );
    assert.notEqual(
      pathMapLayoutDomId('desktop', pathMapStageNodeId('stage-1')),
      pathMapLayoutDomId('mobile', pathMapStageNodeId('stage-1'))
    );
  });

  it('keeps recommended next aligned with explicit practiced ids only', () => {
    const stages = twoStageFixture();
    const fromPractice = buildPathPresentation({
      pathId: PATH_ID,
      pathTitle: 'Practice only',
      goal: 'Goal',
      stages,
      practicedVideoIds: ['video-1a'],
      selectedPathVideoId: 'video-2a',
      selectedStageId: 'stage-2',
    });

    assert.equal(fromPractice.recommendedNext?.pathVideoId, 'video-1b');
    assert.equal(fromPractice.currentStageId, 'stage-1');
    assert.equal(fromPractice.stages[0].isCurrent, true);
    assert.equal(fromPractice.stages[1].selected, true);
    assert.equal(
      fromPractice.stages[0].lessons.some((lesson) => lesson.recommended),
      true
    );
    assert.equal(
      fromPractice.stages[1].lessons.some((lesson) => lesson.recommended),
      false
    );
  });
});
