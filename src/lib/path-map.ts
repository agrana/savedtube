/**
 * Deterministic path map + ordered-list presentation contract.
 * Layout is fixed from stored revision data — no model calls, no random coords.
 */

import {
  RESEARCH_MAX_STAGES,
  RESEARCH_MAX_VIDEOS_PER_STAGE,
} from './config-research-defaults';
import { buildPathWatchHref } from './path-links';
import type { PathStageWithVideos } from './path-research-schema';

/** Fixed card geometry (px) — shared by map render and layout tests. */
export const PATH_MAP_GOAL_WIDTH = 240;
export const PATH_MAP_GOAL_HEIGHT = 72;
export const PATH_MAP_STAGE_WIDTH = 200;
export const PATH_MAP_STAGE_HEIGHT = 96;
export const PATH_MAP_VIDEO_WIDTH = 184;
export const PATH_MAP_VIDEO_HEIGHT = 68;
export const PATH_MAP_GAP_X = 40;
export const PATH_MAP_GAP_Y = 36;
export const PATH_MAP_PADDING = 24;
export const PATH_MAP_CONNECTOR_STROKE = 2;

export const PATH_MAP_MAX_STAGES = RESEARCH_MAX_STAGES;
export const PATH_MAP_MAX_VIDEOS_PER_STAGE = RESEARCH_MAX_VIDEOS_PER_STAGE;

export type PathMapNodeKind = 'goal' | 'stage' | 'video';

export type PathMapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PathMapConnector = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'goal-to-stage' | 'stage-to-stage' | 'stage-to-video';
};

export type PathMapGoalNode = {
  kind: 'goal';
  id: string;
  label: string;
  ariaLabel: string;
  rect: PathMapRect;
};

export type PathMapStageNode = {
  kind: 'stage';
  id: string;
  stageId: string;
  position: number;
  label: string;
  subtitle: string;
  ariaLabel: string;
  completed: boolean;
  selected: boolean;
  rect: PathMapRect;
};

export type PathMapVideoNode = {
  kind: 'video';
  id: string;
  pathVideoId: string;
  stageId: string;
  youtubeVideoId: string;
  position: number;
  label: string;
  channelTitle: string | null;
  ariaLabel: string;
  href: string;
  practiced: boolean;
  selected: boolean;
  rect: PathMapRect;
};

export type PathMapNode = PathMapGoalNode | PathMapStageNode | PathMapVideoNode;

export type PathMapOrderedItem =
  | {
      kind: 'goal';
      id: string;
      label: string;
      ariaLabel: string;
    }
  | {
      kind: 'stage';
      id: string;
      stageId: string;
      position: number;
      label: string;
      ariaLabel: string;
      completed: boolean;
      selected: boolean;
    }
  | {
      kind: 'video';
      id: string;
      pathVideoId: string;
      stageId: string;
      youtubeVideoId: string;
      position: number;
      label: string;
      ariaLabel: string;
      href: string;
      practiced: boolean;
      selected: boolean;
    };

export type PathMapLayout = {
  width: number;
  height: number;
  nodes: PathMapNode[];
  connectors: PathMapConnector[];
};

export type PathPresentation = {
  /** Stable revision fingerprint for reload equality checks. */
  contentKey: string;
  goalNodeId: string;
  orderedItems: PathMapOrderedItem[];
  desktop: PathMapLayout;
  mobile: PathMapLayout;
  stageCount: number;
  videoCount: number;
};

export type BuildPathVideoHref = (
  youtubeVideoId: string,
  pathId: string,
  pathVideoId: string
) => string;

export type BuildPathPresentationInput = {
  pathId: string;
  pathTitle: string;
  goal: string;
  stages: PathStageWithVideos[];
  practicedVideoIds?: ReadonlyArray<string> | ReadonlySet<string>;
  completedStageIds?: ReadonlyArray<string> | ReadonlySet<string>;
  selectedPathVideoId?: string | null;
  selectedStageId?: string | null;
  /** Override watch hrefs (e.g. public demo landing hashes). */
  buildVideoHref?: BuildPathVideoHref;
};

function toIdSet(
  value: ReadonlyArray<string> | ReadonlySet<string> | undefined
): Set<string> {
  if (!value) {
    return new Set();
  }
  return value instanceof Set ? new Set(value) : new Set(value);
}

