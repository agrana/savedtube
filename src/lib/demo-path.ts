/**
 * Slice 5 — curated public demo fixture.
 *
 * One versioned, owner-free learning path for the landing page.
 * Uses the shared PathMap presentation contract. Never exposes personal
 * paths, jobs, progress, or private inputs.
 *
 * Topic: "Throw your first consistent darts" (replaceable curated sample).
 * YouTube IDs were verified public + oEmbed-reachable on 2026-09-26.
 */

import {
  buildPathPresentation,
  type BuildPathPresentationInput,
  type PathPresentation,
} from './path-map';
import type {
  PathStageWithVideos,
  PathVideoRecord,
} from './path-research-schema';
import { YOUTUBE_VIDEO_ID_REGEX } from './path-research-schema';
import type { PathWatchContext } from './path-links';

/** Bump when curated stages/videos change. */
export const DEMO_PATH_FIXTURE_VERSION = '1';

/** Well-known public path UUID — not a user-owned row. */
export const DEMO_PATH_ID = '00000000-0000-4000-8000-0000000000d1';

export const DEMO_PATH_REVISION_ID = '00000000-0000-4000-8000-0000000000d2';

export const DEMO_PATH_SLOGAN = 'Build your path to mastery.';

export const DEMO_PATH_GOAL = 'Throw your first consistent darts';

export const DEMO_PATH_TITLE = 'Throw your first consistent darts';

/** Landing hash used for shareable demo video selection without auth. */
export const DEMO_LANDING_VIDEO_HASH_PREFIX = 'demo-video-';

export type DemoVideoAvailability = 'available' | 'unavailable';

export type DemoVideoMetadataSnapshot = {
  source: 'curated' | 'oembed_refresh';
  checkedAt: string;
  title: string;
  authorName: string;
  providerName?: string;
};

export type DemoPathVideo = {
  id: string;
  stageId: string;
  position: number;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  selectionReason: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  verifiedAt: string;
  metadataSnapshot: DemoVideoMetadataSnapshot | null;
  availability: DemoVideoAvailability;
};

export type DemoPathStage = {
  id: string;
  position: number;
  title: string;
  learningObjective: string;
  reason: string;
  videos: DemoPathVideo[];
};

/**
 * Public fixture shape — deliberately omits owner, background, jobs, progress.
 */
export type DemoPathFixture = {
  version: string;
  pathId: string;
  revisionId: string;
  pathTitle: string;
  goal: string;
  slogan: string;
  stages: DemoPathStage[];
};

const VERIFIED_AT = '2026-09-26T12:00:00.000Z';

const DEMO_STAGE_STANCE = '00000000-0000-4000-8000-0000000000a1';
const DEMO_STAGE_GRIP = '00000000-0000-4000-8000-0000000000a2';
const DEMO_STAGE_THROW = '00000000-0000-4000-8000-0000000000a3';

const DEMO_VIDEO_STANCE_1 = '00000000-0000-4000-8000-0000000000b1';
const DEMO_VIDEO_STANCE_2 = '00000000-0000-4000-8000-0000000000b2';
const DEMO_VIDEO_GRIP_1 = '00000000-0000-4000-8000-0000000000b3';
const DEMO_VIDEO_THROW_1 = '00000000-0000-4000-8000-0000000000b4';

function curatedSnapshot(
  title: string,
  authorName: string
): DemoVideoMetadataSnapshot {
  return {
    source: 'curated',
    checkedAt: VERIFIED_AT,
    title,
    authorName,
    providerName: 'YouTube',
  };
}

/**
 * Canonical curated fixture. Order is intentional and must be preserved by refresh.
 */
