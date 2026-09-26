'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { YouTubePlayer, TimeInterval } from '../../../components/YouTubePlayer';
import { IntervalManager } from '../../../components/IntervalManager';
import type { IntervalSuggestionView } from '../../../components/IntervalManager';
import { VideoInterval } from '../../../types/intervals';
import type { PathWatchContext } from '@/lib/path-links';
import { buildPathWatchHref } from '@/lib/path-links';
import { isPublicDemoPathId, loadDemoWatchContext } from '@/lib/demo-path';

interface PlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
    channelTitle: string;
    publishedAt: string;
  };
  contentDetails: {
    videoId: string;
  };
}

const getLocalIntervalNamesKey = (videoId: string) =>
  `savedtube:interval-names:${videoId}`;

const readLocalIntervalNames = (videoId: string): Record<string, string> => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(
      window.localStorage.getItem(getLocalIntervalNamesKey(videoId)) || '{}'
    );
  } catch {
    return {};
  }
};

const writeLocalIntervalName = (
  videoId: string,
  intervalId: string,
  name: string
) => {
  if (typeof window === 'undefined') return;

  const names = readLocalIntervalNames(videoId);
  const trimmedName = name.trim();

  if (trimmedName) {
    names[intervalId] = trimmedName;
  } else {
    delete names[intervalId];
  }

  window.localStorage.setItem(
    getLocalIntervalNamesKey(videoId),
    JSON.stringify(names)
  );
};

const mergeLocalIntervalNames = (
  videoId: string,
  intervals: VideoInterval[]
): VideoInterval[] => {
  const localNames = readLocalIntervalNames(videoId);

  return intervals.map((interval) => ({
    ...interval,
    name: interval.name || localNames[interval.id] || null,
  }));
};

function pathWatchHref(
  youtubeVideoId: string,
  pathId: string,
  pathVideoId: string
): string {
  return buildPathWatchHref(youtubeVideoId, pathId, pathVideoId);
}

