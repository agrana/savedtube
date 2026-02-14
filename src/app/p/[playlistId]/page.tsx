'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Logo from '@/components/Logo';

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

type SortMode =
  | 'custom'
  | 'date_desc'
  | 'date_asc'
  | 'alpha_asc'
  | 'alpha_desc';

export default function PlaylistPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const playlistId = params.playlistId as string;

  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('custom');
  const [videoUrl, setVideoUrl] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);

  const fetchPlaylistItems = useCallback(async () => {
    try {
      setError(null);
      setEditError(null);
      const response = await fetch(
        `/api/playlist-items?playlistId=${encodeURIComponent(playlistId)}&sort=${sortMode}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch playlist items');
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (fetchError) {
      console.error('Error fetching playlist items:', fetchError);
      setError('Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  }, [playlistId, sortMode]);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetch(`/api/progress?playlistId=${playlistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch progress');
      }

      const data = await response.json();
      setProgress(data.progress || []);
    } catch (fetchError) {
      console.error('Error fetching progress:', fetchError);
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
  }, [session, status, fetchPlaylistItems, fetchProgress, router]);

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
        }

        return [
          ...prev,
          {
            video_id: videoId,
            watched: !currentlyWatched,
            watched_at: !currentlyWatched ? new Date().toISOString() : null,
          },
        ];
      });
    } catch (updateError) {
      console.error('Error updating progress:', updateError);
    }
  };

  const persistCustomOrder = async (orderedVideoIds: string[]) => {
    const response = await fetch('/api/playlist-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'reorder',
        playlistId,
        orderedVideoIds,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save custom order');
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    if (sortMode !== 'custom' || isApplyingEdit) return;

    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    setEditError(null);
    setEditMessage(null);

    const previousItems = items;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setItems(reordered);
    setIsApplyingEdit(true);

    try {
      await persistCustomOrder(
        reordered.map((item) => item.contentDetails.videoId)
      );
    } catch (reorderError) {
      setItems(previousItems);
      setEditError(
        reorderError instanceof Error
          ? reorderError.message
          : 'Failed to save custom order'
      );
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const removeVideo = async (videoId: string) => {
    if (isApplyingEdit) return;

    setEditError(null);
    setEditMessage(null);
    setIsApplyingEdit(true);

    try {
      const response = await fetch('/api/playlist-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'remove',
          playlistId,
          videoId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove video');
      }

      setItems((prev) =>
        prev.filter((item) => item.contentDetails.videoId !== videoId)
      );
      setEditMessage('Video removed from this playlist view.');
    } catch (removeError) {
      setEditError(
        removeError instanceof Error
          ? removeError.message
          : 'Failed to remove video'
      );
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const addVideoByUrl = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!videoUrl.trim() || isApplyingEdit) {
      return;
    }

    setEditError(null);
    setEditMessage(null);
    setIsApplyingEdit(true);

    try {
      const response = await fetch('/api/playlist-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          playlistId,
          url: videoUrl.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add video');
      }

      setVideoUrl('');
      setEditMessage('Video added to this playlist view.');
      await fetchPlaylistItems();
    } catch (addError) {
      setEditError(
        addError instanceof Error ? addError.message : 'Failed to add video'
      );
    } finally {
      setIsApplyingEdit(false);
    }
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
              <Logo size="lg" variant="default" showText={true} />
              <span className="text-lg font-medium text-gray-600 ml-4">
                Playlist
              </span>
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
          <div className="bg-white rounded-lg shadow-md p-4 mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="sort-mode"
                  className="text-sm font-medium text-gray-700"
                >
                  Sort
                </label>
                <select
                  id="sort-mode"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                >
                  <option value="custom">Custom order</option>
                  <option value="date_desc">Date (newest first)</option>
                  <option value="date_asc">Date (oldest first)</option>
                  <option value="alpha_asc">Alphabetical (A-Z)</option>
                  <option value="alpha_desc">Alphabetical (Z-A)</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">
                Total videos shown: {items.length}
              </p>
            </div>

            <form onSubmit={addVideoByUrl} className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="Add video by YouTube URL"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                required
              />
              <button
                type="submit"
                disabled={isApplyingEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add video
              </button>
            </form>

            {editError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {editError}
              </div>
            )}

            {editMessage && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                {editMessage}
              </div>
            )}
          </div>

          {items.length > 0 ? (
            <div className="space-y-4">
              {items.map((item, index) => {
                const videoId = item.contentDetails.videoId;
                const watched =
                  progress.find((p) => p.video_id === videoId)?.watched || false;

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
                          src={
                            item.snippet.thumbnails?.medium?.url ||
                            item.snippet.thumbnails?.default?.url ||
                            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNjAgOTBDMTQzLjQzMSA5MCAxMzAgMTAzLjQzMSAxMzAgMTIwQzEzMCAxMzYuNTY5IDE0My40MzEgMTUwIDE2MCAxNTBDMTc2LjU2OSAxNTAgMTkwIDEzNi41NjkgMTkwIDEyMEMxOTAgMTAzLjQzMSAxNzYuNTY5IDkwIDE2MCA5MFoiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTE0MCAxMzBMMTcwIDEyMEwxNDAgMTEwVjEzMFoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo='
                          }
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
                        {item.snippet.channelTitle || 'Unknown Channel'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {item.snippet.publishedAt
                          ? new Date(item.snippet.publishedAt).toLocaleDateString()
                          : 'Unknown Date'}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {sortMode === 'custom' && (
                        <>
                          <button
                            onClick={() => moveItem(index, -1)}
                            disabled={index === 0 || isApplyingEdit}
                            className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveItem(index, 1)}
                            disabled={index === items.length - 1 || isApplyingEdit}
                            className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => toggleWatched(videoId, watched)}
                        className={`p-2 rounded-full ${
                          watched
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title={watched ? 'Mark as unwatched' : 'Mark as watched'}
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

                      <button
                        onClick={() => removeVideo(videoId)}
                        disabled={isApplyingEdit}
                        className="px-3 py-2 text-sm rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                        title="Remove from this playlist view"
                      >
                        Remove
                      </button>

                      <Link
                        href={`/watch/${videoId}?playlistId=${playlistId}`}
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
                This playlist appears to be empty or all items were removed.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