export const DEMO_PATH_FIXTURE: DemoPathFixture = {
  version: DEMO_PATH_FIXTURE_VERSION,
  pathId: DEMO_PATH_ID,
  revisionId: DEMO_PATH_REVISION_ID,
  pathTitle: DEMO_PATH_TITLE,
  goal: DEMO_PATH_GOAL,
  slogan: DEMO_PATH_SLOGAN,
  stages: [
    {
      id: DEMO_STAGE_STANCE,
      position: 0,
      title: 'Set a stable stance',
      learningObjective:
        'Plant a balanced stance and posture so the throw starts from a quiet base.',
      reason:
        'Consistency begins with footwork and balance before the arm moves.',
      videos: [
        {
          id: DEMO_VIDEO_STANCE_1,
          stageId: DEMO_STAGE_STANCE,
          position: 0,
          youtubeVideoId: 'MhFgYKi62wk',
          title: 'How To Have A Good Stance and Posture?',
          channelTitle: 'DartCounter',
          selectionReason:
            'Clear beginner stance and posture cues for a first consistent throw.',
          durationSeconds: null,
          thumbnailUrl: 'https://i.ytimg.com/vi/MhFgYKi62wk/mqdefault.jpg',
          verifiedAt: VERIFIED_AT,
          metadataSnapshot: curatedSnapshot(
            'How To Have A Good Stance and Posture? | Darts Tips for Beginners #1',
            'DartCounter'
          ),
          availability: 'available',
        },
        {
          id: DEMO_VIDEO_STANCE_2,
          stageId: DEMO_STAGE_STANCE,
          position: 1,
          youtubeVideoId: '3w-xmN6s6YU',
          title: "Paul Nicholson's Darts School — The Stance",
          channelTitle: 'Professional Darts Corporation',
          selectionReason:
            'Pro coaching on a rooted stance without hopping or rocking.',
          durationSeconds: null,
          thumbnailUrl: 'https://i.ytimg.com/vi/3w-xmN6s6YU/mqdefault.jpg',
          verifiedAt: VERIFIED_AT,
          metadataSnapshot: curatedSnapshot(
            "Paul Nicholson's Darts School - EP1 -The Stance",
            'Professional Darts Corporation'
          ),
          availability: 'available',
        },
      ],
    },
    {
      id: DEMO_STAGE_GRIP,
      position: 1,
      title: 'Find a natural grip',
      learningObjective:
        'Hold the dart so it feels balanced and repeatable in the hand.',
      reason:
        'A comfortable grip keeps release timing from changing throw to throw.',
      videos: [
        {
          id: DEMO_VIDEO_GRIP_1,
          stageId: DEMO_STAGE_GRIP,
          position: 0,
          youtubeVideoId: 'W_dRFcpPqiM',
          title: 'How To Throw Darts',
          channelTitle: 'Videojug',
          selectionReason:
            'Short classic guide covering hold, stance line, and a simple throw.',
          durationSeconds: 124,
          thumbnailUrl: 'https://i.ytimg.com/vi/W_dRFcpPqiM/mqdefault.jpg',
          verifiedAt: VERIFIED_AT,
          metadataSnapshot: curatedSnapshot('How To Throw Darts', 'Videojug'),
          availability: 'available',
        },
      ],
    },
    {
      id: DEMO_STAGE_THROW,
      position: 2,
      title: 'Throw with follow-through',
      learningObjective:
        'Release with a straight arm path and a deliberate follow-through.',
      reason:
        'Follow-through locks in the release so early throws stay on line.',
      videos: [
        {
          id: DEMO_VIDEO_THROW_1,
          stageId: DEMO_STAGE_THROW,
          position: 0,
          youtubeVideoId: 'IY8tLgKBnoQ',
          title: 'How to throw a Dart',
          channelTitle: 'Professional Darts Corporation',
          selectionReason:
            'World-class fundamentals on arm path and follow-through for beginners.',
          durationSeconds: null,
          thumbnailUrl: 'https://i.ytimg.com/vi/IY8tLgKBnoQ/mqdefault.jpg',
          verifiedAt: VERIFIED_AT,
          metadataSnapshot: curatedSnapshot(
            'HOW TO PLAY DARTS! EP1 - How to throw a Dart',
            'Professional Darts Corporation'
          ),
          availability: 'available',
        },
      ],
    },
  ],
};

