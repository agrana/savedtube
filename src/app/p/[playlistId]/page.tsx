'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

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

interface Progress {
  video_id: string;
  watched: boolean;
  watched_at: string | null;
}

export default function PlaylistPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const playlistId = params.playlistId as string;

  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylistItems = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/playlist-items?playlistId=${playlistId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch playlist items');
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error('Error fetching playlist items:', error);
      setError('Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch(`/api/progress?playlistId=${playlistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch progress');
      }

      const data = await response.json();
      setProgress(data.progress || []);
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  }, [playlistId]);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/');
      return;
    }

    fetchPlaylistItems();
    fetchProgress();
  }, [session, status, playlistId, fetchPlaylistItems, fetchProgress, router]);

  const toggleWatched = async (videoId: string, currentlyWatched: boolean) => {
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlistId,
          videoId,
          watched: !currentlyWatched,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update progress');
      }

      // Update local state
      setProgress((prev) => {
        const existing = prev.find((p) => p.video_id === videoId);
        if (existing) {
          return prev.map((p) =>
            p.video_id === videoId
              ? {
                  ...p,
                  watched: !currentlyWatched,
                  watched_at: !currentlyWatched
                    ? new Date().toISOString()
                    : null,
                }
              : p
          );
        } else {
          return [
            ...prev,
            {
              video_id: videoId,
              watched: !currentlyWatched,
              watched_at: !currentlyWatched ? new Date().toISOString() : null,
            },
          ];
        }
      });
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const isWatched = (videoId: string) => {
    return progress.find((p) => p.video_id === videoId)?.watched || false;
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-900 mb-4">Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/dashboard"
                className="text-gray-500 hover:text-gray-700 mr-4"
              >
                ← Back to Playlists
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                Playlist Videos
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {session?.user?.image && (
                  <Image
                    className="h-8 w-8 rounded-full"
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    width={32}
                    height={32}
                  />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {session?.user?.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item) => {
                const watched = isWatched(item.contentDetails.videoId);
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-lg shadow-md p-4 flex items-center space-x-4 ${
                      watched ? 'opacity-75' : ''
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <div className="relative w-32 h-20">
                        <Image
                          src={item.snippet.thumbnails.medium.url}
                          alt={item.snippet.title}
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {item.snippet.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {item.snippet.channelTitle}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(
                          item.snippet.publishedAt
                        ).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() =>
                          toggleWatched(item.contentDetails.videoId, watched)
                        }
                        className={`p-2 rounded-full ${
                          watched
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title={
                          watched ? 'Mark as unwatched' : 'Mark as watched'
                        }
                      >
                        {watched ? (
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>

                      <Link
                        href={`/watch/${item.contentDetails.videoId}?playlistId=${playlistId}`}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Watch
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No videos found
              </h3>
              <p className="text-gray-600">
                This playlist appears to be empty.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
