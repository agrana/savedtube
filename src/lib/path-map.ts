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

/**
 * Fixed geometry (px) for the sequential lesson spine.
 * Desktop: left-to-right lessons with compact stage headings.
 * Mobile: top-to-bottom lessons within portrait width (~390px).
 */
export const PATH_MAP_GOAL_WIDTH = 240;
export const PATH_MAP_GOAL_HEIGHT = 48;
/** Compact stage heading height — stages are groupings, not large cards. */
export const PATH_MAP_STAGE_HEIGHT = 32;
/** Minimum stage-heading width when a stage has no lessons yet. */
export const PATH_MAP_STAGE_MIN_WIDTH = 120;
/** Desktop lesson node size — lessons carry visual prominence. */
export const PATH_MAP_VIDEO_WIDTH = 176;
export const PATH_MAP_VIDEO_HEIGHT = 80;
/** Mobile lesson column width; canvas fits a 390px portrait content box with page + map padding. */
export const PATH_MAP_MOBILE_VIDEO_WIDTH = 286;
/** Gap between lessons inside a stage (desktop). */
export const PATH_MAP_GAP_X = 16;
/** Gap between stage groups (desktop). */
export const PATH_MAP_STAGE_GROUP_GAP = 28;
/** Vertical gap: stage heading → lessons, and between mobile lesson rows. */
export const PATH_MAP_GAP_Y = 12;
export const PATH_MAP_PADDING = 20;
export const PATH_MAP_CONNECTOR_STROKE = 1.5;
/** @deprecated Alias for tests that still name stage column width; equals desktop lesson width. */
export const PATH_MAP_STAGE_WIDTH = PATH_MAP_VIDEO_WIDTH;

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
  /** Continuous directional spine between consecutive lessons. */
  kind: 'lesson-to-lesson';
};

/** Subtle background grouping behind a stage's heading + lessons. */
export type PathMapStageBand = {
  id: string;
  stageId: string;
  rect: PathMapRect;
  isCurrent: boolean;
  completed: boolean;
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
  objective: string;
  ariaLabel: string;
  completed: boolean;
  selected: boolean;
  /** Stage that holds the recommended-next lesson (guidance, not lock). */
  isCurrent: boolean;
  practicedCount: number;
  lessonCount: number;
  detailsId: string;
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
  /** Natural YouTube end on this lesson — independent of practiced/mastery. */
  watchedCompleted: boolean;
  selected: boolean;
  /** Explicit recommended-next lesson derived from practicedVideoIds only. */
  recommended: boolean;
  rect: PathMapRect;
};

export type PathMapNode = PathMapGoalNode | PathMapStageNode | PathMapVideoNode;

export type PathMapStagePrimaryAction = {
  kind: 'start' | 'continue';
  pathVideoId: string;
  youtubeVideoId: string;
  href: string;
  label: string;
};

export type PathMapStageLesson = {
  pathVideoId: string;
  youtubeVideoId: string;
  position: number;
  label: string;
  channelTitle: string | null;
  href: string;
  practiced: boolean;
  watchedCompleted: boolean;
  selected: boolean;
  recommended: boolean;
  nodeId: string;
  ariaLabel: string;
};

export type PathMapStageSummary = {
  stageId: string;
  position: number;
  label: string;
  objective: string;
  nodeId: string;
  detailsId: string;
  practicedCount: number;
  lessonCount: number;
  completed: boolean;
  selected: boolean;
  isCurrent: boolean;
  lessons: PathMapStageLesson[];
  primaryAction: PathMapStagePrimaryAction | null;
};

export type PathMapRecommendedNext = {
  pathVideoId: string;
  youtubeVideoId: string;
  stageId: string;
  href: string;
  label: string;
  nodeId: string;
};

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
      objective: string;
      ariaLabel: string;
      completed: boolean;
      selected: boolean;
      isCurrent: boolean;
      practicedCount: number;
      lessonCount: number;
      detailsId: string;
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
      watchedCompleted: boolean;
      selected: boolean;
      recommended: boolean;
    };