const FORBIDDEN_FIXTURE_KEYS = [
  'owner',
  'user_id',
  'userId',
  'background',
  'jobs',
  'progress',
  'idempotency_key',
  'idempotencyKey',
] as const;

export function isPublicDemoPathId(pathId: string | null | undefined): boolean {
  return typeof pathId === 'string' && pathId === DEMO_PATH_ID;
}

export function buildDemoLandingHref(pathVideoId: string): string {
  return `/#${DEMO_LANDING_VIDEO_HASH_PREFIX}${pathVideoId}`;
}

export function parseDemoLandingVideoHash(
  hash: string | null | undefined
): string | null {
  if (!hash) {
    return null;
  }
  let normalized = hash;
  const hashIndex = normalized.indexOf('#');
  if (hashIndex >= 0) {
    normalized = normalized.slice(hashIndex + 1);
  }
  if (!normalized.startsWith(DEMO_LANDING_VIDEO_HASH_PREFIX)) {
    return null;
  }
  const pathVideoId = normalized.slice(DEMO_LANDING_VIDEO_HASH_PREFIX.length);
  return pathVideoId.length > 0 ? pathVideoId : null;
}

export function getDemoPathFixture(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): DemoPathFixture {
  return fixture;
}

/** Flatten videos in stage/position order. */
export function flattenDemoVideos(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): DemoPathVideo[] {
  return fixture.stages
    .slice()
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
    .flatMap((stage) =>
      stage.videos
        .slice()
        .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
    );
}

export function getPlayableDemoVideos(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): DemoPathVideo[] {
  return flattenDemoVideos(fixture).filter(
    (video) =>
      video.availability === 'available' &&
      YOUTUBE_VIDEO_ID_REGEX.test(video.youtubeVideoId)
  );
}

export function findDemoVideo(
  pathVideoId: string,
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): DemoPathVideo | null {
  return (
    flattenDemoVideos(fixture).find((video) => video.id === pathVideoId) ?? null
  );
}

export function markDemoVideoUnavailable(
  fixture: DemoPathFixture,
  pathVideoId: string
): DemoPathFixture {
  return {
    ...fixture,
    stages: fixture.stages.map((stage) => ({
      ...stage,
      videos: stage.videos.map((video) =>
        video.id === pathVideoId
          ? { ...video, availability: 'unavailable' as const }
          : video
      ),
    })),
  };
}

/**
 * Delete lifecycle for stored YouTube API / oEmbed excerpts.
 * Clears metadata snapshots while preserving curated order and IDs.
 */
export function clearDemoMetadataSnapshots(
  fixture: DemoPathFixture
): DemoPathFixture {
  return {
    ...fixture,
    stages: fixture.stages.map((stage) => ({
      ...stage,
      videos: stage.videos.map((video) => ({
        ...video,
        metadataSnapshot: null,
      })),
    })),
  };
}

type OEmbedResponse = {
  title?: string;
  author_name?: string;
  provider_name?: string;
};

/**
 * Refresh one demo video via public oEmbed (no OAuth, no private path access).
 * Preserves position; marks unavailable when oEmbed fails.
 */
