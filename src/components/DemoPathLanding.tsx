'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import PathMap from '@/components/PathMap';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import {
  adjacentDemoVideo,
  assertDemoFixtureSafety,
  buildDemoLandingHref,
  buildDemoPathPresentationInput,
  DEMO_PATH_FIXTURE,
  DEMO_PATH_SLOGAN,
  findDemoVideo,
  getPlayableDemoVideos,
  markDemoVideoUnavailable,
  parseDemoLandingVideoHash,
  resolveInitialDemoVideo,
  type DemoPathFixture,
  type DemoPathVideo,
} from '@/lib/demo-path';

const PATHS_CALLBACK_URL = '/paths';

assertDemoFixtureSafety(DEMO_PATH_FIXTURE);

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GoogleSignInButton() {
  const { status } = useSession();
  const isSignedIn = status === 'authenticated';
  const isCheckingSession = status === 'loading';

  return (
    <button
      type="button"
      disabled={isCheckingSession}
      onClick={() => {
        if (isSignedIn) {
          window.location.href = PATHS_CALLBACK_URL;
          return;
        }

        signIn('google', { callbackUrl: PATHS_CALLBACK_URL });
      }}
      className="group inline-flex items-center justify-center gap-3 rounded-full border border-white/10 bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_16px_60px_rgba(0,0,0,0.45)] transition duration-200 hover:bg-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_80px_rgba(245,158,11,0.12)] disabled:cursor-wait disabled:opacity-70"
    >
      <GoogleIcon />
      {isCheckingSession
        ? 'Checking session...'
        : isSignedIn
          ? 'Go to your paths'
          : 'Build your own path'}
      <span className="text-stone-500 transition group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

function selectDemoVideo(
  fixture: DemoPathFixture,
  pathVideoId: string
): DemoPathVideo | null {
  const video = findDemoVideo(pathVideoId, fixture);
  if (!video || video.availability !== 'available') {
    return null;
  }
  return video;
}

/**
 * Public landing demo: slogan, deterministic map/list, one inline player.
 * Anonymous visitors follow the sample here without hitting a login wall.
 */
export default function DemoPathLanding() {
  const [fixture, setFixture] = useState<DemoPathFixture>(DEMO_PATH_FIXTURE);
  const [selectedVideo, setSelectedVideo] = useState<DemoPathVideo | null>(() =>
    resolveInitialDemoVideo(DEMO_PATH_FIXTURE)
  );
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    const applyHash = () => {
      const fromHash = parseDemoLandingVideoHash(window.location.hash);
      if (!fromHash) {
        return;
      }
      setSelectedVideo((current) => {
        const next = resolveInitialDemoVideo(fixture, fromHash);
        return next ?? current;
      });
      setPlayerError(null);
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hash sync
  }, []);

  const presentationInput = buildDemoPathPresentationInput(fixture, {
    selectedPathVideoId: selectedVideo?.id ?? null,
    selectedStageId: selectedVideo?.stageId ?? null,
  });

  const playableCount = getPlayableDemoVideos(fixture).length;

  const handleSelect = (pathVideoId: string) => {
    const video = selectDemoVideo(fixture, pathVideoId);
    if (!video) {
      setPlayerError('That demo video is currently unavailable.');
      return;
    }
    setSelectedVideo(video);
    setPlayerError(null);
    const href = buildDemoLandingHref(video.id);
    if (typeof window !== 'undefined') {
      const desiredHash = href.startsWith('/') ? href.slice(1) : href;
      if (window.location.hash !== desiredHash) {
        window.history.replaceState(null, '', href);
      }
    }
  };

  const handleUnavailable = () => {
    if (!selectedVideo) {
      return;
    }
    const nextFixture = markDemoVideoUnavailable(fixture, selectedVideo.id);
    setFixture(nextFixture);
    const nextVideo =
      adjacentDemoVideo(nextFixture, selectedVideo.id, 'next') ||
      resolveInitialDemoVideo(nextFixture);
    setSelectedVideo(nextVideo);
    setPlayerError(
      nextVideo
        ? 'That video is unavailable. Playing the next demo lesson.'
        : 'Demo videos are temporarily unavailable. Sign in to build your own path.'
    );
  };

  const previous = selectedVideo
    ? adjacentDemoVideo(fixture, selectedVideo.id, 'previous')
    : null;
  const next = selectedVideo
    ? adjacentDemoVideo(fixture, selectedVideo.id, 'next')
    : null;

  return (
    <section
      id="demo"
      className="relative z-10 mx-auto max-w-7xl px-5 pb-20 sm:px-8"
    >
      <div className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-100/80">
          Public demo
        </p>
        <h1 className="mt-4 text-5xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-6xl lg:text-7xl">
          {DEMO_PATH_SLOGAN}
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-400 sm:text-xl">
          Try a curated path for &ldquo;{fixture.goal}&rdquo; — map, sequence,
          and a real YouTube lesson. No account required. Sign in when you want
          to generate and save your own path.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <GoogleSignInButton />
          <a
            href="#demo-player"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06]"
          >
            Watch the demo
          </a>
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div id="demo-player" className="space-y-4">
          <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#10100d] shadow-2xl shadow-black/40">
            {selectedVideo ? (
              <YouTubePlayer
                key={selectedVideo.id}
                videoId={selectedVideo.youtubeVideoId}
                onError={() => handleUnavailable()}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-[#10100d] px-6 text-center text-stone-400">
                {playableCount === 0
                  ? 'Demo videos are temporarily unavailable.'
                  : 'Select a lesson from the path map.'}
              </div>
            )}
          </div>

          {selectedVideo ? (
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100/70">
                Now playing
              </p>
              <h2 className="mt-2 text-lg font-medium text-stone-50">
                {selectedVideo.title}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {selectedVideo.channelTitle}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!previous}
                  onClick={() => previous && handleSelect(previous.id)}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!next}
                  onClick={() => next && handleSelect(next.id)}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {playerError ? (
            <p
              role="status"
              className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50"
            >
              {playerError}
            </p>
          ) : null}
        </div>

        <PathMap
          {...presentationInput}
          buildVideoHref={(_youtubeVideoId, _pathId, pathVideoId) =>
            buildDemoLandingHref(pathVideoId)
          }
          onVideoSelect={({ pathVideoId }) => handleSelect(pathVideoId)}
          listHeading="Demo path sequence"
          className="min-w-0"
        />
      </div>
    </section>
  );
}