/** Explicit ordering: position asc, then stable id asc. */
export function compareByPositionThenId(
  a: { position: number; id: string },
  b: { position: number; id: string }
): number {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortStagesForPresentation(
  stages: PathStageWithVideos[]
): PathStageWithVideos[] {
  return [...stages]
    .map((stage) => ({
      ...stage,
      videos: [...stage.videos].sort(compareByPositionThenId),
    }))
    .sort(compareByPositionThenId);
}

export function pathMapGoalNodeId(pathId: string): string {
  return `path-map-goal-${pathId}`;
}

export function pathMapStageNodeId(stageId: string): string {
  return `path-map-stage-${stageId}`;
}

export function pathMapVideoNodeId(pathVideoId: string): string {
  return `path-map-video-${pathVideoId}`;
}

function bottomCenter(rect: PathMapRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
}

function topCenter(rect: PathMapRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y };
}

function rightCenter(rect: PathMapRect): { x: number; y: number } {
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
}

function leftCenter(rect: PathMapRect): { x: number; y: number } {
  return { x: rect.x, y: rect.y + rect.height / 2 };
}

function columnWidth(): number {
  return Math.max(PATH_MAP_STAGE_WIDTH, PATH_MAP_VIDEO_WIDTH);
}

function buildDesktopLayout(args: {
  goalNodeId: string;
  goalLabel: string;
  goalAria: string;
  orderedStages: PathStageWithVideos[];
  practiced: Set<string>;
  completed: Set<string>;
  selectedPathVideoId: string | null;
  selectedStageId: string | null;
  pathId: string;
  buildVideoHref: BuildPathVideoHref;
}): PathMapLayout {
  const {
    goalNodeId,
    goalLabel,
    goalAria,
    orderedStages,
    practiced,
    completed,
    selectedPathVideoId,
    selectedStageId,
    pathId,
    buildVideoHref,
  } = args;

  const colW = columnWidth();
  const stageCount = orderedStages.length;
  const maxVideos = orderedStages.reduce(
    (max, stage) => Math.max(max, stage.videos.length),
    0
  );

  const stagesBlockWidth =
    stageCount === 0
      ? PATH_MAP_GOAL_WIDTH
      : stageCount * colW + (stageCount - 1) * PATH_MAP_GAP_X;

  const width =
    PATH_MAP_PADDING * 2 + Math.max(PATH_MAP_GOAL_WIDTH, stagesBlockWidth);

  const goalX = (width - PATH_MAP_GOAL_WIDTH) / 2;
  const goalY = PATH_MAP_PADDING;
  const goalRect: PathMapRect = {
    x: goalX,
    y: goalY,
    width: PATH_MAP_GOAL_WIDTH,
    height: PATH_MAP_GOAL_HEIGHT,
  };

  const stagesRowX = (width - stagesBlockWidth) / 2;
  const stageY = goalY + PATH_MAP_GOAL_HEIGHT + PATH_MAP_GAP_Y;
  const videoY = stageY + PATH_MAP_STAGE_HEIGHT + PATH_MAP_GAP_Y;

  const nodes: PathMapNode[] = [
    {
      kind: 'goal',
      id: goalNodeId,
      label: goalLabel,
      ariaLabel: goalAria,
      rect: goalRect,
    },
  ];
  const connectors: PathMapConnector[] = [];

  let previousStageNode: PathMapStageNode | null = null;

  orderedStages.forEach((stage, stageIndex) => {
    const stageNodeId = pathMapStageNodeId(stage.id);
    const colX = stagesRowX + stageIndex * (colW + PATH_MAP_GAP_X);
    const stageRect: PathMapRect = {
      x: colX + (colW - PATH_MAP_STAGE_WIDTH) / 2,
      y: stageY,
      width: PATH_MAP_STAGE_WIDTH,
      height: PATH_MAP_STAGE_HEIGHT,
    };
    const stageNode: PathMapStageNode = {
      kind: 'stage',
      id: stageNodeId,
      stageId: stage.id,
      position: stage.position,
      label: stage.title,
      subtitle: stage.learning_objective,
      ariaLabel: `Stage ${stageIndex + 1}: ${stage.title}${
        completed.has(stage.id) ? ', completed' : ''
      }`,
      completed: completed.has(stage.id),
      selected: selectedStageId === stage.id,
      rect: stageRect,
    };
    nodes.push(stageNode);

    const fromGoal = bottomCenter(goalRect);
    const toStage = topCenter(stageRect);
    connectors.push({
      id: `connector-goal-${stage.id}`,
      fromNodeId: goalNodeId,
      toNodeId: stageNodeId,
      x1: fromGoal.x,
      y1: fromGoal.y,
      x2: toStage.x,
      y2: toStage.y,
      kind: 'goal-to-stage',
    });

    if (previousStageNode) {
      const from = rightCenter(previousStageNode.rect);
      const to = leftCenter(stageRect);
      connectors.push({
        id: `connector-stage-${previousStageNode.stageId}-${stage.id}`,
        fromNodeId: previousStageNode.id,
        toNodeId: stageNodeId,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        kind: 'stage-to-stage',
      });
    }
    previousStageNode = stageNode;

    stage.videos.forEach((video, videoIndex) => {
      const videoNodeId = pathMapVideoNodeId(video.id);
      const videoRect: PathMapRect = {
        x: colX + (colW - PATH_MAP_VIDEO_WIDTH) / 2,
        y: videoY + videoIndex * (PATH_MAP_VIDEO_HEIGHT + PATH_MAP_GAP_Y / 2),
        width: PATH_MAP_VIDEO_WIDTH,
        height: PATH_MAP_VIDEO_HEIGHT,
      };
      const practicedFlag = practiced.has(video.id);
      const selected = selectedPathVideoId === video.id;
      nodes.push({
        kind: 'video',
        id: videoNodeId,
        pathVideoId: video.id,
        stageId: stage.id,
        youtubeVideoId: video.youtube_video_id,
        position: video.position,
        label: video.title,
        channelTitle: video.channel_title,
        ariaLabel: `Video: ${video.title}${practicedFlag ? ', practiced' : ''}${
          selected ? ', selected' : ''
        }`,
        href: buildVideoHref(video.youtube_video_id, pathId, video.id),
        practiced: practicedFlag,
        selected,
        rect: videoRect,
      });

      const fromStage = bottomCenter(stageRect);
      const toVideo = topCenter(videoRect);
      connectors.push({
        id: `connector-video-${video.id}`,
        fromNodeId: stageNodeId,
        toNodeId: videoNodeId,
        x1: fromStage.x,
        y1: fromStage.y,
        x2: toVideo.x,
        y2: toVideo.y,
        kind: 'stage-to-video',
      });
    });
  });

  const height =
    PATH_MAP_PADDING * 2 +
    PATH_MAP_GOAL_HEIGHT +
    (stageCount > 0 ? PATH_MAP_GAP_Y + PATH_MAP_STAGE_HEIGHT : 0) +
    (maxVideos > 0
      ? PATH_MAP_GAP_Y +
        maxVideos * PATH_MAP_VIDEO_HEIGHT +
        Math.max(0, maxVideos - 1) * (PATH_MAP_GAP_Y / 2)
      : 0);

  return { width, height, nodes, connectors };
}

