import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEMO_PATH_FIXTURE,
  DEMO_PATH_FIXTURE_VERSION,
  DEMO_PATH_GOAL,
  DEMO_PATH_ID,
  DEMO_PATH_SLOGAN,
  adjacentDemoVideo,
  assertDemoFixtureSafety,
  buildDemoLandingHref,
  buildDemoPathPresentation,
  clearDemoMetadataSnapshots,
  flattenDemoVideos,
  getPlayableDemoVideos,
  isPublicDemoPathId,
  loadDemoWatchContext,
  markDemoVideoUnavailable,
  parseDemoLandingVideoHash,
  refreshDemoPathMetadata,
  refreshDemoVideoMetadata,
  resolveInitialDemoVideo,
  toDemoPresentationStages,
} from './demo-path.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('demo fixture safety', () => {
  it('contains no owner IDs, private inputs, jobs, or progress', () => {
    assert.doesNotThrow(() => assertDemoFixtureSafety(DEMO_PATH_FIXTURE));

    const serialized = JSON.stringify(DEMO_PATH_FIXTURE);
    for (const key of [
      'owner',
      'user_id',
      'userId',
      'background',
      'jobs',
      'progress',
      'idempotency_key',
      'idempotencyKey',
    ]) {
      assert.equal(
        new RegExp(`"${key}"\\s*:`).test(serialized),
        false,
        `fixture must not include ${key}`
      );
    }

    assert.equal(DEMO_PATH_FIXTURE.version, DEMO_PATH_FIXTURE_VERSION);
    assert.equal(DEMO_PATH_FIXTURE.pathId, DEMO_PATH_ID);
    assert.equal(DEMO_PATH_FIXTURE.goal, DEMO_PATH_GOAL);
    assert.equal(DEMO_PATH_FIXTURE.slogan, DEMO_PATH_SLOGAN);
    assert.ok(DEMO_PATH_FIXTURE.stages.length >= 1);
    assert.ok(flattenDemoVideos(DEMO_PATH_FIXTURE).length >= 1);
  });

  it('uses only verified-format public YouTube video IDs', () => {
    for (const video of flattenDemoVideos(DEMO_PATH_FIXTURE)) {
      assert.match(video.youtubeVideoId, /^[a-zA-Z0-9_-]{11}$/);
      assert.equal(video.availability, 'available');
      assert.ok(video.verifiedAt);
      assert.ok(video.metadataSnapshot);
    }
  });

  it('rejects a fixture that introduces an owner field', () => {
    const tainted = JSON.parse(
      JSON.stringify({
        ...DEMO_PATH_FIXTURE,
        owner: 'user-should-not-appear',
      })
    ) as typeof DEMO_PATH_FIXTURE;
    assert.throws(() => assertDemoFixtureSafety(tainted));
  });
});

describe('deterministic shared presentation', () => {
  it('builds the same presentation for the same curated fixture', () => {
    const first = buildDemoPathPresentation(DEMO_PATH_FIXTURE, {
      useLandingHrefs: true,
    });
    const second = buildDemoPathPresentation(DEMO_PATH_FIXTURE, {
      useLandingHrefs: true,
    });

    assert.equal(first.contentKey, second.contentKey);
    assert.deepEqual(first.orderedItems, second.orderedItems);
    assert.deepEqual(first.desktop, second.desktop);
    assert.deepEqual(first.mobile, second.mobile);
    assert.ok(first.videoCount >= 1);
    assert.ok(first.stageCount >= 1);

    const videoItem = first.orderedItems.find((item) => item.kind === 'video');
    assert.ok(videoItem && videoItem.kind === 'video');
    assert.match(videoItem.href, /^\/#demo-video-/);
  });

  it('omits unavailable videos from presentation stages without reordering others', () => {
    const firstVideo = flattenDemoVideos(DEMO_PATH_FIXTURE)[0];
    const unavailable = markDemoVideoUnavailable(
      DEMO_PATH_FIXTURE,
      firstVideo.id
    );
    const stages = toDemoPresentationStages(unavailable);
    const ids = stages.flatMap((stage) =>
      stage.videos.map((video) => video.id)
    );
    assert.equal(ids.includes(firstVideo.id), false);

    const remainingCanonical = flattenDemoVideos(DEMO_PATH_FIXTURE)
      .slice(1)
      .map((video) => video.id);
    assert.deepEqual(ids, remainingCanonical);
  });
});

describe('demo metadata refresh and delete lifecycle', () => {
  it('marks a video unavailable when oEmbed fails and preserves order', async () => {
    const video = flattenDemoVideos(DEMO_PATH_FIXTURE)[0];
    const refreshed = await refreshDemoVideoMetadata(video, {
      fetchImpl: async () =>
        new Response('gone', { status: 404 }) as unknown as Response,
      now: new Date('2026-09-26T15:00:00.000Z'),
    });
    assert.equal(refreshed.availability, 'unavailable');
    assert.equal(refreshed.id, video.id);
    assert.equal(refreshed.position, video.position);
  });

  it('updates metadata from oEmbed without changing stage order', async () => {
    const beforeIds = flattenDemoVideos(DEMO_PATH_FIXTURE).map((v) => v.id);
    const refreshedFixture = await refreshDemoPathMetadata(DEMO_PATH_FIXTURE, {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            title: 'Refreshed Title',
            author_name: 'Refreshed Channel',
            provider_name: 'YouTube',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ) as unknown as Response,
      now: new Date('2026-09-26T15:00:00.000Z'),
    });

    assert.deepEqual(
      flattenDemoVideos(refreshedFixture).map((v) => v.id),
      beforeIds
    );
    assert.equal(
      refreshedFixture.stages[0]?.videos[0]?.title,
      'Refreshed Title'
    );
    assert.equal(
      refreshedFixture.stages[0]?.videos[0]?.metadataSnapshot?.source,
      'oembed_refresh'
    );
  });

  it('clears stored metadata snapshots for delete/retention lifecycle', () => {
    const cleared = clearDemoMetadataSnapshots(DEMO_PATH_FIXTURE);
    for (const video of flattenDemoVideos(cleared)) {
      assert.equal(video.metadataSnapshot, null);
      assert.ok(video.youtubeVideoId);
    }
  });
});