export default function WatchPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoId = params.videoId as string;
  const playlistId = searchParams.get('playlistId');
  const pathId = searchParams.get('pathId');
  const pathVideoId = searchParams.get('pathVideoId');
  const mode =
    pathId && pathVideoId ? 'path' : playlistId ? 'playlist' : 'standalone';

  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [pathContext, setPathContext] = useState<PathWatchContext | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [isMarkingPracticed, setIsMarkingPracticed] = useState(false);

  // Interval management state
  const [intervals, setIntervals] = useState<VideoInterval[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [showIntervalPanel, setShowIntervalPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration] = useState<number | undefined>(undefined);
  const [activeIntervalId, setActiveIntervalId] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<{
    time: number;
    token: number;
  } | null>(null);
  const [playThrough, setPlayThrough] = useState<{ startIndex: number } | null>(
    null
  );
  const [isImportingIntervals, setIsImportingIntervals] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<IntervalSuggestionView[]>([]);
  const [suggestionsState, setSuggestionsState] = useState<
    'idle' | 'loading' | 'suggestions' | 'no_chapters' | 'error'
  >('idle');
  const [suggestionsMessage, setSuggestionsMessage] = useState<string | null>(
    null
  );
  const [isAcceptingSuggestion, setIsAcceptingSuggestion] = useState(false);
  const [suggestionIdempotencyKey, setSuggestionIdempotencyKey] = useState(
    () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `suggest-${Date.now()}`
  );

  const fetchPlaylistItems = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/playlist-items?playlistId=${playlistId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch playlist items');
      }

      const data = await response.json();
      setPlaylistItems(data.items || []);
    } catch (fetchError) {
      console.error('Error fetching playlist items:', fetchError);
      setError('Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  const fetchPathContext = useCallback(async () => {
    if (!pathId || !pathVideoId) {
      return;
    }

    // Public curated demo — resolve from the versioned fixture, never personal APIs.
    if (isPublicDemoPathId(pathId)) {
      const demoContext = loadDemoWatchContext(pathVideoId, videoId);
      if (!demoContext) {
        setError('This demo video is unavailable.');
      } else {
        setPathContext(demoContext);
      }
      setIsLoading(false);
      return;
    }

    try {
      const query = new URLSearchParams({
        pathVideoId,
        videoId,
      });
      const response = await fetch(
        `/api/paths/${pathId}/watch-context?${query.toString()}`
      );
      if (response.status === 404) {
        setError('This video is not part of the active path revision.');
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load path context');
      }
      const data = await response.json();
      setPathContext(data.context as PathWatchContext);
    } catch (fetchError) {
      console.error('Error fetching path context:', fetchError);
      setError('Failed to load path');
    } finally {
      setIsLoading(false);
    }
  }, [pathId, pathVideoId, videoId]);

  const fetchIntervals = useCallback(async () => {
    try {
      const response = await fetch(`/api/vid-intervals?videoId=${videoId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch intervals');
      }
      const data = await response.json();
      setIntervals(mergeLocalIntervalNames(videoId, data.intervals || []));
    } catch (fetchError) {
      console.error('Error fetching intervals:', fetchError);
    }
  }, [videoId]);

  const handleAddInterval = async (startTime: number, endTime: number) => {
    try {
      const response = await fetch('/api/vid-intervals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, startTime, endTime }),
      });

      if (!response.ok) {
        throw new Error('Failed to create interval');
      }

      await fetchIntervals();
    } catch (createError) {
      console.error('Error adding interval:', createError);
      throw createError;
    }
  };

  const handleDeleteInterval = async (intervalId: string) => {
    try {
      const response = await fetch(`/api/vid-intervals?id=${intervalId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete interval');
      }
      await fetchIntervals();
    } catch (deleteError) {
      console.error('Error deleting interval:', deleteError);
      throw deleteError;
    }
  };

  const handleRenameInterval = async (intervalId: string, name: string) => {
    const trimmedName = name.trim();

    writeLocalIntervalName(videoId, intervalId, trimmedName);
    setIntervals((currentIntervals) =>
      currentIntervals.map((interval) =>
        interval.id === intervalId
          ? { ...interval, name: trimmedName || null }
          : interval
      )
    );

    try {
      const response = await fetch('/api/vid-intervals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: intervalId, name: trimmedName || null }),
      });

      if (!response.ok) {
        console.warn('Interval rename saved locally only');
        return;
      }

      await fetchIntervals();
    } catch (renameError) {
      console.warn('Interval rename saved locally only:', renameError);
    }
  };

  const handleImportFromYouTube = async (overwrite: boolean) => {
    setIsImportingIntervals(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const response = await fetch('/api/vid-intervals/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, overwrite }),
      });

      let data: {
        importedCount?: number;
        error?: string;
        warning?: string;
        message?: string;
      } | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (response.status === 409) {
          setImportError('Intervals already exist for this video.');
          return;
        }
        if (response.status === 401) {
          setImportError(
            'Your YouTube session expired. Please sign out and sign back in.'
          );
          return;
        }
        setImportError(
          data?.error || 'Failed to import intervals from YouTube.'
        );
        return;
      }

      const importedCount = data?.importedCount ?? 0;
      if (importedCount === 0) {
        setImportMessage(
          data?.message || 'No chapters found in the YouTube description.'
        );
      } else {
        const baseMessage = `Imported ${importedCount} intervals from YouTube.`;
        setImportMessage(
          data?.warning ? `${baseMessage} ${data.warning}` : baseMessage
        );
      }

      await fetchIntervals();
    } catch (importErr) {
      console.error('Error importing intervals:', importErr);
      setImportError('Failed to import intervals from YouTube.');
    } finally {
      setIsImportingIntervals(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!pathId || !pathVideoId || isPublicDemoPathId(pathId)) {
      return;
    }
    setSuggestionsState('loading');
    setSuggestionsMessage(null);
    try {
      const response = await fetch(
        `/api/paths/${pathId}/videos/${pathVideoId}/interval-suggestions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: suggestionIdempotencyKey }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSuggestionsState('error');
        setSuggestionsMessage(
          data.error || 'Failed to generate practice suggestions.'
        );
        setSuggestionIdempotencyKey(
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `suggest-${Date.now()}`
        );
        return;
      }

      const nextSuggestions = (data.suggestions ||
        []) as IntervalSuggestionView[];
      setSuggestions(nextSuggestions);
      if (data.state === 'no_chapters') {
        setSuggestionsState('no_chapters');
        setSuggestionsMessage(
          data.message ||
            'No usable chapters found. Mark practice intervals manually.'
        );
      } else {
        setSuggestionsState('suggestions');
        setSuggestionsMessage(data.message || null);
      }
    } catch (suggestError) {
      console.error('Error generating suggestions:', suggestError);
      setSuggestionsState('error');
      setSuggestionsMessage('Failed to generate practice suggestions.');
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string) => {
    if (!pathId || !pathVideoId || isAcceptingSuggestion) {
      return;
    }
    setIsAcceptingSuggestion(true);
    try {
      const response = await fetch(
        `/api/paths/${pathId}/videos/${pathVideoId}/interval-suggestions/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestionIds: [suggestionId] }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSuggestionsMessage(data.error || 'Failed to accept suggestion.');
        return;
      }

      const accepted = (data.accepted || []) as Array<{
        suggestionId: string;
        interval: VideoInterval;
      }>;
      setSuggestions((prev) =>
        prev.map((suggestion) => {
          const match = accepted.find(
            (item) => item.suggestionId === suggestion.id
          );
          if (!match) return suggestion;
          return {
            ...suggestion,
            acceptedIntervalId: match.interval.id,
          };
        })
      );
      await fetchIntervals();
    } catch (acceptError) {
      console.error('Error accepting suggestion:', acceptError);
      setSuggestionsMessage('Failed to accept suggestion.');
    } finally {
      setIsAcceptingSuggestion(false);
    }
  };

  const markPracticed = async (practiced: boolean) => {
    if (!pathId || !pathVideoId || isMarkingPracticed) {
      return;
    }
    setIsMarkingPracticed(true);
    try {
      const response = await fetch(`/api/paths/${pathId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_practiced',
          pathVideoId,
          practiced,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update practiced state');
      }
      setPathContext((prev) => (prev ? { ...prev, practiced } : prev));
    } catch (practiceError) {
      console.error('Error updating practiced state:', practiceError);
    } finally {
      setIsMarkingPracticed(false);
    }
  };

  const sortedIntervals = useMemo(
    () => [...intervals].sort((a, b) => a.startTime - b.startTime),
    [intervals]
  );

  const isPublicDemoWatch = mode === 'path' && isPublicDemoPathId(pathId);

  useEffect(() => {
    if (status === 'loading') return;

    // Personal playlist/path/standalone watch stays sign-in protected.
    // The curated public demo may play without a session.
    if (!session && !isPublicDemoWatch) {
      router.push('/');
      return;
    }

    setError(null);
    setIsLoading(true);

    if (mode === 'playlist') {
      void fetchPlaylistItems();
    } else if (mode === 'path') {
      void fetchPathContext();
    } else {
      setPlaylistItems([]);
      setPathContext(null);
      setIsLoading(false);
    }

    // Intervals are personal — skip private API calls for anonymous demo visitors.
    if (session) {
      void fetchIntervals();
    } else {
      setIntervals([]);
    }
  }, [
    session,
    status,
    mode,
    isPublicDemoWatch,
    fetchPlaylistItems,
    fetchPathContext,
    fetchIntervals,
    router,
  ]);

  useEffect(() => {
    const storedAutoplay =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('savedtube:autoplay')
        : null;
    if (storedAutoplay !== null) {
      setAutoplayEnabled(storedAutoplay === 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('savedtube:autoplay', String(autoplayEnabled));
  }, [autoplayEnabled]);

  useEffect(() => {
    if (playlistItems.length > 0) {
      const index = playlistItems.findIndex(
        (item) => item.contentDetails.videoId === videoId
      );
      setCurrentIndex(index >= 0 ? index : 0);
    }
  }, [playlistItems, videoId]);

  useEffect(() => {
    setPlayThrough(null);
  }, [videoId]);

  const goToNext = useCallback(() => {
    if (mode === 'path' && pathContext?.next && pathId) {
      router.push(
        pathWatchHref(
          pathContext.next.youtubeVideoId,
          pathId,
          pathContext.next.pathVideoId
        )
      );
      return;
    }
    if (mode === 'playlist' && currentIndex < playlistItems.length - 1) {
      const nextItem = playlistItems[currentIndex + 1];
      router.push(
        `/watch/${nextItem.contentDetails.videoId}?playlistId=${playlistId}`
      );
    }
  }, [
    mode,
    pathContext,
    pathId,
    currentIndex,
    playlistItems,
    playlistId,
    router,
  ]);

  const goToPrevious = useCallback(() => {
    if (mode === 'path' && pathContext?.previous && pathId) {
      router.push(
        pathWatchHref(
          pathContext.previous.youtubeVideoId,
          pathId,
          pathContext.previous.pathVideoId
        )
      );
      return;
    }
    if (mode === 'playlist' && currentIndex > 0) {
      const prevItem = playlistItems[currentIndex - 1];
      router.push(
        `/watch/${prevItem.contentDetails.videoId}?playlistId=${playlistId}`
      );
    }
  }, [
    mode,
    pathContext,
    pathId,
    currentIndex,
    playlistItems,
    playlistId,
    router,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goToNext();
          break;
        case 'Escape':
          event.preventDefault();
          if (mode === 'path' && pathContext) {
            router.push(pathContext.returnHref);
          } else if (mode === 'playlist' && playlistId) {
            router.push(`/p/${playlistId}`);
          } else {
            router.push('/paths');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, mode, pathContext, playlistId, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-amber-200"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center px-5">
        <div className="rounded-[2rem] border border-red-300/20 bg-[#10100d]/90 p-8 text-center shadow-2xl shadow-black/50">
          <h1 className="text-2xl font-medium tracking-[-0.03em] text-red-100 mb-4">
            Error
          </h1>
          <p className="text-red-200/80 mb-5">{error}</p>
          <Link
            href={
              isPublicDemoWatch
                ? '/'
                : mode === 'path'
                  ? `/paths/${pathId}`
                  : '/dashboard'
            }
            className="rounded-full bg-stone-100 px-5 py-2.5 text-sm font-medium text-stone-950 transition hover:bg-white"
          >
            {isPublicDemoWatch
              ? 'Back to demo'
              : mode === 'path'
                ? 'Back to path'
                : 'Back to Dashboard'}
          </Link>
        </div>
      </div>
    );
  }

  const currentItem = mode === 'playlist' ? playlistItems[currentIndex] : null;
  const displayTitle =
    pathContext?.title || currentItem?.snippet.title || 'Practice video';
  const displayChannel =
    pathContext?.channelTitle || currentItem?.snippet.channelTitle || 'YouTube';
  const hasNext =
    mode === 'path'
      ? Boolean(pathContext?.next)
      : mode === 'playlist'
        ? currentIndex < playlistItems.length - 1
        : false;
  const hasPrevious =
    mode === 'path'
      ? Boolean(pathContext?.previous)
      : mode === 'playlist'
        ? currentIndex > 0
        : false;
  const positionLabel =
    mode === 'path' && pathContext
      ? `${pathContext.position + 1} of ${pathContext.total}`
      : mode === 'playlist'
        ? `${currentIndex + 1} of ${playlistItems.length}`
        : null;
  const backHref =
    mode === 'path' && pathContext
      ? pathContext.returnHref
      : mode === 'playlist' && playlistId
        ? `/p/${playlistId}`
        : '/paths';
  const backLabel = isPublicDemoWatch
    ? '← Demo'
    : mode === 'path'
      ? '← Path'
      : mode === 'playlist'
        ? '← Playlist'
        : '← Paths';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080806] text-stone-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.14),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_55%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[1px] w-[78vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="absolute left-0 right-0 top-0 z-10 border-b border-white/[0.06] bg-[#080806]/70 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href={backHref}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-stone-300 transition hover:bg-white/[0.06] hover:text-stone-50"
            >
              {backLabel}
            </Link>
            <div className="min-w-0">
              <h1 className="max-w-[42vw] truncate text-base font-medium tracking-[-0.02em] text-stone-50 sm:text-lg">
                {displayTitle}
              </h1>
              <p className="truncate text-sm text-stone-400">
                {displayChannel}
                {pathContext ? ` · ${pathContext.stageTitle}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {mode === 'path' &&
              pathContext &&
              session &&
              !isPublicDemoWatch && (
                <button
                  type="button"
                  onClick={() => void markPracticed(!pathContext.practiced)}
                  disabled={isMarkingPracticed}
                  className="rounded-full border border-amber-200/25 bg-amber-300/10 px-3 py-2 text-xs font-medium text-amber-50 transition hover:bg-amber-300/15 disabled:opacity-60"
                >
                  {pathContext.practiced ? 'Practiced' : 'Mark practiced'}
                </button>
              )}
            {positionLabel && (
              <span className="hidden font-mono text-xs uppercase tracking-[0.18em] text-amber-100/60 sm:inline">
                {positionLabel}
              </span>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={autoplayEnabled}
              onClick={() => setAutoplayEnabled((prev) => !prev)}
              className="flex items-center gap-2 text-xs text-stone-300 transition hover:text-stone-50 sm:text-sm"
              title="Toggle autoplay"
            >
              <span className="hidden sm:inline">Autoplay</span>
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                  autoplayEnabled
                    ? 'border-amber-200/30 bg-amber-300/30'
                    : 'border-white/10 bg-white/[0.06]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-stone-100 transition-transform ${
                    autoplayEnabled ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>
            <div className="hidden text-xs text-stone-500 lg:block">
              ← → navigate · Esc exit
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-0 flex min-h-screen items-center justify-center px-5 py-28 sm:px-8">
        <div className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#10100d]/90 p-2 shadow-2xl shadow-black/50">
          <YouTubePlayer
            videoId={videoId}
            autoPlay={autoplayEnabled}
            intervals={sortedIntervals.map(
              (interval): TimeInterval => ({
                startTime: interval.startTime,
                endTime: interval.endTime,
              })
            )}
            loopEnabled={loopEnabled}
            onEnd={() => {
              // Playback end advances navigation only — never marks mastery.
              if (hasNext && autoplayEnabled && intervals.length === 0) {
                goToNext();
              }
            }}
            onIntervalChange={(index) => {
              const interval = sortedIntervals[index];
              setActiveIntervalId(interval?.id ?? null);
            }}
            onCurrentTimeUpdate={setCurrentTime}
            seekToSeconds={seekRequest?.time ?? null}
            seekToToken={seekRequest?.token}
            onSeekComplete={() => setSeekRequest(null)}
            playThroughIntervals={playThrough !== null}
            playThroughStartIndex={playThrough?.startIndex ?? 0}
          />
        </div>
      </div>

      {(mode === 'playlist' || mode === 'path') && (
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 transform">
          <div className="flex items-center gap-4 rounded-full border border-white/10 bg-[#10100d]/85 px-5 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <button
              onClick={goToPrevious}
              disabled={!hasPrevious}
              className={`rounded-full p-2 transition ${
                hasPrevious
                  ? 'text-stone-100 hover:bg-white hover:text-stone-950'
                  : 'cursor-not-allowed text-stone-600'
              }`}
              title="Previous video"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            <div className="font-mono text-sm text-stone-300">
              {positionLabel}
            </div>

            <button
              onClick={goToNext}
              disabled={!hasNext}
              className={`rounded-full p-2 transition ${
                hasNext
                  ? 'text-stone-100 hover:bg-white hover:text-stone-950'
                  : 'cursor-not-allowed text-stone-600'
              }`}
              title="Next video"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!isPublicDemoWatch && (
        <button
          onClick={() => setShowIntervalPanel(!showIntervalPanel)}
          className="fixed right-5 top-24 z-30 rounded-full border border-amber-200/25 bg-amber-300/15 p-3 text-amber-100 shadow-2xl shadow-black/40 transition hover:bg-amber-300/20"
          title="Manage time intervals"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      )}

      {mode === 'path' && !isPublicDemoWatch && (
        <p className="fixed bottom-28 left-5 z-20 max-w-xs text-xs text-stone-500 sm:left-8">
          Practice loops on this video are shared across paths.
        </p>
      )}

      {!isPublicDemoWatch && (
        <IntervalManager
          videoId={videoId}
          intervals={intervals}
          loopEnabled={loopEnabled}
          videoDuration={videoDuration}
          currentTime={currentTime}
          onAddInterval={handleAddInterval}
          onDeleteInterval={handleDeleteInterval}
          onRenameInterval={handleRenameInterval}
          onToggleLoop={(enabled) => {
            setPlayThrough(null);
            setLoopEnabled(enabled);
          }}
          onImportFromYouTube={handleImportFromYouTube}
          isImporting={isImportingIntervals}
          importError={importError}
          importMessage={importMessage}
          suggestions={suggestions}
          suggestionsState={suggestionsState}
          suggestionsMessage={suggestionsMessage}
          isAcceptingSuggestion={isAcceptingSuggestion}
          onGenerateSuggestions={
            mode === 'path' && pathId && pathVideoId && !isPublicDemoWatch
              ? handleGenerateSuggestions
              : undefined
          }
          onAcceptSuggestion={
            mode === 'path' && pathId && pathVideoId && !isPublicDemoWatch
              ? handleAcceptSuggestion
              : undefined
          }
          activeIntervalId={activeIntervalId}
          onSelectInterval={(interval) => {
            const startIndex = sortedIntervals.findIndex(
              (item) => item.id === interval.id
            );
            setPlayThrough({ startIndex: startIndex >= 0 ? startIndex : 0 });
            setSeekRequest({ time: interval.startTime, token: Date.now() });
          }}
          isOpen={showIntervalPanel}
          onClose={() => setShowIntervalPanel(false)}
        />
      )}
    </div>
  );
}