export async function refreshDemoVideoMetadata(
  video: DemoPathVideo,
  options: {
    fetchImpl?: typeof fetch;
    now?: Date;
    signal?: AbortSignal;
  } = {}
): Promise<DemoPathVideo> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();

  if (!YOUTUBE_VIDEO_ID_REGEX.test(video.youtubeVideoId)) {
    return { ...video, availability: 'unavailable', verifiedAt: checkedAt };
  }

  const url = new URL('https://www.youtube.com/oembed');
  url.searchParams.set(
    'url',
    `https://www.youtube.com/watch?v=${video.youtubeVideoId}`
  );
  url.searchParams.set('format', 'json');

  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      signal: options.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return {
        ...video,
        availability: 'unavailable',
        verifiedAt: checkedAt,
      };
    }

    const data = (await response.json()) as OEmbedResponse;
    const title = data.title?.trim();
    const authorName = data.author_name?.trim();
    if (!title || !authorName) {
      return {
        ...video,
        availability: 'unavailable',
        verifiedAt: checkedAt,
      };
    }

    return {
      ...video,
      title: title.slice(0, 300),
      channelTitle: authorName.slice(0, 200),
      verifiedAt: checkedAt,
      availability: 'available',
      metadataSnapshot: {
        source: 'oembed_refresh',
        checkedAt,
        title: title.slice(0, 300),
        authorName: authorName.slice(0, 200),
        providerName: data.provider_name?.trim() || 'YouTube',
      },
    };
  } catch {
    return {
      ...video,
      availability: 'unavailable',
      verifiedAt: checkedAt,
    };
  }
}

/**
 * Refresh all demo videos. Order of stages/videos is unchanged.
 */
export async function refreshDemoPathMetadata(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE,
  options: {
    fetchImpl?: typeof fetch;
    now?: Date;
    signal?: AbortSignal;
  } = {}
): Promise<DemoPathFixture> {
  const stages: DemoPathStage[] = [];
  for (const stage of fixture.stages) {
    const videos: DemoPathVideo[] = [];
    for (const video of stage.videos) {
      videos.push(await refreshDemoVideoMetadata(video, options));
    }
    stages.push({ ...stage, videos });
  }
  return { ...fixture, stages };
}

function toPathVideoRecord(video: DemoPathVideo): PathVideoRecord {
  return {
    id: video.id,
    stage_id: video.stageId,
    position: video.position,
    youtube_video_id: video.youtubeVideoId,
    title: video.title,
    channel_title: video.channelTitle,
    selection_reason: video.selectionReason,
    source: 'manual',
    duration_seconds: video.durationSeconds,
    thumbnail_url: video.thumbnailUrl,
    verified_at: video.verifiedAt,
    metadata_snapshot: video.metadataSnapshot,
    created_at: video.verifiedAt,
    updated_at: video.verifiedAt,
  };
}

/**
 * Convert fixture stages for PathMap. Unavailable videos are omitted so
 * visitors are not sent to broken embeds; stage shells remain for context.
 */
export function toDemoPresentationStages(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): PathStageWithVideos[] {
  return fixture.stages.map((stage) => ({
    id: stage.id,
    revision_id: fixture.revisionId,
    position: stage.position,
    title: stage.title,
    learning_objective: stage.learningObjective,
    reason: stage.reason,
    created_at: VERIFIED_AT,
    updated_at: VERIFIED_AT,
    videos: stage.videos
      .filter((video) => video.availability === 'available')
      .map(toPathVideoRecord),
  }));
}

export function buildDemoPathPresentationInput(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE,
  options: {
    selectedPathVideoId?: string | null;
    selectedStageId?: string | null;
  } = {}
): BuildPathPresentationInput {
  return {
    pathId: fixture.pathId,
    pathTitle: fixture.pathTitle,
    goal: fixture.goal,
    stages: toDemoPresentationStages(fixture),
    practicedVideoIds: [],
    completedStageIds: [],
    selectedPathVideoId: options.selectedPathVideoId ?? null,
    selectedStageId: options.selectedStageId ?? null,
  };
}

export function buildDemoPathPresentation(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE,
  options: {
    selectedPathVideoId?: string | null;
    selectedStageId?: string | null;
    /** When true, video hrefs stay on the public landing instead of /watch. */
    useLandingHrefs?: boolean;
  } = {}
): PathPresentation {
  return buildPathPresentation({
    ...buildDemoPathPresentationInput(fixture, options),
    buildVideoHref: options.useLandingHrefs
      ? (_youtubeVideoId, _pathId, pathVideoId) =>
          buildDemoLandingHref(pathVideoId)
      : undefined,
  });
}