function buildMobileLayout(args: {
  goalNodeId: string;
  goalLabel: string;
  goalAria: string;
  orderedStages: PathStageWithVideos[];
  practiced: Set<string>;
  completed: Set<string>;
  selectedPathVideoId: string | null;
  selectedStageId: string | null;
  pathId: string;
  buildVideoHref: BuildPathVideoHref;
}): PathMapLayout {
  const {
    goalNodeId,
    goalLabel,
    goalAria,
    orderedStages,
    practiced,
    completed,
    selectedPathVideoId,
    selectedStageId,
    pathId,
    buildVideoHref,
  } = args;

  const contentWidth = Math.max(
    PATH_MAP_GOAL_WIDTH,
    PATH_MAP_STAGE_WIDTH,
    PATH_MAP_VIDEO_WIDTH
  );
  const width = PATH_MAP_PADDING * 2 + contentWidth;
  let cursorY = PATH_MAP_PADDING;

  const goalRect: PathMapRect = {
    x: (width - PATH_MAP_GOAL_WIDTH) / 2,
    y: cursorY,
    width: PATH_MAP_GOAL_WIDTH,
    height: PATH_MAP_GOAL_HEIGHT,
  };
  cursorY += PATH_MAP_GOAL_HEIGHT + PATH_MAP_GAP_Y;

  const nodes: PathMapNode[] = [
    {
      kind: 'goal',
      id: goalNodeId,
      label: goalLabel,
      ariaLabel: goalAria,
      rect: goalRect,
    },
  ];
  const connectors: PathMapConnector[] = [];
  let previousNodeRect = goalRect;
  let previousNodeId = goalNodeId;

  orderedStages.forEach((stage, stageIndex) => {
    const stageNodeId = pathMapStageNodeId(stage.id);
    const stageRect: PathMapRect = {
      x: (width - PATH_MAP_STAGE_WIDTH) / 2,
      y: cursorY,
      width: PATH_MAP_STAGE_WIDTH,
      height: PATH_MAP_STAGE_HEIGHT,
    };
    nodes.push({
      kind: 'stage',
      id: stageNodeId,
      stageId: stage.id,
      position: stage.position,
      label: stage.title,
      subtitle: stage.learning_objective,
      ariaLabel: `Stage ${stageIndex + 1}: ${stage.title}${
        completed.has(stage.id) ? ', completed' : ''
      }`,
      completed: completed.has(stage.id),
      selected: selectedStageId === stage.id,
      rect: stageRect,
    });

    const from = bottomCenter(previousNodeRect);
    const to = topCenter(stageRect);
    connectors.push({
      id: `mobile-connector-${previousNodeId}-${stageNodeId}`,
      fromNodeId: previousNodeId,
      toNodeId: stageNodeId,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      kind: previousNodeId === goalNodeId ? 'goal-to-stage' : 'stage-to-stage',
    });

    previousNodeRect = stageRect;
    previousNodeId = stageNodeId;
    cursorY += PATH_MAP_STAGE_HEIGHT + PATH_MAP_GAP_Y / 2;

    stage.videos.forEach((video) => {
      const videoNodeId = pathMapVideoNodeId(video.id);
      const videoRect: PathMapRect = {
        x: (width - PATH_MAP_VIDEO_WIDTH) / 2,
        y: cursorY,
        width: PATH_MAP_VIDEO_WIDTH,
        height: PATH_MAP_VIDEO_HEIGHT,
      };
      const practicedFlag = practiced.has(video.id);
      const selected = selectedPathVideoId === video.id;
      nodes.push({
        kind: 'video',
        id: videoNodeId,
        pathVideoId: video.id,
        stageId: stage.id,
        youtubeVideoId: video.youtube_video_id,
        position: video.position,
        label: video.title,
        channelTitle: video.channel_title,
        ariaLabel: `Video: ${video.title}${practicedFlag ? ', practiced' : ''}${
          selected ? ', selected' : ''
        }`,
        href: buildVideoHref(video.youtube_video_id, pathId, video.id),
        practiced: practicedFlag,
        selected,
        rect: videoRect,
      });

      const fromStage = bottomCenter(previousNodeRect);
      const toVideo = topCenter(videoRect);
      connectors.push({
        id: `mobile-connector-${video.id}`,
        fromNodeId: previousNodeId,
        toNodeId: videoNodeId,
        x1: fromStage.x,
        y1: fromStage.y,
        x2: toVideo.x,
        y2: toVideo.y,
        kind: 'stage-to-video',
      });

      previousNodeRect = videoRect;
      previousNodeId = videoNodeId;
      cursorY += PATH_MAP_VIDEO_HEIGHT + PATH_MAP_GAP_Y / 2;
    });

    cursorY += PATH_MAP_GAP_Y / 2;
  });

  const height = Math.max(
    cursorY + PATH_MAP_PADDING - PATH_MAP_GAP_Y / 2,
    PATH_MAP_PADDING * 2 + PATH_MAP_GOAL_HEIGHT
  );

  return { width, height, nodes, connectors };
}