export type PathMapLayout = {
  width: number;
  height: number;
  nodes: PathMapNode[];
  connectors: PathMapConnector[];
  /** Soft stage groupings drawn behind the lesson spine. */
  bands: PathMapStageBand[];
};

export type PathPresentation = {
  /** Stable revision fingerprint for reload equality checks. */
  contentKey: string;
  goalNodeId: string;
  /** Quiet path-title label for the map heading (not a canvas node). */
  goalLabel: string;
  /** Goal/context copy shown as the quiet map heading. */
  goalContext: string;
  goalAriaLabel: string;
  orderedItems: PathMapOrderedItem[];
  /** Per-stage expansion payloads in presentation order. */
  stages: PathMapStageSummary[];
  /** First unpracticed lesson in order, or null when none remain. */
  recommendedNext: PathMapRecommendedNext | null;
  currentStageId: string | null;
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
  /** Device-local watched-to-end ids — never conflated with practiced. */
  watchedCompletedVideoIds?: ReadonlyArray<string> | ReadonlySet<string>;
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

/** Stable id for the stage expansion region (aria-controls target). */
export function pathMapStageDetailsId(stageId: string): string {
  return `path-map-stage-details-${stageId}`;
}

export type PathMapLayoutVariant = 'desktop' | 'mobile';

/** DOM id for a map node in a layout variant (avoids desktop/mobile duplicates). */
export function pathMapLayoutDomId(
  variant: PathMapLayoutVariant,
  nodeId: string
): string {
  return `${variant}-${nodeId}`;
}

export type ResolvePathMapExpandedStageIdInput = {
  availableStageIds: readonly string[];
  selectedStageId?: string | null;
  currentStageId?: string | null;
  /** Prior expanded stage, or null when the learner collapsed all stages. */
  previousExpandedStageId?: string | null;
  /** Path structure/content fingerprint changed (revision, dismiss/restore, etc.). */
  pathChanged?: boolean;
  /** External selected stage changed (continue target, demo lesson pick). */
  selectionChanged?: boolean;
};

/**
 * One stage expanded at a time. Keeps learner open/close choices when still
 * valid; reseeds from selected → current → first when the path or selection
 * context requires it.
 */
export function resolvePathMapExpandedStageId(
  input: ResolvePathMapExpandedStageIdInput
): string | null {
  const available = input.availableStageIds;
  if (available.length === 0) {
    return null;
  }
  const availableSet = new Set(available);
  const pickPreferred = (): string | null => {
    if (input.selectedStageId && availableSet.has(input.selectedStageId)) {
      return input.selectedStageId;
    }
    if (input.currentStageId && availableSet.has(input.currentStageId)) {
      return input.currentStageId;
    }
    return available[0] ?? null;
  };

  if (input.pathChanged) {
    return pickPreferred();
  }

  if (
    input.selectionChanged &&
    input.selectedStageId &&
    availableSet.has(input.selectedStageId)
  ) {
    return input.selectedStageId;
  }

  const previous = input.previousExpandedStageId;
  if (previous === null) {
    return null;
  }
  if (typeof previous === 'string' && availableSet.has(previous)) {
    return previous;
  }
  return pickPreferred();
}

/**
 * Recommended next lesson: first unpracticed video in stored order.
 * Derived only from practicedVideoIds — never from playback.
 */
export function resolveRecommendedNextLesson(
  orderedStages: PathStageWithVideos[],
  practiced: ReadonlySet<string>,
  pathId: string,
  buildVideoHref: BuildPathVideoHref
): PathMapRecommendedNext | null {
  for (const stage of orderedStages) {
    for (const video of stage.videos) {
      if (!practiced.has(video.id)) {
        return {
          pathVideoId: video.id,
          youtubeVideoId: video.youtube_video_id,
          stageId: stage.id,
          href: buildVideoHref(video.youtube_video_id, pathId, video.id),
          label: video.title,
          nodeId: pathMapVideoNodeId(video.id),
        };
      }
    }
  }
  return null;
}

function stageAriaLabel(
  stageIndex: number,
  title: string,
  completed: boolean,
  isCurrent: boolean
): string {
  const parts = [`Stage ${stageIndex + 1}: ${title}`];
  if (isCurrent) {
    parts.push('current');
  }
  if (completed) {
    parts.push('completed');
  }
  return parts.join(', ');
}

function videoAriaLabel(
  title: string,
  practicedFlag: boolean,
  watchedCompleted: boolean,
  selected: boolean,
  recommended: boolean
): string {
  const parts = [`Video: ${title}`];
  if (recommended) {
    parts.push('recommended next');
  }
  if (watchedCompleted) {
    parts.push('finished');
  }
  if (practicedFlag) {
    parts.push('practiced');
  }
  if (selected) {
    parts.push('selected');
  }
  return parts.join(', ');
}

function buildStagePrimaryAction(
  lessons: PathMapStageLesson[],
  practicedCount: number,
  recommendedNext: PathMapRecommendedNext | null,
  stageId: string
): PathMapStagePrimaryAction | null {
  if (lessons.length === 0) {
    return null;
  }
  const recommendedInStage =
    recommendedNext && recommendedNext.stageId === stageId
      ? lessons.find(
          (lesson) => lesson.pathVideoId === recommendedNext.pathVideoId
        )
      : null;
  const firstUnpracticed = lessons.find((lesson) => !lesson.practiced);
  const target = recommendedInStage || firstUnpracticed || lessons[0];
  const kind: 'start' | 'continue' =
    practicedCount === 0 ? 'start' : 'continue';
  return {
    kind,
    pathVideoId: target.pathVideoId,
    youtubeVideoId: target.youtubeVideoId,
    href: target.href,
    label: kind === 'start' ? 'Start' : 'Continue',
  };
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

type LessonSpineLayoutArgs = {
  orderedStages: PathStageWithVideos[];
  practiced: Set<string>;
  watchedCompleted: Set<string>;
  completed: Set<string>;
  selectedPathVideoId: string | null;
  selectedStageId: string | null;
  currentStageId: string | null;
  recommendedPathVideoId: string | null;
  pathId: string;
  buildVideoHref: BuildPathVideoHref;
};

function buildStageNode(
  stage: PathStageWithVideos,
  stageIndex: number,
  rect: PathMapRect,
  args: LessonSpineLayoutArgs
): PathMapStageNode {
  const practicedCount = stage.videos.filter((video) =>
    args.practiced.has(video.id)
  ).length;
  const isCurrent = args.currentStageId === stage.id;
  const stageCompleted = args.completed.has(stage.id);
  return {
    kind: 'stage',
    id: pathMapStageNodeId(stage.id),
    stageId: stage.id,
    position: stage.position,
    label: stage.title,
    subtitle: stage.learning_objective,
    objective: stage.learning_objective,
    ariaLabel: stageAriaLabel(
      stageIndex,
      stage.title,
      stageCompleted,
      isCurrent
    ),
    completed: stageCompleted,
    selected: args.selectedStageId === stage.id,
    isCurrent,
    practicedCount,
    lessonCount: stage.videos.length,
    detailsId: pathMapStageDetailsId(stage.id),
    rect,
  };
}

function buildVideoNode(
  video: PathStageWithVideos['videos'][number],
  rect: PathMapRect,
  args: LessonSpineLayoutArgs
): PathMapVideoNode {
  const practicedFlag = args.practiced.has(video.id);
  const watchedCompletedFlag = args.watchedCompleted.has(video.id);
  const selected = args.selectedPathVideoId === video.id;
  const recommended = args.recommendedPathVideoId === video.id;
  return {
    kind: 'video',
    id: pathMapVideoNodeId(video.id),
    pathVideoId: video.id,
    stageId: video.stage_id,
    youtubeVideoId: video.youtube_video_id,
    position: video.position,
    label: video.title,
    channelTitle: video.channel_title,
    ariaLabel: videoAriaLabel(
      video.title,
      practicedFlag,
      watchedCompletedFlag,
      selected,
      recommended
    ),
    href: args.buildVideoHref(video.youtube_video_id, args.pathId, video.id),
    practiced: practicedFlag,
    watchedCompleted: watchedCompletedFlag,
    selected,
    recommended,
    rect,
  };
}

function pushLessonSpineConnector(
  connectors: PathMapConnector[],
  previous: PathMapVideoNode | null,
  next: PathMapVideoNode,
  orientation: 'horizontal' | 'vertical'
): PathMapVideoNode {
  if (previous) {
    const from =
      orientation === 'horizontal'
        ? rightCenter(previous.rect)
        : bottomCenter(previous.rect);
    const to =
      orientation === 'horizontal'
        ? leftCenter(next.rect)
        : topCenter(next.rect);
    connectors.push({
      id: `connector-lesson-${previous.pathVideoId}-${next.pathVideoId}`,
      fromNodeId: previous.id,
      toNodeId: next.id,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      kind: 'lesson-to-lesson',
    });
  }
  return next;
}

/**
 * Desktop: left-to-right sequential lesson spine with compact stage headings.
 * Goal is a quiet heading outside the canvas — no fan-out tree.
 */
function buildDesktopLayout(args: LessonSpineLayoutArgs): PathMapLayout {
  const { orderedStages } = args;
  const nodes: PathMapNode[] = [];
  const connectors: PathMapConnector[] = [];
  const bands: PathMapStageBand[] = [];

  if (orderedStages.length === 0) {
    return {
      width: PATH_MAP_PADDING * 2 + PATH_MAP_STAGE_MIN_WIDTH,
      height: PATH_MAP_PADDING * 2,
      nodes,
      connectors,
      bands,
    };
  }

  const stageY = PATH_MAP_PADDING;
  const lessonY = stageY + PATH_MAP_STAGE_HEIGHT + PATH_MAP_GAP_Y;
  const bandPad = 8;
  let cursorX = PATH_MAP_PADDING;
  let previousLesson: PathMapVideoNode | null = null;

  orderedStages.forEach((stage, stageIndex) => {
    const lessonCount = stage.videos.length;
    const groupWidth =
      lessonCount === 0
        ? PATH_MAP_STAGE_MIN_WIDTH
        : lessonCount * PATH_MAP_VIDEO_WIDTH +
          Math.max(0, lessonCount - 1) * PATH_MAP_GAP_X;

    const stageRect: PathMapRect = {
      x: cursorX,
      y: stageY,
      width: groupWidth,
      height: PATH_MAP_STAGE_HEIGHT,
    };
    nodes.push(buildStageNode(stage, stageIndex, stageRect, args));

    const bandHeight =
      PATH_MAP_STAGE_HEIGHT +
      PATH_MAP_GAP_Y +
      (lessonCount > 0 ? PATH_MAP_VIDEO_HEIGHT : 0);
    bands.push({
      id: `band-${stage.id}`,
      stageId: stage.id,
      rect: {
        x: cursorX - bandPad / 2,
        y: stageY - bandPad / 2,
        width: groupWidth + bandPad,
        height: bandHeight + bandPad,
      },
      isCurrent: args.currentStageId === stage.id,
      completed: args.completed.has(stage.id),
    });

    stage.videos.forEach((video, videoIndex) => {
      const videoRect: PathMapRect = {
        x: cursorX + videoIndex * (PATH_MAP_VIDEO_WIDTH + PATH_MAP_GAP_X),
        y: lessonY,
        width: PATH_MAP_VIDEO_WIDTH,
        height: PATH_MAP_VIDEO_HEIGHT,
      };
      const videoNode = buildVideoNode(video, videoRect, args);
      nodes.push(videoNode);
      previousLesson = pushLessonSpineConnector(
        connectors,
        previousLesson,
        videoNode,
        'horizontal'
      );
    });

    cursorX += groupWidth + PATH_MAP_STAGE_GROUP_GAP;
  });

  const width = cursorX - PATH_MAP_STAGE_GROUP_GAP + PATH_MAP_PADDING;
  const height =
    PATH_MAP_PADDING * 2 +
    PATH_MAP_STAGE_HEIGHT +
    PATH_MAP_GAP_Y +
    PATH_MAP_VIDEO_HEIGHT;

  return { width, height, nodes, connectors, bands };
}

/**
 * Mobile: top-to-bottom sequential lesson spine within portrait width.
 */
function buildMobileLayout(args: LessonSpineLayoutArgs): PathMapLayout {
  const { orderedStages } = args;
  const lessonWidth = PATH_MAP_MOBILE_VIDEO_WIDTH;
  const width = PATH_MAP_PADDING * 2 + lessonWidth;
  const nodes: PathMapNode[] = [];
  const connectors: PathMapConnector[] = [];
  const bands: PathMapStageBand[] = [];
  const bandPad = 8;
  let cursorY = PATH_MAP_PADDING;
  let previousLesson: PathMapVideoNode | null = null;

  if (orderedStages.length === 0) {
    return {
      width,
      height: PATH_MAP_PADDING * 2,
      nodes,
      connectors,
      bands,
    };
  }

  orderedStages.forEach((stage, stageIndex) => {
    const stageStartY = cursorY;
    const stageRect: PathMapRect = {
      x: PATH_MAP_PADDING,
      y: cursorY,
      width: lessonWidth,
      height: PATH_MAP_STAGE_HEIGHT,
    };
    nodes.push(buildStageNode(stage, stageIndex, stageRect, args));
    cursorY += PATH_MAP_STAGE_HEIGHT + PATH_MAP_GAP_Y;

    stage.videos.forEach((video) => {
      const videoRect: PathMapRect = {
        x: PATH_MAP_PADDING,
        y: cursorY,
        width: lessonWidth,
        height: PATH_MAP_VIDEO_HEIGHT,
      };
      const videoNode = buildVideoNode(video, videoRect, args);
      nodes.push(videoNode);
      previousLesson = pushLessonSpineConnector(
        connectors,
        previousLesson,
        videoNode,
        'vertical'
      );
      cursorY += PATH_MAP_VIDEO_HEIGHT + PATH_MAP_GAP_Y;
    });

    const bandBottom = cursorY - PATH_MAP_GAP_Y;
    bands.push({
      id: `band-${stage.id}`,
      stageId: stage.id,
      rect: {
        x: PATH_MAP_PADDING - bandPad / 2,
        y: stageStartY - bandPad / 2,
        width: lessonWidth + bandPad,
        height: bandBottom - stageStartY + bandPad,
      },
      isCurrent: args.currentStageId === stage.id,
      completed: args.completed.has(stage.id),
    });

    cursorY += PATH_MAP_STAGE_GROUP_GAP - PATH_MAP_GAP_Y;
  });

  const height = Math.max(
    cursorY - PATH_MAP_STAGE_GROUP_GAP + PATH_MAP_PADDING + PATH_MAP_GAP_Y,
    PATH_MAP_PADDING * 2
  );

  return { width, height, nodes, connectors, bands };
}

/**
 * Build the shared map + ordered-list presentation from stored path data.
 * Pure and deterministic for a given input.
 */
export function buildPathPresentation(
  input: BuildPathPresentationInput
): PathPresentation {
  const practiced = toIdSet(input.practicedVideoIds);
  const watchedCompleted = toIdSet(input.watchedCompletedVideoIds);
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
  const goalContext = input.goal.trim() || goalLabel;
  const goalAriaLabel = `Path goal: ${goalContext}`;

  const recommendedNext = resolveRecommendedNextLesson(
    cappedStages,
    practiced,
    input.pathId,
    resolveVideoHref
  );
  const currentStageId = recommendedNext?.stageId ?? null;
  const recommendedPathVideoId = recommendedNext?.pathVideoId ?? null;

  const stages: PathMapStageSummary[] = cappedStages.map((stage) => {
    const lessons: PathMapStageLesson[] = stage.videos.map((video) => {
      const practicedFlag = practiced.has(video.id);
      const watchedCompletedFlag = watchedCompleted.has(video.id);
      const selected = selectedPathVideoId === video.id;
      const recommended = recommendedPathVideoId === video.id;
      return {
        pathVideoId: video.id,
        youtubeVideoId: video.youtube_video_id,
        position: video.position,
        label: video.title,
        channelTitle: video.channel_title,
        href: resolveVideoHref(video.youtube_video_id, input.pathId, video.id),
        practiced: practicedFlag,
        watchedCompleted: watchedCompletedFlag,
        selected,
        recommended,
        nodeId: pathMapVideoNodeId(video.id),
        ariaLabel: videoAriaLabel(
          video.title,
          practicedFlag,
          watchedCompletedFlag,
          selected,
          recommended
        ),
      };
    });
    const practicedCount = lessons.filter((lesson) => lesson.practiced).length;
    const isCurrent = currentStageId === stage.id;
    const stageCompleted = completed.has(stage.id);
    return {
      stageId: stage.id,
      position: stage.position,
      label: stage.title,
      objective: stage.learning_objective,
      nodeId: pathMapStageNodeId(stage.id),
      detailsId: pathMapStageDetailsId(stage.id),
      practicedCount,
      lessonCount: lessons.length,
      completed: stageCompleted,
      selected: selectedStageId === stage.id,
      isCurrent,
      lessons,
      primaryAction: buildStagePrimaryAction(
        lessons,
        practicedCount,
        recommendedNext,
        stage.id
      ),
    };
  });

  const orderedItems: PathMapOrderedItem[] = [
    {
      kind: 'goal',
      id: goalNodeId,
      label: goalLabel,
      ariaLabel: goalAriaLabel,
    },
  ];

  let videoCount = 0;
  for (const [stageIndex, stage] of cappedStages.entries()) {
    const summary = stages[stageIndex];
    orderedItems.push({
      kind: 'stage',
      id: summary.nodeId,
      stageId: stage.id,
      position: stage.position,
      label: stage.title,
      objective: stage.learning_objective,
      ariaLabel: stageAriaLabel(
        stageIndex,
        stage.title,
        summary.completed,
        summary.isCurrent
      ),
      completed: summary.completed,
      selected: summary.selected,
      isCurrent: summary.isCurrent,
      practicedCount: summary.practicedCount,
      lessonCount: summary.lessonCount,
      detailsId: summary.detailsId,
    });
    for (const lesson of summary.lessons) {
      videoCount += 1;
      orderedItems.push({
        kind: 'video',
        id: lesson.nodeId,
        pathVideoId: lesson.pathVideoId,
        stageId: stage.id,
        youtubeVideoId: lesson.youtubeVideoId,
        position: lesson.position,
        label: lesson.label,
        ariaLabel: lesson.ariaLabel,
        href: lesson.href,
        practiced: lesson.practiced,
        watchedCompleted: lesson.watchedCompleted,
        selected: lesson.selected,
        recommended: lesson.recommended,
      });
    }
  }

  const layoutArgs: LessonSpineLayoutArgs = {
    orderedStages: cappedStages,
    practiced,
    watchedCompleted,
    completed,
    selectedPathVideoId,
    selectedStageId,
    currentStageId,
    recommendedPathVideoId,
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
    goalLabel,
    goalContext,
    goalAriaLabel,
    orderedItems,
    stages,
    recommendedNext,
    currentStageId,
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
    detailsId?: string;
    tabIndexHint: 0 | -1;
  }>;
  stageDetailsIds: string[];
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
      detailsId: item.kind === 'stage' ? item.detailsId : undefined,
      tabIndexHint: item.kind === 'goal' ? -1 : 0,
    })),
    stageDetailsIds: presentation.stages.map((stage) => stage.detailsId),
    mapHasConnectors: presentation.desktop.connectors.length > 0,
    desktopNodeIds: presentation.desktop.nodes.map((node) => node.id),
    mobileNodeIds: presentation.mobile.nodes.map((node) => node.id),
  };
}