describe('demo follow helpers', () => {
  it('resolves landing hashes and adjacent playable videos', () => {
    const first = resolveInitialDemoVideo(DEMO_PATH_FIXTURE);
    assert.ok(first);
    const href = buildDemoLandingHref(first.id);
    assert.equal(parseDemoLandingVideoHash(href), first.id);
    assert.equal(parseDemoLandingVideoHash(`#${href.slice(2)}`), first.id);

    const next = adjacentDemoVideo(DEMO_PATH_FIXTURE, first.id, 'next');
    assert.ok(next);
    assert.notEqual(next.id, first.id);
    assert.equal(
      adjacentDemoVideo(DEMO_PATH_FIXTURE, first.id, 'previous'),
      null
    );
  });

  it('loads demo watch context only for the public demo path id', () => {
    const first = getPlayableDemoVideos(DEMO_PATH_FIXTURE)[0];
    const context = loadDemoWatchContext(first.id, first.youtubeVideoId);
    assert.ok(context);
    assert.equal(context.pathId, DEMO_PATH_ID);
    assert.equal(context.practiced, false);
    assert.match(context.returnHref, /^\/#demo-video-/);
    assert.equal(isPublicDemoPathId(DEMO_PATH_ID), true);
    assert.equal(
      isPublicDemoPathId('11111111-1111-4111-8111-111111111111'),
      false
    );
    assert.equal(loadDemoWatchContext(first.id, 'xxxxxxxxxxx'), null);
  });
});

describe('logged-out route behavior', () => {
  it('keeps the landing page public and paths protected in middleware', () => {
    const middleware = readFileSync(join(root, 'src/middleware.ts'), 'utf8');
    assert.match(middleware, /PROTECTED_PAGE_PREFIXES/);
    assert.match(middleware, /'\/paths'/);
    assert.match(middleware, /'\/dashboard'/);
    assert.equal(middleware.includes("'/'"), false);
    assert.doesNotMatch(middleware, /matcher:[\s\S]*'\/'/);
  });

  it('allows anonymous demo watch while requiring session for personal watch', () => {
    const watchPage = readFileSync(
      join(root, 'src/app/watch/[videoId]/page.tsx'),
      'utf8'
    );
    assert.match(watchPage, /isPublicDemoPathId/);
    assert.match(watchPage, /loadDemoWatchContext/);
    assert.match(watchPage, /!session && !isPublicDemoWatch/);
    assert.match(watchPage, /callbackUrl|router\.push\('\/'\)/);
  });

  it('renders the public demo on the landing page with inline player', () => {
    const page = readFileSync(join(root, 'src/app/page.tsx'), 'utf8');
    const demo = readFileSync(
      join(root, 'src/components/DemoPathLanding.tsx'),
      'utf8'
    );
    assert.match(page, /DemoPathLanding/);
    assert.match(demo, /DEMO_PATH_SLOGAN/);
    assert.match(demo, /YouTubePlayer/);
    assert.match(demo, /PathMap/);
    assert.match(demo, /callbackUrl: PATHS_CALLBACK_URL/);
    assert.match(demo, /PATHS_CALLBACK_URL = '\/paths'/);
  });
});

describe('private API protection', () => {
  it('keeps path mutation and personal path APIs behind requireApiSession', () => {
    const pathFiles = [
      'src/app/api/paths/route.ts',
      'src/app/api/paths/[pathId]/route.ts',
      'src/app/api/paths/[pathId]/research/route.ts',
      'src/app/api/paths/[pathId]/progress/route.ts',
      'src/app/api/paths/[pathId]/edits/route.ts',
      'src/app/api/paths/[pathId]/watch-context/route.ts',
    ];

    for (const relativePath of pathFiles) {
      const source = readFileSync(join(root, relativePath), 'utf8');
      assert.match(
        source,
        /requireApiSession/,
        `${relativePath} must require an API session`
      );
      assert.equal(
        source.includes('isPublicDemoPathId'),
        false,
        `${relativePath} must not open personal paths via the demo id`
      );
    }
  });

  it('does not add public access to arbitrary personal paths', () => {
    const demoSource = readFileSync(join(root, 'src/lib/demo-path.ts'), 'utf8');
    assert.match(demoSource, /DEMO_PATH_ID/);
    assert.match(demoSource, /isPublicDemoPathId/);
    assert.doesNotMatch(demoSource, /is_public/);
    assert.doesNotMatch(demoSource, /CREATE TABLE/);
  });
});
