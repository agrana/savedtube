'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { YouTubePlayer, TimeInterval } from '../../../components/YouTubePlayer';
import { IntervalManager } from '../../../components/IntervalManager';
import { VideoInterval } from '../../../types/intervals';

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

export default function WatchPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoId = params.videoId as string;
  const playlistId = searchParams.get('playlistId');

  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);

  // Interval management state
  const [intervals, setIntervals] = useState<VideoInterval[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [showIntervalPanel, setShowIntervalPanel] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | undefined>(
    undefined
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
    } catch (error) {
      console.error('Error fetching playlist items:', error);
      setError('Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  const fetchIntervals = useCallback(async () => {
    try {
      const response = await fetch(`/api/vid-intervals?videoId=${videoId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch intervals');
      }
      const data = await response.json();
      setIntervals(data.intervals || []);
    } catch (error) {
      console.error('Error fetching intervals:', error);
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
    } catch (error) {
      console.error('Error adding interval:', error);
      throw error;
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
    } catch (error) {
      console.error('Error deleting interval:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/');
      return;
    }

    if (playlistId) {
      fetchPlaylistItems();
    }

    // Fetch intervals for this video
    fetchIntervals();
  }, [session, status, playlistId, fetchPlaylistItems, fetchIntervals, router]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return; // Don't handle shortcuts when typing in input fields
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (currentIndex > 0) {
            const prevItem = playlistItems[currentIndex - 1];
            router.push(
              `/watch/${prevItem.contentDetails.videoId}?playlistId=${playlistId}`
            );
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (currentIndex < playlistItems.length - 1) {
            const nextItem = playlistItems[currentIndex + 1];
            router.push(
              `/watch/${nextItem.contentDetails.videoId}?playlistId=${playlistId}`
            );
          }
          break;
        case 'Escape':
          event.preventDefault();
          router.push(`/p/${playlistId}`);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, playlistItems, playlistId, router]);

  const goToNext = () => {
    if (currentIndex < playlistItems.length - 1) {
      const nextItem = playlistItems[currentIndex + 1];
      router.push(
        `/watch/${nextItem.contentDetails.videoId}?playlistId=${playlistId}`
      );
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      const prevItem = playlistItems[currentIndex - 1];
      router.push(
        `/watch/${prevItem.contentDetails.videoId}?playlistId=${playlistId}`
      );
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="mb-4">{error}</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm font-medium text-black bg-white rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const currentItem = playlistItems[currentIndex];
  const hasNext = currentIndex < playlistItems.length - 1;
  const hasPrevious = currentIndex > 0;

  return (
    <div className="min-h-screen bg-black">
      {/* Minimal header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-black bg-opacity-50 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-4">
            <Link
              href={`/p/${playlistId}`}
              className="text-white hover:text-gray-300 transition-colors"
            >
              ← Back to Playlist
            </Link>
            {currentItem && (
              <div className="text-white">
                <h1 className="text-lg font-medium truncate max-w-md">
                  {currentItem.snippet.title}
                </h1>
                <p className="text-sm text-gray-300">
                  {currentItem.snippet.channelTitle}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-white text-sm">
              {currentIndex + 1} of {playlistItems.length}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoplayEnabled}
              onClick={() => setAutoplayEnabled((prev) => !prev)}
              className="flex items-center space-x-2 text-white text-xs sm:text-sm hover:text-gray-200 transition-colors"
              title="Toggle autoplay"
            >
              <span className="hidden sm:inline">Autoplay</span>
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  autoplayEnabled ? 'bg-white' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${
                    autoplayEnabled ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>
            <div className="text-white text-xs opacity-70">
              <span className="hidden sm:inline">
                ← → to navigate, Esc to exit
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Video player */}
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-full max-w-6xl">
          <YouTubePlayer
            videoId={videoId}
            autoPlay={autoplayEnabled}
            intervals={intervals.map(
              (interval): TimeInterval => ({
                startTime: interval.startTime,
                endTime: interval.endTime,
              })
            )}
            loopEnabled={loopEnabled}
            onEnd={() => {
              if (hasNext && autoplayEnabled && intervals.length === 0) {
                goToNext();
              }
            }}
            onCurrentTimeUpdate={setCurrentTime}
          />
        </div>
      </div>

      {/* Navigation controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex items-center space-x-4 bg-black bg-opacity-50 backdrop-blur-sm rounded-full px-6 py-3">
          <button
            onClick={goToPrevious}
            disabled={!hasPrevious}
            className={`p-2 rounded-full transition-colors ${
              hasPrevious
                ? 'text-white hover:bg-white hover:text-black'
                : 'text-gray-500 cursor-not-allowed'
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

          <div className="text-white text-sm">
            {currentIndex + 1} / {playlistItems.length}
          </div>

          <button
            onClick={goToNext}
            disabled={!hasNext}
            className={`p-2 rounded-full transition-colors ${
              hasNext
                ? 'text-white hover:bg-white hover:text-black'
                : 'text-gray-500 cursor-not-allowed'
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

      {/* Interval Toggle Button */}
      <button
        onClick={() => setShowIntervalPanel(!showIntervalPanel)}
        className="fixed top-20 right-4 z-30 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors"
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

      {/* Interval Manager Panel */}
      <IntervalManager
        videoId={videoId}
        intervals={intervals}
        loopEnabled={loopEnabled}
        videoDuration={videoDuration}
        currentTime={currentTime}
        onAddInterval={handleAddInterval}
        onDeleteInterval={handleDeleteInterval}
        onToggleLoop={setLoopEnabled}
        isOpen={showIntervalPanel}
        onClose={() => setShowIntervalPanel(false)}
      />
    </div>
  );
}
