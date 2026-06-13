'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Logo from '@/components/Logo';

interface Playlist {
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
  };
  contentDetails: {
    itemCount: number;
  };
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [hiddenPlaylistIds, setHiddenPlaylistIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      setIsLoading(false);

      // Check for token refresh errors
      if ((session as any)?.error === 'RefreshAccessTokenError') {
        setError('Your session has expired. Please sign in again.');
      }
    }
  }, [status, session]);

  // Fetch playlists and hidden playlists when session is available
  useEffect(() => {
    if ((session as any)?.accessToken) {
      fetchPlaylists();
      fetchHiddenPlaylists();
    }
  }, [session]);

  const fetchPlaylists = async (query = '') => {
    setIsLoadingPlaylists(true);
    try {
      const params = new URLSearchParams();
      if (query) {
        params.append('q', query);
      }

      const response = await fetch(`/api/playlists?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }

      const data = await response.json();
      setPlaylists(data.playlists || []);
    } catch (error) {
      console.error('Error fetching playlists:', error);
      setError('Failed to load playlists');
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const fetchHiddenPlaylists = async () => {
    try {
      const response = await fetch('/api/hidden-playlists');
      if (!response.ok) {
        throw new Error('Failed to fetch hidden playlists');
      }

      const data = await response.json();
      setHiddenPlaylistIds(data.hiddenPlaylistIds || []);
    } catch (error) {
      console.error('Error fetching hidden playlists:', error);
    }
  };

  const togglePlaylistVisibility = async (
    playlistId: string,
    currentlyHidden: boolean
  ) => {
    try {
      const response = await fetch('/api/hidden-playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlistId,
          hidden: !currentlyHidden,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update playlist visibility');
      }

      // Update local state
      if (currentlyHidden) {
        setHiddenPlaylistIds((prev) => prev.filter((id) => id !== playlistId));
      } else {
        setHiddenPlaylistIds((prev) => [...prev, playlistId]);
      }
    } catch (error) {
      console.error('Error updating playlist visibility:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPlaylists(searchQuery);
  };

  // Filter playlists based on visibility preference
  const visiblePlaylists = playlists.filter((playlist) =>
    showHidden
      ? hiddenPlaylistIds.includes(playlist.id)
      : !hiddenPlaylistIds.includes(playlist.id)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-amber-200"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center px-5">
        <div className="rounded-[2rem] border border-white/10 bg-[#10100d]/90 p-8 text-center shadow-2xl shadow-black/50">
          <h1 className="text-2xl font-medium tracking-[-0.03em] text-stone-50 mb-4">
            Access Denied
          </h1>
          <p className="text-stone-400">
            Please sign in to access the dashboard.
          </p>
        </div>
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
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="rounded-full bg-stone-100 px-5 py-2.5 text-sm font-medium text-stone-950 transition hover:bg-white"
          >
            Sign out
          </button>
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
            <Logo size="lg" variant="white" showText={true} />
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-amber-100/80 sm:inline-flex">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-3 sm:flex">
              {session.user?.image && (
                <Image
                  className="h-8 w-8 rounded-full border border-white/10"
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={32}
                  height={32}
                />
              )}
              <span className="max-w-36 truncate text-sm font-medium text-stone-300">
                {session.user?.name}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-stone-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="mb-9 max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-100/70">
            YouTube practice library
          </p>
          <h1 className="mt-4 text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-5xl">
            Choose a playlist and turn it into focused reps.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-400">
            Your imported YouTube playlists now live in the same calm practice
            room as the landing page.
          </p>
        </section>

        {/* Search and Visibility Controls */}
        <div className="mb-8 rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:p-5">
          {/* Search Bar */}
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search playlists..."
              className="flex-1 rounded-full border border-white/10 bg-white/[0.035] px-5 py-3 text-sm text-stone-100 placeholder:text-stone-500 outline-none transition focus:border-amber-200/40 focus:bg-white/[0.055]"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
              }}
            />
            <button
              type="submit"
              disabled={isLoadingPlaylists}
              className="rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingPlaylists ? 'Searching...' : 'Search'}
            </button>
          </form>

          {/* Visibility Toggle */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowHidden(false)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                !showHidden
                  ? 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/25'
                  : 'bg-white/[0.035] text-stone-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-stone-100'
              }`}
            >
              Visible Playlists (
              {
                playlists.filter((p) => !hiddenPlaylistIds.includes(p.id))
                  .length
              }
              )
            </button>
            <button
              onClick={() => setShowHidden(true)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                showHidden
                  ? 'bg-amber-300/15 text-amber-100 ring-1 ring-amber-200/25'
                  : 'bg-white/[0.035] text-stone-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-stone-100'
              }`}
            >
              Hidden Playlists ({hiddenPlaylistIds.length})
            </button>
          </div>
        </div>

        {/* Playlists Grid */}
        {isLoadingPlaylists ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-200"></div>
          </div>
        ) : visiblePlaylists.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visiblePlaylists.map((playlist) => {
              const isHidden = hiddenPlaylistIds.includes(playlist.id);
              return (
                <div
                  key={playlist.id}
                  className={`group overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 shadow-2xl shadow-black/30 transition duration-200 hover:-translate-y-0.5 hover:border-amber-200/25 ${
                    isHidden ? 'opacity-60' : ''
                  }`}
                >
                  <Link href={`/p/${playlist.id}`}>
                    <div className="relative aspect-video bg-[linear-gradient(135deg,#151512,#0a0a08)]">
                      <Image
                        src={playlist.snippet.thumbnails.medium.url}
                        alt={playlist.snippet.title}
                        fill
                        className="object-cover opacity-85 transition duration-200 group-hover:opacity-100"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    </div>
                    <div className="p-5">
                      <h3 className="line-clamp-2 font-medium tracking-[-0.02em] text-stone-100">
                        {playlist.snippet.title}
                      </h3>
                      <p className="mt-3 text-sm text-stone-400">
                        {playlist.snippet.channelTitle}
                      </p>
                      <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-amber-100/60">
                        {playlist.contentDetails.itemCount} videos
                      </p>
                    </div>
                  </Link>

                  {/* Hide/Show Toggle Button */}
                  <div className="px-5 pb-5">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        togglePlaylistVisibility(playlist.id, isHidden);
                      }}
                      className={`w-full rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                        isHidden
                          ? 'border-emerald-200/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15'
                          : 'border-white/10 bg-white/[0.035] text-stone-300 hover:bg-white/[0.06] hover:text-stone-100'
                      }`}
                      title={isHidden ? 'Show playlist' : 'Hide playlist'}
                    >
                      {isHidden ? 'Show Playlist' : 'Hide Playlist'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 px-6 py-14 text-center">
            <h3 className="text-lg font-medium text-stone-100 mb-2">
              {showHidden ? 'No hidden playlists' : 'No playlists found'}
            </h3>
            <p className="text-stone-400">
              {searchQuery
                ? 'Try a different search term.'
                : showHidden
                  ? "You haven't hidden any playlists yet."
                  : "You don't have any playlists yet."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