export function resolveInitialDemoVideo(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE,
  preferredPathVideoId?: string | null
): DemoPathVideo | null {
  const playable = getPlayableDemoVideos(fixture);
  if (playable.length === 0) {
    return null;
  }
  if (preferredPathVideoId) {
    const preferred = playable.find(
      (video) => video.id === preferredPathVideoId
    );
    if (preferred) {
      return preferred;
    }
  }
  return playable[0] ?? null;
}

export function adjacentDemoVideo(
  fixture: DemoPathFixture,
  pathVideoId: string,
  direction: 'previous' | 'next'
): DemoPathVideo | null {
  const playable = getPlayableDemoVideos(fixture);
  const index = playable.findIndex((video) => video.id === pathVideoId);
  if (index < 0) {
    return null;
  }
  if (direction === 'previous') {
    return index > 0 ? playable[index - 1] : null;
  }
  return index < playable.length - 1 ? playable[index + 1] : null;
}

/**
 * Optional watch-context for the public demo path only.
 * returnHref sends visitors back to the landing demo, not a private path page.
 */
export function loadDemoWatchContext(
  pathVideoId: string,
  routeVideoId: string,
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): PathWatchContext | null {
  if (!isPublicDemoPathId(fixture.pathId)) {
    return null;
  }

  const flat = getPlayableDemoVideos(fixture);
  const index = flat.findIndex((video) => video.id === pathVideoId);
  if (index < 0) {
    return null;
  }

  const video = flat[index];
  if (video.youtubeVideoId !== routeVideoId) {
    return null;
  }

  const stage = fixture.stages.find((item) => item.id === video.stageId);
  if (!stage) {
    return null;
  }

  const previous = index > 0 ? flat[index - 1] : null;
  const next = index < flat.length - 1 ? flat[index + 1] : null;

  return {
    pathId: fixture.pathId,
    pathTitle: fixture.pathTitle,
    pathVideoId: video.id,
    youtubeVideoId: video.youtubeVideoId,
    title: video.title,
    channelTitle: video.channelTitle,
    stageId: stage.id,
    stageTitle: stage.title,
    practiced: false,
    position: index,
    total: flat.length,
    previous: previous
      ? {
          pathVideoId: previous.id,
          youtubeVideoId: previous.youtubeVideoId,
        }
      : null,
    next: next
      ? {
          pathVideoId: next.id,
          youtubeVideoId: next.youtubeVideoId,
        }
      : null,
    returnHref: buildDemoLandingHref(video.id),
  };
}

/**
 * Fixture safety: no owner/user IDs, private inputs, jobs, or progress.
 * Throws AssertionError-style Error when violated (used by tests and boot checks).
 */
export function assertDemoFixtureSafety(
  fixture: DemoPathFixture = DEMO_PATH_FIXTURE
): void {
  const serialized = JSON.stringify(fixture);
  for (const key of FORBIDDEN_FIXTURE_KEYS) {
    if (new RegExp(`"${key}"\\s*:`).test(serialized)) {
      throw new Error(`Demo fixture must not include "${key}"`);
    }
  }

  if (fixture.version !== DEMO_PATH_FIXTURE_VERSION) {
    throw new Error('Demo fixture version mismatch');
  }
  if (fixture.pathId !== DEMO_PATH_ID) {
    throw new Error('Demo fixture pathId must be the public demo id');
  }
  if (!fixture.slogan.trim() || !fixture.goal.trim()) {
    throw new Error('Demo fixture requires slogan and goal');
  }
  if (fixture.stages.length < 1) {
    throw new Error('Demo fixture requires at least one stage');
  }

  for (const stage of fixture.stages) {
    for (const video of stage.videos) {
      if (!YOUTUBE_VIDEO_ID_REGEX.test(video.youtubeVideoId)) {
        throw new Error(`Invalid demo YouTube id: ${video.youtubeVideoId}`);
      }
      if (video.stageId !== stage.id) {
        throw new Error(`Demo video ${video.id} stage mismatch`);
      }
    }
  }
}