/**
 * Build the shared map + ordered-list presentation from stored path data.
 * Pure and deterministic for a given input.
 */
export function buildPathPresentation(
  input: BuildPathPresentationInput
): PathPresentation {
  const practiced = toIdSet(input.practicedVideoIds);
  const completed = toIdSet(input.completedStageIds);
  const selectedPathVideoId = input.selectedPathVideoId ?? null;
  const selectedStageId = input.selectedStageId ?? null;
  const resolveVideoHref = input.buildVideoHref ?? buildPathWatchHref;

  const orderedStages = sortStagesForPresentation(input.stages).slice(
    0,
    PATH_MAP_MAX_STAGES
  );
  const cappedStages = orderedStages.map((stage) => ({
    ...stage,
    videos: stage.videos.slice(0, PATH_MAP_MAX_VIDEOS_PER_STAGE),
  }));

  const goalNodeId = pathMapGoalNodeId(input.pathId);
  const goalLabel = input.pathTitle.trim() || 'Learning path';
  const goalAria = `Path goal: ${input.goal.trim() || goalLabel}`;

  const orderedItems: PathMapOrderedItem[] = [
    {
      kind: 'goal',
      id: goalNodeId,
      label: goalLabel,
      ariaLabel: goalAria,
    },
  ];

  let videoCount = 0;
  for (const [stageIndex, stage] of cappedStages.entries()) {
    orderedItems.push({
      kind: 'stage',
      id: pathMapStageNodeId(stage.id),
      stageId: stage.id,
      position: stage.position,
      label: stage.title,
      ariaLabel: `Stage ${stageIndex + 1}: ${stage.title}${
        completed.has(stage.id) ? ', completed' : ''
      }`,
      completed: completed.has(stage.id),
      selected: selectedStageId === stage.id,
    });
    for (const video of stage.videos) {
      videoCount += 1;
      const practicedFlag = practiced.has(video.id);
      const selected = selectedPathVideoId === video.id;
      orderedItems.push({
        kind: 'video',
        id: pathMapVideoNodeId(video.id),
        pathVideoId: video.id,
        stageId: stage.id,
        youtubeVideoId: video.youtube_video_id,
        position: video.position,
        label: video.title,
        ariaLabel: `Video: ${video.title}${practicedFlag ? ', practiced' : ''}${
          selected ? ', selected' : ''
        }`,
        href: resolveVideoHref(video.youtube_video_id, input.pathId, video.id),
        practiced: practicedFlag,
        selected,
      });
    }
  }

  const layoutArgs = {
    goalNodeId,
    goalLabel,
    goalAria,
    orderedStages: cappedStages,
    practiced,
    completed,
    selectedPathVideoId,
    selectedStageId,
    pathId: input.pathId,
    buildVideoHref: resolveVideoHref,
  };

  const contentKey = cappedStages
    .map(
      (stage) =>
        `${stage.id}@${stage.position}:${stage.videos
          .map((video) => `${video.id}@${video.position}`)
          .join(',')}`
    )
    .join('|');

  return {
    contentKey: `${input.pathId}::${contentKey}`,
    goalNodeId,
    orderedItems,
    desktop: buildDesktopLayout(layoutArgs),
    mobile: buildMobileLayout(layoutArgs),
    stageCount: cappedStages.length,
    videoCount,
  };
}

/** Accessibility structure snapshot for tests (no React). */
export function pathPresentationA11yStructure(presentation: PathPresentation): {
  orderedListRole: 'list';
  itemCount: number;
  items: Array<{
    id: string;
    kind: PathMapNodeKind;
    ariaLabel: string;
    href?: string;
    tabIndexHint: 0 | -1;
  }>;
  mapHasConnectors: boolean;
  desktopNodeIds: string[];
  mobileNodeIds: string[];
} {
  return {
    orderedListRole: 'list',
    itemCount: presentation.orderedItems.length,
    items: presentation.orderedItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      ariaLabel: item.ariaLabel,
      href: item.kind === 'video' ? item.href : undefined,
      tabIndexHint: item.kind === 'video' ? 0 : -1,
    })),
    mapHasConnectors: presentation.desktop.connectors.length > 0,
    desktopNodeIds: presentation.desktop.nodes.map((node) => node.id),
    mobileNodeIds: presentation.mobile.nodes.map((node) => node.id),
  };
}
