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
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
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
            href="/dashboard"
            className="rounded-full bg-stone-100 px-5 py-2.5 text-sm font-medium text-stone-950 transition hover:bg-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080806] text-stone-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_55%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[1px] w-[78vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <nav className="relative z-10 border-b border-white/[0.06] bg-[#080806]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-stone-300 transition hover:bg-white/[0.06] hover:text-stone-50 sm:inline-flex"
            >
              ← Playlists
            </Link>
            <Logo size="lg" variant="white" showText={true} />
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-amber-100/80 lg:inline-flex">
              Playlist
            </span>
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.image && (
              <Image
                className="h-8 w-8 rounded-full border border-white/10"
                src={session.user.image}
                alt={session.user.name || 'User'}
                width={32}
                height={32}
              />
            )}
            <span className="hidden max-w-36 truncate text-sm font-medium text-stone-300 sm:inline">
              {session?.user?.name}
            </span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="mb-9 max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-100/70">
            Playlist practice room
          </p>
          <h1 className="mt-4 text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-5xl">
            Arrange the lesson path before you start looping.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-400">
            Sort, add, remove, and open videos without leaving the warm studio
            language from the landing page.
          </p>
        </section>

        <div className="mb-8 space-y-4 rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="sort-mode"
                className="text-sm font-medium text-stone-300"
              >
                Sort
              </label>
              <select
                id="sort-mode"
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as SortMode)
                }
                className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-stone-100 outline-none transition focus:border-amber-200/40 focus:bg-white/[0.055]"
              >
                <option value="custom">Custom order</option>
                <option value="date_desc">Date (newest first)</option>
                <option value="date_asc">Date (oldest first)</option>
                <option value="alpha_asc">Alphabetical (A-Z)</option>
                <option value="alpha_desc">Alphabetical (Z-A)</option>
              </select>
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-amber-100/60">
              Total videos shown: {items.length}
            </p>
          </div>

          <form
            onSubmit={addVideoByUrl}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="url"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Add video by YouTube URL"
              className="flex-1 rounded-full border border-white/10 bg-white/[0.035] px-5 py-3 text-sm text-stone-100 placeholder:text-stone-500 outline-none transition focus:border-amber-200/40 focus:bg-white/[0.055]"
              required
            />
            <button
              type="submit"
              disabled={isApplyingEdit}
              className="rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
            >
              Add video
            </button>
          </form>

          {editError && (
            <div className="rounded-2xl border border-red-300/20 bg-red-300/10 px-4 py-3 text-sm text-red-100">
              {editError}
            </div>
          )}

          {editMessage && (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
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
                  className={`grid gap-4 rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-4 shadow-2xl shadow-black/20 transition duration-200 hover:border-amber-200/25 sm:grid-cols-[8rem_1fr_auto] sm:items-center ${
                    watched ? 'opacity-60' : ''
                  }`}
                >
                  <div className="relative aspect-video overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#151512,#0a0a08)] sm:h-20 sm:w-32">
                    <Image
                      src={
                        item.snippet.thumbnails?.medium?.url ||
                        item.snippet.thumbnails?.default?.url ||
                        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNjAgOTBDMTQzLjQzMSA5MCAxMzAgMTAzLjQzMSAxMzAgMTIwQzEzMCAxMzYuNTY5IDE0My40MzEgMTUwIDE2MCAxNTBDMTc2LjU2OSAxNTAgMTkwIDEzNi41NjkgMTkwIDEyMEMxOTAgMTAzLjQzMSAxNzYuNTY5IDkwIDE2MCA5MFoiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTE0MCAxMzBMMTcwIDEyMEwxNDAgMTEwVjEzMFoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo='
                      }
                      alt={item.snippet.title}
                      fill
                      className="object-cover opacity-85"
                    />
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-medium tracking-[-0.02em] text-stone-100">
                      {item.snippet.title}
                    </h3>
                    <p className="mt-1 text-sm text-stone-400">
                      {item.snippet.channelTitle || 'Unknown Channel'}
                    </p>
                    <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-stone-500">
                      {item.snippet.publishedAt
                        ? new Date(
                            item.snippet.publishedAt
                          ).toLocaleDateString()
                        : 'Unknown Date'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {sortMode === 'custom' && (
                      <>
                        <button
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0 || isApplyingEdit}
                          className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-stone-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveItem(index, 1)}
                          disabled={
                            index === items.length - 1 || isApplyingEdit
                          }
                          className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-stone-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                          title="Move down"
                        >
                          ↓
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => toggleWatched(videoId, watched)}
                      className={`rounded-full border px-3 py-2 transition ${
                        watched
                          ? 'border-emerald-200/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15'
                          : 'border-white/10 bg-white/[0.035] text-stone-300 hover:bg-white/[0.06]'
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
                      className="rounded-full border border-red-300/20 bg-red-300/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-300/15 disabled:opacity-50"
                      title="Remove from this playlist view"
                    >
                      Remove
                    </button>

                    <Link
                      href={`/watch/${videoId}?playlistId=${playlistId}`}
                      className="rounded-full bg-stone-100 px-5 py-2 text-sm font-medium text-stone-950 transition hover:bg-white"
                    >
                      Watch
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 px-6 py-14 text-center">
            <h3 className="text-lg font-medium text-stone-100 mb-2">
              No videos found
            </h3>
            <p className="text-stone-400">
              This playlist appears to be empty or all items were removed.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
